import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Store as StoreIcon, RefreshCw, Download, ExternalLink, Loader2, Package } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { EmptyState } from '../components/EmptyState';
import { fetchSkillsFromRepo, fetchSkillContent, extractDescription, invalidateRepoCache } from '../utils/github';
import { fetchStoreSkills, importSkillFromStoreRepo } from '../utils/storeRepo';
import type { StoreRepo, StoreSkill } from '../types/store';

export function Store() {
  const { owner, repo } = useParams<{ owner?: string; repo?: string }>();
  const navigate = useNavigate();

  const [storeRepos, setStoreRepos] = useState<StoreRepo[]>([]);
  const [skills, setSkills] = useState<StoreSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [importingSkill, setImportingSkill] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  const highlightSkill = (skillName: string) => {
    setTimeout(() => {
      const card = document.getElementById(`skill-card-${skillName}`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('highlighted-skill-card');
        setTimeout(() => {
          card.classList.remove('highlighted-skill-card');
        }, 4500);
      }
    }, 150);
  };

  // Load store repos from localStorage
  useEffect(() => {
    const loadRepos = () => {
      const stored = localStorage.getItem('skillhub-store-repos');
      if (stored) {
        try {
          setStoreRepos(JSON.parse(stored));
        } catch { /* ignore */ }
      }
    };
    loadRepos();
    window.addEventListener('store-repos-updated', loadRepos);
    return () => window.removeEventListener('store-repos-updated', loadRepos);
  }, []);

  // Determine which repo to display
  const activeRepo = useMemo(() => {
    if (owner && repo) {
      return storeRepos.find(r => {
        if (r.type === 'gerrit') {
          return r.owner === owner && r.repo === repo;
        }
        return r.owner === owner && r.repo === repo;
      }) || null;
    }
    return storeRepos.length > 0 ? storeRepos[0] : null;
  }, [owner, repo, storeRepos]);

  // Fetch skills when activeRepo changes
  useEffect(() => {
    if (!activeRepo) {
      setSkills([]);
      setLoading(false);
      return;
    }

    const loadSkills = async () => {
      setLoading(true);
      try {
        const result = await fetchStoreSkills(activeRepo);
        setSkills(result);
      } catch (error) {
        console.error('Failed to fetch store skills:', error);
        setSkills([]);
      } finally {
        setLoading(false);
      }
    };

    loadSkills();
  }, [activeRepo]);

  useEffect(() => {
    const handleHighlight = (e: Event) => {
      const skillName = (e as CustomEvent).detail?.skillName;
      if (skillName) {
        highlightSkill(skillName);
      }
    };

    window.addEventListener('highlight-skill', handleHighlight);
    return () => {
      window.removeEventListener('highlight-skill', handleHighlight);
    };
  }, []);

  useEffect(() => {
    if (!loading && skills.length > 0) {
      const targetSkill = sessionStorage.getItem('highlight-skill');
      if (targetSkill) {
        highlightSkill(targetSkill);
        sessionStorage.removeItem('highlight-skill');
      }
    }
  }, [loading, skills]);

  // Fetch descriptions in background for displayed skills
  useEffect(() => {
    if (skills.length === 0 || !activeRepo) return;

    const fetchDescs = async () => {
      const newDescriptions: Record<string, string> = { ...descriptions };
      const batch = skills.slice(0, 30);
      const promises = batch.map(async (skill) => {
        const key = `${skill.owner}/${skill.repo}/${skill.path}`;
        if (newDescriptions[key]) return;
        try {
          if (activeRepo.type === 'github') {
            const content = await fetchSkillContent(skill.owner, skill.repo, skill.path);
            newDescriptions[key] = extractDescription(content);
          } else {
            // Gerrit: try fetching via backend
            const { fetchStoreSkillContent } = await import('../utils/storeRepo');
            const content = await fetchStoreSkillContent(activeRepo, skill.path);
            newDescriptions[key] = extractDescription(content);
          }
        } catch {
          newDescriptions[key] = '暂无描述';
        }
      });

      await Promise.allSettled(promises);
      setDescriptions(newDescriptions);
    };

    fetchDescs();
  }, [skills, activeRepo]);

  const handleRefresh = () => {
    if (!activeRepo) return;
    if (activeRepo.type === 'github') {
      invalidateRepoCache(activeRepo.owner, activeRepo.repo);
    }
    setLoading(true);
    fetchStoreSkills(activeRepo)
      .then(result => setSkills(result))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const handleImport = async (e: React.MouseEvent, skill: StoreSkill) => {
    e.stopPropagation();
    if (importingSkill || !activeRepo) return;

    setImportingSkill(skill.name);
    setImportSuccess(null);
    try {
      await importSkillFromStoreRepo(activeRepo, skill.name, skill.path);
      setImportSuccess(skill.name);
      window.dispatchEvent(new CustomEvent('skills-updated'));
      setTimeout(() => setImportSuccess(null), 3000);
    } catch (error: any) {
      alert(`导入失败: ${error.message || error}`);
    } finally {
      setImportingSkill(null);
    }
  };

  // No repos added yet
  if (storeRepos.length === 0 && !loading) {
    return (
      <div className="page-container">
        <div className="page-header">
          <div>
            <div className="page-title">
              <StoreIcon size={24} style={{ color: 'var(--color-primary)' }} />
              <h1 className="text-h1">Skill 商店</h1>
            </div>
            <p className="page-subtitle">探索和发现各种来源的 skills 目录。</p>
          </div>
        </div>
        <EmptyState
          title="暂无商店"
          description="请在左侧边栏点击「+ 添加商店」添加 GitHub 或 Gerrit 仓库。"
        />
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <div className="page-title">
            <StoreIcon size={24} style={{ color: 'var(--color-primary)' }} />
            <h1 className="text-h1">
              {activeRepo ? activeRepo.name : 'Skill 商店'}
            </h1>
            {activeRepo && (
              <span className="badge" style={{
                backgroundColor: '#f1f5f9',
                color: '#64748b',
                fontSize: '0.875rem',
                padding: '0.125rem 0.5rem'
              }}>
                {skills.length}
              </span>
            )}
          </div>
          <p className="page-subtitle">
            {activeRepo
              ? <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>
                    {activeRepo.type === 'github'
                      ? `${activeRepo.owner}/${activeRepo.repo}`
                      : activeRepo.owner}
                  </span>
                  {activeRepo.type === 'github' && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await openUrl(activeRepo.url);
                        } catch {
                          window.open(activeRepo.url, '_blank', 'noopener,noreferrer');
                        }
                      }}
                      style={{
                        color: 'var(--color-primary)',
                        display: 'inline-flex',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        outline: 'none',
                      }}
                    >
                      <ExternalLink size={13} />
                    </button>
                  )}
                  <span style={{
                    fontSize: '10px',
                    fontWeight: '600',
                    padding: '2px 7px',
                    borderRadius: '6px',
                    backgroundColor: activeRepo.type === 'gerrit' ? '#fff7ed' : '#eff6ff',
                    color: activeRepo.type === 'gerrit' ? '#f97316' : '#3b82f6',
                    border: `1px solid ${activeRepo.type === 'gerrit' ? '#fed7aa' : '#bfdbfe'}`,
                    letterSpacing: '0.02em',
                  }}>
                    {activeRepo.type === 'gerrit' ? 'Gerrit' : 'GitHub'}
                  </span>
                </span>
              : '探索和发现各种来源的 skills 目录。'
            }
          </p>
        </div>

        <div className="action-bar">
          {activeRepo && (
            <button
              className="btn-icon btn-outline"
              style={{ padding: '0.5rem 0.75rem', outline: 'none' }}
              onClick={handleRefresh}
              title="刷新"
            >
              <RefreshCw size={16} />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '300px',
          gap: '1rem',
          color: 'var(--text-secondary)',
        }}>
          <Loader2 size={32} className="spin-animation" style={{ color: 'var(--color-primary)' }} />
          <span>正在加载 Skills...</span>
        </div>
      ) : skills.length === 0 ? (
        <EmptyState
          title={'暂无 Skills'}
          description={'该仓库中没有找到 skill 目录'}
        />
      ) : (
        <div className="skills-grid">
          {skills.map((skill) => {
            const descKey = `${skill.owner}/${skill.repo}/${skill.path}`;
            const isImporting = importingSkill === skill.name;
            const justImported = importSuccess === skill.name;

            return (
              <div
                key={skill.name}
                id={`skill-card-${skill.name}`}
                className="skill-card hover-pointer"
                onClick={() => navigate(`/store/${skill.owner}/${skill.repo}/${skill.name}`)}
              >
                <div className="skill-card-header">
                  <div className="flex items-center gap-3">
                    <div className="skill-card-icon" style={{
                      background: 'linear-gradient(135deg, var(--color-primary), #6366f1)',
                      color: 'white',
                    }}>
                      {skill.name.charAt(0).toUpperCase()}
                    </div>
                  </div>
                  <div className="skill-card-actions" style={{ opacity: 1 }}>
                    <button
                      className="skill-action-btn"
                      title={justImported ? '已导入' : '导入到我的 Skills'}
                      onClick={(e) => handleImport(e, skill)}
                      disabled={isImporting}
                      style={{
                        outline: 'none',
                        color: justImported ? '#10b981' : undefined,
                      }}
                    >
                      {isImporting ? (
                        <Loader2 size={14} className="spin-animation" />
                      ) : justImported ? (
                        <Package size={14} />
                      ) : (
                        <Download size={14} />
                      )}
                    </button>
                  </div>
                </div>

                <h3 className="skill-card-title">{skill.name}</h3>
                <p className="skill-card-desc">
                  {descriptions[descKey] || '加载描述中...'}
                </p>

                <div style={{
                  marginTop: 'auto',
                  paddingTop: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}>
                  <span style={{
                    fontSize: '0.6875rem',
                    padding: '0.125rem 0.5rem',
                    borderRadius: '9999px',
                    backgroundColor: 'rgba(99, 102, 241, 0.08)',
                    color: '#6366f1',
                    fontWeight: 500,
                  }}>
                    {activeRepo?.type === 'github'
                      ? `${skill.owner}/${skill.repo}`
                      : activeRepo?.name || skill.owner}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}