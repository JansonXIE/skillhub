import { useState, useEffect } from 'react';
import { Plus, Trash2, GitBranch, Server, Check, X, Database } from 'lucide-react';

export interface RepoConfig {
  id: string;
  name: string;
  url: string;
  branch: string;
}

export function RepoSettings() {
  const [repos, setRepos] = useState<RepoConfig[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newRepo, setNewRepo] = useState<Partial<RepoConfig>>({ branch: 'main' });
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('skillhub-repos');
    if (saved) {
      try {
        setRepos(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse repos', e);
      }
    }
  }, []);

  const saveRepos = (newRepos: RepoConfig[]) => {
    setRepos(newRepos);
    localStorage.setItem('skillhub-repos', JSON.stringify(newRepos));
    window.dispatchEvent(new Event('repos-updated'));
  };

  const handleAdd = () => {
    if (!newRepo.url || !newRepo.branch) return;
    
    let finalName = newRepo.name?.trim();
    if (!finalName) {
      const parts = newRepo.url.split('/');
      let lastPart = parts[parts.length - 1] || 'Unknown Repo';
      finalName = lastPart.replace('.git', '');
    }
    
    const repo: RepoConfig = {
      id: Date.now().toString(),
      name: finalName,
      url: newRepo.url,
      branch: newRepo.branch
    };
    
    saveRepos([...repos, repo]);
    setIsAdding(false);
    setNewRepo({ branch: 'main' });
  };

  const handleDelete = (id: string) => {
    saveRepos(repos.filter(r => r.id !== id));
  };

  const isGithub = (url: string) => url.toLowerCase().includes('github.com');

  const styles = {
    card: {
      backgroundColor: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: '16px',
      padding: '32px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.02), 0 1px 3px rgba(0, 0, 0, 0.01)',
      maxWidth: '720px',
      marginTop: '24px',
    },
    title: {
      fontSize: '20px',
      fontWeight: '700',
      color: '#1e293b',
      marginBottom: '28px',
    },
    row: {
      display: 'flex',
      alignItems: 'center',
      marginBottom: '20px',
    },
    label: {
      width: '160px',
      fontSize: '15px',
      fontWeight: '500',
      color: '#1e293b',
    },
    input: (isFocused: boolean) => ({
      flex: 1,
      height: '46px',
      borderRadius: '12px',
      border: isFocused ? '1.5px solid #3b82f6' : '1.5px solid #cbd5e1',
      padding: '0 16px',
      fontSize: '14px',
      color: '#0f172a',
      backgroundColor: '#ffffff',
      outline: 'none',
      transition: 'all 0.15s ease',
      boxShadow: isFocused ? '0 0 0 3px rgba(59, 130, 246, 0.1)' : 'none',
    }),
    actions: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '12px',
      marginTop: '32px',
    },
    btnCancel: {
      backgroundColor: '#f1f5f9',
      color: '#475569',
      border: 'none',
      borderRadius: '12px',
      padding: '10px 20px',
      fontSize: '14px',
      fontWeight: '500',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      cursor: 'pointer',
      transition: 'background-color 0.15s ease',
    },
    btnSave: (disabled: boolean) => ({
      backgroundColor: disabled ? '#93c5fd' : '#3b82f6',
      color: '#ffffff',
      border: 'none',
      borderRadius: '12px',
      padding: '10px 24px',
      fontSize: '14px',
      fontWeight: '500',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'background-color 0.15s ease',
      boxShadow: disabled ? 'none' : '0 2px 4px rgba(59, 130, 246, 0.1)',
    }),
  };

  return (
    <div className="settings-section fade-in max-w-4xl">
      <h2 className="settings-title">代码仓库设置</h2>
      <h3 className="settings-subtitle">配置用于保存 Skill 目录的 GitHub 或 Gerrit 仓库</h3>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {repos.map((repo) => (
          <div key={repo.id} className="settings-card flex items-center justify-between group" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)', marginBottom: '16px' }}>
            <div className="flex items-center">
              <div className="settings-card-icon">
                {isGithub(repo.url) ? <GitBranch size={20} className="text-secondary" /> : <Server size={20} className="text-secondary" />}
              </div>
              <div className="settings-card-info">
                <div className="settings-card-title">{repo.name}</div>
                <div className="settings-card-desc flex items-center gap-3 mt-1" style={{ display: 'flex', alignItems: 'center' }}>
                  <span className="truncate max-w-[400px]" title={repo.url}>{repo.url}</span>
                  <span className="px-2 py-0.5 rounded-full bg-secondary/10 text-xs" style={{ color: 'var(--text-secondary)', display: 'inline-block', fontSize: '11px' }}>
                    {repo.branch}
                  </span>
                </div>
              </div>
            </div>
            <button 
              className="ai-icon-btn ai-icon-btn-danger"
              onClick={() => handleDelete(repo.id)}
              title="删除"
              style={{ outline: 'none' }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        {repos.length === 0 && !isAdding && (
          <div className="flex flex-col items-center justify-center py-20">
            <Database size={48} className="text-secondary opacity-80 mb-4" strokeWidth={1.5} />
            <p className="text-secondary mb-6 text-base">暂无配置的代码仓库</p>
            <button 
              className="btn btn-primary flex items-center gap-2 px-6 py-2 rounded-lg shadow-sm focus:outline-none"
              onClick={() => setIsAdding(true)}
              style={{ outline: 'none' }}
            >
              <Plus size={18} />
              <span className="font-medium">添加仓库</span>
            </button>
          </div>
        )}

        {repos.length > 0 && !isAdding && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '28px', marginBottom: '12px' }}>
            <button 
              className="btn btn-primary flex items-center gap-2 px-6 py-2 rounded-lg shadow-sm focus:outline-none"
              onClick={() => setIsAdding(true)}
              style={{ outline: 'none' }}
            >
              <Plus size={18} />
              <span className="font-medium">添加仓库</span>
            </button>
          </div>
        )}

        {isAdding && (
          <div style={styles.card}>
            <h3 style={styles.title}>添加新仓库</h3>
            
            <div>
              <div style={styles.row}>
                <label style={styles.label}>仓库名称</label>
                <input
                  type="text"
                  style={styles.input(focusedField === 'name')}
                  placeholder="例如：我的测试仓库"
                  value={newRepo.name || ''}
                  onChange={(e) => setNewRepo({...newRepo, name: e.target.value})}
                  onFocus={() => setFocusedField('name')}
                  onBlur={() => setFocusedField(null)}
                  autoFocus
                />
              </div>
              
              <div style={styles.row}>
                <label style={styles.label}>仓库地址 (Git URL)</label>
                <input
                  type="text"
                  style={styles.input(focusedField === 'url')}
                  placeholder="例如：https://github.com/YourUsername/RepositoryName"
                  value={newRepo.url || ''}
                  onChange={(e) => setNewRepo({...newRepo, url: e.target.value})}
                  onFocus={() => setFocusedField('url')}
                  onBlur={() => setFocusedField(null)}
                />
              </div>
              
              <div style={styles.row}>
                <label style={styles.label}>默认分支</label>
                <input
                  type="text"
                  style={styles.input(focusedField === 'branch')}
                  placeholder="main"
                  value={newRepo.branch || ''}
                  onChange={(e) => setNewRepo({...newRepo, branch: e.target.value})}
                  onFocus={() => setFocusedField('branch')}
                  onBlur={() => setFocusedField(null)}
                />
              </div>
            </div>
            
            <div style={styles.actions}>
              <button 
                style={styles.btnCancel}
                onClick={() => setIsAdding(false)}
              >
                <X size={16} />
                <span>取消</span>
              </button>
              <button 
                style={styles.btnSave(!newRepo.url || !newRepo.branch)}
                onClick={handleAdd}
                disabled={!newRepo.url || !newRepo.branch}
              >
                <Check size={16} />
                <span>保存</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
