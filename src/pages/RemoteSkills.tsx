import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Server, RefreshCw, AlertCircle, Loader2, Download, Trash2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import { EmptyState } from '../components/EmptyState';
import {
  formatRemoteTarget,
  normalizeUserPlatformSettings,
  remoteToPayload,
  type PlatformConfig
} from '../config/platforms';

interface RemoteSkillInfo {
  name: string;
  description: string | null;
}

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

export function RemoteSkills() {
  const { platformId } = useParams();
  const [platform, setPlatform] = useState<PlatformConfig | null>(null);
  const [skills, setSkills] = useState<RemoteSkillInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

  const fetchRemoteSkills = async (target: PlatformConfig) => {
    if (!target.remote) return;
    setLoading(true);
    setError('');
    try {
      const result = await invoke<RemoteSkillInfo[]>('list_remote_skills', {
        remote: remoteToPayload(target.remote),
        remotePath: target.remote.remotePath,
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

  const handleImport = async (e: React.MouseEvent, skillName: string) => {
    e.stopPropagation();
    if (!platform?.remote || importing.has(skillName)) return;

    setImporting(prev => new Set(prev).add(skillName));
    try {
      let dataPath = localStorage.getItem('skillhub-data-path');
      if (!dataPath) {
        const baseDir = await appDataDir();
        dataPath = await join(baseDir, 'SkillsHub');
      }

      await invoke<string>('import_remote_skill', {
        dataPath,
        remote: remoteToPayload(platform.remote),
        remotePath: platform.remote.remotePath,
        skillName,
      });

      window.dispatchEvent(new CustomEvent('skills-updated'));
      alert(`已将「${skillName}」导入到我的 Skills。`);
    } catch (err) {
      alert(`导入失败: ${err}`);
    } finally {
      setImporting(prev => {
        const next = new Set(prev);
        next.delete(skillName);
        return next;
      });
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
          正在连接 {platform.remote.host} ...
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
          {skills.map((skill) => (
            <div key={skill.name} className="skill-card" style={{ cursor: 'default' }}>
              <div className="skill-card-header">
                <div className="skill-card-icon">
                  {skill.name.charAt(0).toUpperCase()}
                </div>
                <div className="skill-card-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="skill-action-btn focus:outline-none"
                    title="导入到我的 Skills"
                    style={{ outline: 'none' }}
                    disabled={importing.has(skill.name)}
                    onClick={(e) => handleImport(e, skill.name)}
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
