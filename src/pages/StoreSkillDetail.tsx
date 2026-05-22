import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Download, Loader2, Package, LayoutGrid
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { fetchSkillContent, extractDescription } from '../utils/github';
import { fetchStoreSkillContent, importSkillFromStoreRepo } from '../utils/storeRepo';
import type { StoreRepo } from '../types/store';

export function StoreSkillDetail() {
  const { owner, repo, skillName } = useParams<{
    owner: string;
    repo: string;
    skillName: string;
  }>();
  const navigate = useNavigate();

  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [description, setDescription] = useState('');
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);

  const storeRepo = useMemo(() => {
    const stored = localStorage.getItem('skillhub-store-repos');
    if (!stored) return null;
    try {
      const repos: StoreRepo[] = JSON.parse(stored);
      return repos.find(r => r.owner === owner && r.repo === repo) || null;
    } catch {
      return null;
    }
  }, [owner, repo]);

  const skillPath = useMemo(() => {
    if (!storeRepo || !skillName) return skillName || '';
    return storeRepo.skillsPath ? `${storeRepo.skillsPath}/${skillName}` : skillName;
  }, [storeRepo, skillName]);

  const filteredContent = useMemo(() => {
    const trimmed = content.trim();
    if (trimmed.startsWith('---')) {
      const parts = trimmed.split('---');
      if (parts.length >= 3) {
        return parts.slice(2).join('---').trim();
      }
    }
    return trimmed;
  }, [content]);

  useEffect(() => {
    if (!owner || !repo || !skillName) return;

    const fetchDetail = async () => {
      setLoading(true);
      try {
        if (storeRepo && storeRepo.type === 'gerrit') {
          const raw = await fetchStoreSkillContent(storeRepo, skillPath);
          setContent(raw);
          setDescription(extractDescription(raw));
        } else {
          const raw = await fetchSkillContent(owner, repo, skillPath);
          setContent(raw);
          setDescription(extractDescription(raw));
        }
      } catch (error) {
        console.error('Failed to fetch store skill detail:', error);
        setContent('');
        setDescription('加载失败');
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [owner, repo, skillName, skillPath, storeRepo]);

  const handleImport = async () => {
    if (!owner || !repo || !skillName || importing || !storeRepo) return;

    setImporting(true);
    try {
      await importSkillFromStoreRepo(storeRepo, skillName, skillPath);
      setImported(true);
      window.dispatchEvent(new CustomEvent('skills-updated'));
    } catch (error: any) {
      alert(`导入失败: ${error.message || error}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="page-container skill-detail-page flex flex-col h-full">
      {/* Header */}
      <div className="skill-detail-header shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <button className="skill-action-btn" onClick={() => navigate(-1)}>
              <ArrowLeft size={20} />
            </button>
            <div className="skill-card-icon" style={{
              marginBottom: 0,
              width: 40,
              height: 40,
              background: 'linear-gradient(135deg, var(--color-primary), #6366f1)',
              color: 'white',
            }}>
              {skillName?.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-h2 text-primary">{skillName}</h1>
                <span style={{
                  fontSize: '0.6875rem',
                  padding: '0.125rem 0.5rem',
                  borderRadius: '9999px',
                  backgroundColor: 'rgba(99, 102, 241, 0.08)',
                  color: '#6366f1',
                  fontWeight: 500,
                }}>
                  {storeRepo?.type === 'github'
                    ? `${owner}/${repo}`
                    : storeRepo?.name || owner}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className={`btn ${imported ? 'btn-outline' : 'btn-primary'} flex items-center gap-2`}
              onClick={handleImport}
              disabled={importing || imported}
              style={{ outline: 'none' }}
            >
              {importing ? (
                <>
                  <Loader2 size={14} className="spin-animation" />
                  导入中...
                </>
              ) : imported ? (
                <>
                  <Package size={14} />
                  已导入
                </>
              ) : (
                <>
                  <Download size={14} />
                  导入到我的 Skills
                </>
              )}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center justify-between">
          <div className="flex gap-6">
            <div className="tab-item" style={{ borderBottom: 'none', color: 'var(--color-primary)' }}>
              <span className="flex items-center gap-2"><LayoutGrid size={16} /> 预览</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden mt-4">
        {loading ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: '1rem',
            color: 'var(--text-secondary)',
          }}>
            <Loader2 size={32} className="spin-animation" style={{ color: 'var(--color-primary)' }} />
            <span>正在加载内容...</span>
          </div>
        ) : (
          <div className="skill-detail-layout h-full" style={{ gridTemplateColumns: '1fr' }}>
            <div className="preview-section flex flex-col gap-6 overflow-y-auto pr-4 pb-8">
              <div>
                <h3 className="text-sm font-medium text-secondary mb-3">技能描述</h3>
                <div className="info-box bg-surface text-main markdown-body">
                  <p>{description}</p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-secondary mb-3">技能内容</h3>
                <div className="info-box bg-surface markdown-body">
                  <ReactMarkdown>{filteredContent || '暂无内容'}</ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}