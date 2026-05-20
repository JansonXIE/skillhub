import { useState } from 'react';
import { Store, X, Loader2, AlertCircle, Link as LinkIcon } from 'lucide-react';
import { parseGitHubUrl, detectRepoStructure, fetchSkillsFromRepo } from '../../utils/github';
import type { StoreRepo } from '../../types/store';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAdded: (repo: StoreRepo) => void;
}

export function AddStoreModal({ isOpen, onClose, onAdded }: Props) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setError('');
    const parsed = parseGitHubUrl(url);
    if (!parsed) {
      setError('无效的 GitHub URL，请输入格式如：https://github.com/owner/repo');
      return;
    }

    // Check for duplicates
    const stored = localStorage.getItem('skillhub-store-repos');
    const existing: StoreRepo[] = stored ? JSON.parse(stored) : [];
    if (existing.some(r => r.owner === parsed.owner && r.repo === parsed.repo)) {
      setError('该仓库已添加');
      return;
    }

    setLoading(true);
    try {
      // Detect repo structure
      const skillsPath = await detectRepoStructure(parsed.owner, parsed.repo);

      // Fetch skills to get count
      const skills = await fetchSkillsFromRepo(parsed.owner, parsed.repo, skillsPath);

      const newRepo: StoreRepo = {
        id: Date.now().toString(),
        owner: parsed.owner,
        repo: parsed.repo,
        name: parsed.repo,
        url: url.trim(),
        skillsPath,
        skillCount: skills.length,
      };

      const updated = [...existing, newRepo];
      localStorage.setItem('skillhub-store-repos', JSON.stringify(updated));
      window.dispatchEvent(new Event('store-repos-updated'));

      onAdded(newRepo);
      setUrl('');
      onClose();
    } catch (err: any) {
      setError(err.message || '获取仓库信息失败，请检查 URL 是否正确且仓库为公开状态');
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
            添加一个 GitHub 仓库作为 Skill 商店。支持两种结构：根目录包含 skill 文件夹，或含有 <code style={{ 
              backgroundColor: 'var(--border-light)', 
              padding: '0.1em 0.4em', 
              borderRadius: '4px',
              fontSize: '0.8125rem'
            }}>skills/</code> 子目录。
          </p>

          <div className="github-form">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <LinkIcon size={14} />
              GitHub 仓库 URL
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="https://github.com/owner/repo"
              value={url}
              onChange={e => { setUrl(e.target.value); setError(''); }}
              onKeyDown={handleKeyDown}
              autoFocus
              disabled={loading}
            />
            <p className="form-helper">
              示例：https://github.com/anthropics/skills
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
