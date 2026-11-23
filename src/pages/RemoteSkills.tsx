import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Server, RefreshCw, AlertCircle, Loader2, Download, Trash2, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import { EmptyState } from '../components/EmptyState';
import {
  formatRemoteTarget,
  normalizeUserPlatformSettings,
  remoteToPayload,
  type PlatformConfig
} from '../config/platforms';

/** Mirrors the Rust `SyncStatus` enum (serde camelCase). */
type SyncStatus =
  | 'notImported'
  | 'noBaseline'
  | 'inSync'
  | 'remoteUpdated'
  | 'localUpdated'
  | 'conflict';

interface RemoteSkillOverview {
  name: string;
  description: string | null;
  status: SyncStatus;
  remote_hash: string;
  local_hash: string | null;
  last_synced_at: number | null;
}

interface ImportOutcome {
  status: SyncStatus;
  skill_name: string;
  message: string;
}

const STATUS_META: Record<SyncStatus, { label: string; color: string; background: string }> = {
  notImported: { label: '未导入', color: '#64748b', background: '#f1f5f9' },
  noBaseline: { label: '未同步', color: '#64748b', background: '#f1f5f9' },
  inSync: { label: '已同步', color: '#15803d', background: '#dcfce7' },
  remoteUpdated: { label: '服务器有更新', color: '#1d4ed8', background: '#dbeafe' },
  localUpdated: { label: '本地有更新', color: '#c2410c', background: '#ffedd5' },
  conflict: { label: '冲突', color: '#b91c1c', background: '#fee2e2' },
};

function loadRemotePlatform(platformId: string | undefined): PlatformConfig | null {
  if (!platformId) return null;
  try {
    const stored = localStorage.getItem('skillhub-platforms-config');
    if (!stored) return null;
    const settings = normalizeUserPlatformSettings(JSON.parse(stored));
    return settings.customPlatforms.find(p => p.id === platformId && p.remote) || null;
  } catch (e) {
    console.error('Failed to parse platform settings', e);
    return null;
  }
}

async function resolveDataPath(): Promise<string> {
  const stored = localStorage.getItem('skillhub-data-path');
  if (stored) return stored;
  const baseDir = await appDataDir();
  return join(baseDir, 'SkillsHub');
}

