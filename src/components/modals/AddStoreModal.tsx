import { useState } from 'react';
import { Store, X, Loader2, AlertCircle, Link as LinkIcon, Server, GitBranch } from 'lucide-react';
import { parseGitHubUrl, detectRepoStructure, fetchSkillsFromRepo } from '../../utils/github';
import { parseGerritUrl, isGerritUrl, generateStoreId, fetchStoreSkills, detectGerritStructure } from '../../utils/storeRepo';
import type { StoreRepo } from '../../types/store';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAdded: (repo: StoreRepo) => void;
}

export function AddStoreModal({ isOpen, onClose, onAdded }: Props) {
  const [url, setUrl] = useState('');
  const [customName, setCustomName] = useState('');
  const [repoType, setRepoType] = useState<'github' | 'gerrit'>('github');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setError('');
    const trimmedUrl = url.trim();

    // Check for duplicates
    const stored = localStorage.getItem('skillhub-store-repos');
    const existing: StoreRepo[] = stored ? JSON.parse(stored) : [];
    if (existing.some(r => r.url === trimmedUrl)) {
      setError('该仓库已添加');
      return;
    }

    setLoading(true);
    try {
      if (repoType === 'github') {
        const parsed = parseGitHubUrl(trimmedUrl);
        if (!parsed) {
          setError('无效的 GitHub URL，请输入格式如：https://github.com/owner/repo');
          setLoading(false);
          return;
        }

        const skillsPath = await detectRepoStructure(parsed.owner, parsed.repo);
        const skills = await fetchSkillsFromRepo(parsed.owner, parsed.repo, skillsPath);

        const newRepo: StoreRepo = {
          id: generateStoreId('github', `${parsed.owner}/${parsed.repo}`),
          type: 'github',
          owner: parsed.owner,
          repo: parsed.repo,
          name: customName.trim() || parsed.repo,
          url: trimmedUrl,
          branch: 'main',
          skillsPath,
          skillCount: skills.length,
        };

        const updated = [...existing, newRepo];
        localStorage.setItem('skillhub-store-repos', JSON.stringify(updated));
        window.dispatchEvent(new Event('store-repos-updated'));
        onAdded(newRepo);
        setUrl('');
        setCustomName('');
        setRepoType('github');
        onClose();
      } else {
        // Gerrit / git-based repos
        const parsed = parseGerritUrl(trimmedUrl);
        if (!parsed) {
          setError('无效的仓库 URL，请输入格式如：ssh://user@host:port/project');
          setLoading(false);
          return;
        }

        const repoName = customName.trim() || parsed.project.split('/').pop() || parsed.project;
        const branch = 'master';
        const storeId = generateStoreId('gerrit', `${parsed.host}/${parsed.project}`);

        const skillsPath = await detectGerritStructure(trimmedUrl, branch, storeId);

        // Fetch skills to get count using the new function
        const tempRepo: StoreRepo = {
          id: storeId,
          type: 'gerrit',
          owner: parsed.host,
          repo: parsed.project,
          name: repoName,
          url: trimmedUrl,
          branch,
          sshUser: parsed.user,
          skillsPath,
          skillCount: 0,
        };
        const skills = await fetchStoreSkills(tempRepo);

        const newRepo: StoreRepo = {
          ...tempRepo,
          skillCount: skills.length,
        };

        const updated = [...existing, newRepo];
        localStorage.setItem('skillhub-store-repos', JSON.stringify(updated));
        window.dispatchEvent(new Event('store-repos-updated'));
        onAdded(newRepo);
        setUrl('');
        setCustomName('');
        setRepoType('github');
        onClose();
      }
    } catch (err: any) {
      setError(err.message || err.toString() || '获取仓库信息失败，请检查 URL 是否正确且仓库为公开状态');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading && url.trim()) {
      handleSubmit();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <div className="modal-title">
            <Store size={20} style={{ color: 'var(--color-primary)' }} />
            添加 Skill 商店
          </div>
          <button className="modal-close-btn" onClick={onClose} style={{ outline: 'none' }}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-content">
          <p style={{
            color: 'var(--text-secondary)',
            fontSize: '0.875rem',
            marginBottom: '1.25rem',
            lineHeight: '1.6'
          }}>
            添加 GitHub 或 Gerrit 仓库作为 Skill 商店。支持两种结构：根目录包含 skill 文件夹，或含有 <code style={{
              backgroundColor: 'var(--border-light)',
              padding: '0.1em 0.4em',
              borderRadius: '4px',
              fontSize: '0.8125rem'
            }}>skills/</code> 子目录。
          </p>

          <div className="github-form">
            {/* Repo type selector */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem' }}>
              <button
                type="button"
                onClick={() => setRepoType('github')}
                style={{
                  padding: '8px 20px',
                  borderRadius: '10px',
                  border: repoType === 'github'
                    ? '1.5px solid #3b82f6'
                    : '1.5px solid #cbd5e1',
                  backgroundColor: repoType === 'github' ? '#eff6ff' : '#ffffff',
                  color: repoType === 'github' ? '#3b82f6' : '#64748b',
                  fontWeight: repoType === 'github' ? '600' : '400',
                  fontSize: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  outline: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <GitBranch size={14} />
                GitHub
              </button>
              <button
                type="button"
                onClick={() => setRepoType('gerrit')}
                style={{
                  padding: '8px 20px',
                  borderRadius: '10px',
                  border: repoType === 'gerrit'
                    ? '1.5px solid #f97316'
                    : '1.5px solid #cbd5e1',
                  backgroundColor: repoType === 'gerrit' ? '#fff7ed' : '#ffffff',
                  color: repoType === 'gerrit' ? '#f97316' : '#64748b',
                  fontWeight: repoType === 'gerrit' ? '600' : '400',
                  fontSize: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  outline: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Server size={14} />
                Gerrit
              </button>
            </div>

            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '1rem' }}>
              仓库名称（可选）
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="留空则使用仓库默认名称"
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />

            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '1rem' }}>
              <LinkIcon size={14} />
              {repoType === 'github' ? 'GitHub 仓库 URL' : '仓库 Git URL'}
            </label>
            <input
              type="text"
              className="form-input"
              placeholder={repoType === 'github' ? 'https://github.com/owner/repo' : 'ssh://user@gerrit-ai.sophgo.vip:29418/repo-name'}
              value={url}
              onChange={e => { setUrl(e.target.value); setError(''); }}
              onKeyDown={handleKeyDown}
              autoFocus
              disabled={loading}
            />
            <p className="form-helper">
              {repoType === 'github'
                ? '示例：https://github.com/anthropics/skills'
                : '示例：ssh://jianxing.xie@gerrit-ai.sophgo.vip:29418/bsp-skills-hub'}
            </p>

            {error && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                color: '#ef4444',
                fontSize: '0.8125rem',
                marginBottom: '0.75rem',
                padding: '0.5rem 0.75rem',
                backgroundColor: '#fef2f2',
                borderRadius: '8px',
                border: '1px solid #fecaca',
              }}>
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            <div className="form-actions">
              <button
                className="btn btn-outline"
                onClick={onClose}
                disabled={loading}
                style={{ outline: 'none' }}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={loading || !url.trim()}
                style={{
                  outline: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  minWidth: '100px',
                  justifyContent: 'center',
                }}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="spin-animation" />
                    检测中...
                  </>
                ) : (
                  '添加商店'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}