export function RemoteSkills() {
  const { platformId } = useParams();
  const [platform, setPlatform] = useState<PlatformConfig | null>(null);
  const [skills, setSkills] = useState<RemoteSkillOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [conflictSkill, setConflictSkill] = useState<RemoteSkillOverview | null>(null);

  const fetchRemoteSkills = async (target: PlatformConfig) => {
    if (!target.remote) return;
    setLoading(true);
    setError('');
    try {
      const dataPath = await resolveDataPath();
      const result = await invoke<RemoteSkillOverview[]>('get_remote_sync_overview', {
        dataPath,
        remote: remoteToPayload(target.remote),
        remotePath: target.remote.remotePath,
        platformId: target.id,
      });
      setSkills(result);
    } catch (err) {
      setError(String(err));
      setSkills([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const target = loadRemotePlatform(platformId);
    setPlatform(target);
    if (target) {
      fetchRemoteSkills(target);
    } else {
      setLoading(false);
    }
  }, [platformId]);

  const runPull = async (skill: RemoteSkillOverview, mode: 'refuse' | 'overwrite' | 'saveAsNew') => {
    if (!platform?.remote) return;

    setImporting(prev => new Set(prev).add(skill.name));
    try {
      const dataPath = await resolveDataPath();
      const outcome = await invoke<ImportOutcome>('import_remote_skill', {
        dataPath,
        remote: remoteToPayload(platform.remote),
        remotePath: platform.remote.remotePath,
        skillName: skill.name,
        platformId: platform.id,
        mode,
        // Used by saveAsNew to build `<name>@<tag>`
        variantTag: platform.name,
      });

      window.dispatchEvent(new CustomEvent('skills-updated'));
      alert(outcome.message);
      await fetchRemoteSkills(platform);
    } catch (err) {
      alert(`拉取失败: ${err}`);
    } finally {
      setImporting(prev => {
        const next = new Set(prev);
        next.delete(skill.name);
        return next;
      });
    }
  };

  const handlePull = async (e: React.MouseEvent, skill: RemoteSkillOverview) => {
    e.stopPropagation();
    if (!platform?.remote || importing.has(skill.name)) return;

    switch (skill.status) {
      case 'notImported':
        // Nothing to lose locally.
        return runPull(skill, 'refuse');

      case 'inSync':
        alert(`「${skill.name}」与服务器上的一致，无需拉取。`);
        return;

      case 'remoteUpdated':
        // Only the server moved since the last sync — pull without asking.
        return runPull(skill, 'refuse');

      case 'localUpdated': {
        const confirmed = window.confirm(
          `本地「${skill.name}」自上次同步后有过修改，拉取会用服务器上的版本覆盖这些改动。\n\n确定继续？`
        );
        return confirmed ? runPull(skill, 'overwrite') : undefined;
      }

      case 'noBaseline':
      case 'conflict':
      default:
        // Both sides carry changes, or we have no record of a previous sync:
        // the user picks what happens.
        setConflictSkill(skill);
    }
  };

  const handleDelete = async (e: React.MouseEvent, skillName: string) => {
    e.stopPropagation();
    if (!platform?.remote || deleting.has(skillName)) return;

    const confirmed = window.confirm(
      `确定要从服务器 ${platform.remote.host} 删除技能「${skillName}」吗？此操作不可逆，服务器上的该目录会被整个删除。`
    );
    if (!confirmed) return;

    setDeleting(prev => new Set(prev).add(skillName));
    try {
      await invoke<string>('delete_remote_skill', {
        remote: remoteToPayload(platform.remote),
        remotePath: platform.remote.remotePath,
        skillName,
      });

      setSkills(prev => prev.filter(s => s.name !== skillName));
      window.dispatchEvent(new CustomEvent('skills-updated'));
      alert(`已从服务器删除「${skillName}」。`);
    } catch (err) {
      alert(`删除失败: ${err}`);
    } finally {
      setDeleting(prev => {
        const next = new Set(prev);
        next.delete(skillName);
        return next;
      });
    }
  };

  if (!platform || !platform.remote) {
    return (
      <div className="page-container">
        <EmptyState
          title="远程目录不存在"
          description="该远程目录可能已被删除，请在 设置 - Skill 存放目录 中检查配置"
        />
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <div className="page-title">
            <Server size={24} className="text-primary" style={{ color: 'var(--color-primary)' }} />
            <h1 className="text-h1">{platform.name}</h1>
            <span className="badge" style={{ backgroundColor: '#f1f5f9', color: '#64748b', fontSize: '0.875rem', padding: '0.125rem 0.5rem' }}>
              {loading ? '...' : skills.length}
            </span>
          </div>
          <p className="page-subtitle">
            服务器上已部署的 skills：{formatRemoteTarget(platform.remote)}
          </p>
        </div>

        <div className="action-bar">
          <button
            className="btn-icon btn-outline"
            style={{ padding: '0.5rem 0.75rem', outline: 'none' }}
            title="刷新"
            disabled={loading}
            onClick={() => fetchRemoteSkills(platform)}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12 text-secondary" style={{ gap: '8px' }}>
          <Loader2 size={18} className="animate-spin" />
          正在连接 {platform.remote.host} 并比对内容 ...
        </div>
      ) : error ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.5rem',
            color: '#ef4444',
            fontSize: '0.875rem',
            padding: '1rem 1.25rem',
            backgroundColor: '#fef2f2',
            borderRadius: '12px',
            border: '1px solid #fecaca',
            wordBreak: 'break-all',
          }}
        >
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>无法获取远程 skills</div>
            <div>{error}</div>
          </div>
        </div>
      ) : skills.length === 0 ? (
        <EmptyState
          title="远程目录为空"
          description="该服务器上还没有部署任何 skill，可在「我的 Skills」中选择技能同步到此平台"
        />
      ) : (
        <div className="skills-grid">
          {skills.map((skill) => {
            const meta = STATUS_META[skill.status];
            return (
              <div key={skill.name} className="skill-card" style={{ cursor: 'default' }}>
                <div className="skill-card-header">
                  <div className="skill-card-icon">
                    {skill.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="skill-card-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="skill-action-btn focus:outline-none"
                      title={
                        skill.status === 'inSync'
                          ? '与服务器一致'
                          : skill.status === 'remoteUpdated'
                            ? '拉取服务器上的更新'
                            : '拉取到我的 Skills'
                      }
                      style={{ outline: 'none' }}
                      disabled={importing.has(skill.name)}
                      onClick={(e) => handlePull(e, skill)}
                    >
                      {importing.has(skill.name)
                        ? <Loader2 size={14} className="animate-spin" />
                        : <Download size={14} />}
                    </button>
                    <button
                      className="skill-action-btn focus:outline-none"
                      title="从服务器删除"
                      style={{ outline: 'none' }}
                      disabled={deleting.has(skill.name)}
                      onClick={(e) => handleDelete(e, skill.name)}
                    >
                      {deleting.has(skill.name)
                        ? <Loader2 size={14} className="animate-spin" />
                        : <Trash2 size={14} />}
                    </button>
                  </div>
                </div>

                <h3 className="skill-card-title">{skill.name}</h3>

                <p className="skill-card-desc">
                  {skill.description || '暂无描述'}
                </p>

                <div style={{ marginTop: '10px' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: '999px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: meta.color,
                      backgroundColor: meta.background,
                    }}
                  >
                    {meta.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {conflictSkill && platform.remote && (
        <div className="modal-overlay active" onClick={() => setConflictSkill(null)}>
          <div
            className="modal-container fade-in"
            style={{ maxWidth: '520px' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header" style={{ padding: '20px 24px' }}>
              <div className="flex items-center justify-between w-full">
                <h3 className="modal-title" style={{ fontSize: '1.125rem', fontWeight: 700 }}>
                  如何处理「{conflictSkill.name}」？
                </h3>
                <button className="modal-close-btn" style={{ outline: 'none' }} onClick={() => setConflictSkill(null)}>
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="modal-body" style={{ padding: '0 24px 20px 24px' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.6, textAlign: 'left' }}>
                {conflictSkill.status === 'conflict'
                  ? '本地与服务器上的版本自上次同步后都有改动，无法自动判断该保留哪一份。'
                  : '本地已存在同名技能，但没有同步记录，无法判断哪一份更新。'}
              </p>
            </div>

            <div className="modal-footer" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--color-border)' }}>
              <button
                className="btn btn-secondary"
                style={{ outline: 'none', padding: '8px 20px', borderRadius: '8px', fontSize: '0.875rem' }}
                onClick={() => setConflictSkill(null)}
              >
                取消
              </button>
              <button
                className="btn btn-secondary"
                style={{ outline: 'none', padding: '8px 20px', borderRadius: '8px', fontSize: '0.875rem' }}
                onClick={() => {
                  const skill = conflictSkill;
                  setConflictSkill(null);
                  runPull(skill, 'saveAsNew');
                }}
              >
                另存为 {conflictSkill.name}@{platform.name}
              </button>
              <button
                className="btn btn-primary"
                style={{ outline: 'none', padding: '8px 20px', borderRadius: '8px', fontSize: '0.875rem' }}
                onClick={() => {
                  const skill = conflictSkill;
                  setConflictSkill(null);
                  runPull(skill, 'overwrite');
                }}
              >
                用服务器版本覆盖
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
