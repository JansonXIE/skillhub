import { useState, useEffect } from 'react';
import { Globe, Server, Trash2 } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { invoke } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';

interface SkillInfo {
  name: string;
  description: string | null;
}

interface DistributedMeta {
  name: string;
  repoId: string;
  repoUrl: string;
  timestamp: number;
}

export function Distributed() {
  const [skills, setSkills] = useState<(SkillInfo & { meta: DistributedMeta })[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDistributedSkills = async () => {
    try {
      setLoading(true);
      let dataPath = localStorage.getItem('skillhub-data-path');
      if (!dataPath) {
        const baseDir = await appDataDir();
        dataPath = await join(baseDir, 'SkillsHub');
      }
      const result: SkillInfo[] = await invoke('get_local_skills', { dataPath });
      
      const storedDistributed = localStorage.getItem('skillhub-distributed');
      const distributedList: DistributedMeta[] = storedDistributed ? JSON.parse(storedDistributed) : [];
      
      const distributedSkills = result
        .map(skill => {
          const meta = distributedList.find(d => d.name === skill.name);
          return meta ? { ...skill, meta } : null;
        })
        .filter(Boolean) as (SkillInfo & { meta: DistributedMeta })[];
        
      setSkills(distributedSkills);
    } catch (error) {
      console.error('Failed to fetch distributed skills:', error);
    } finally {
      setLoading(false);
    }
  };
  const removeDistributedHistory = (skillName: string) => {
    const confirm = window.confirm(`确定要删除 ${skillName} 的分发记录吗？\n（这仅删除本地显示记录，不会影响远程仓库）`);
    if (!confirm) return;

    const storedDistributed = localStorage.getItem('skillhub-distributed');
    if (storedDistributed) {
      try {
        const distributedList: DistributedMeta[] = JSON.parse(storedDistributed);
        const newList = distributedList.filter(d => d.name !== skillName);
        localStorage.setItem('skillhub-distributed', JSON.stringify(newList));
        window.dispatchEvent(new Event('distributed-updated'));
        fetchDistributedSkills();
      } catch (e) {
        console.error('Failed to update distributed history', e);
      }
    }
  };
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

  useEffect(() => {
    fetchDistributedSkills();
    window.addEventListener('distributed-updated', fetchDistributedSkills);
    return () => {
      window.removeEventListener('distributed-updated', fetchDistributedSkills);
    };
  }, []);

  // Listen to highlight-skill event
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
  }, [skills]);

  // Check sessionStorage for pending highlight on load
  useEffect(() => {
    if (!loading && skills.length > 0) {
      const targetSkill = sessionStorage.getItem('highlight-skill');
      if (targetSkill) {
        highlightSkill(targetSkill);
        sessionStorage.removeItem('highlight-skill');
      }
    }
  }, [loading, skills]);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <div className="page-title">
            <Globe size={24} className="text-primary" style={{ color: 'var(--color-primary)' }} />
            <h1 className="text-h1">已分发</h1>
            <span className="badge" style={{ backgroundColor: '#f1f5f9', color: '#64748b', fontSize: '0.875rem', padding: '0.125rem 0.5rem' }}>{skills.length}</span>
          </div>
          <p className="page-subtitle">自己已经提交到公司Gerrit或个人github中的skill。</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12 text-secondary">加载中...</div>
      ) : skills.length === 0 ? (
        <EmptyState title="暂无已分发技能" description="将本地技能分发到远程仓库" />
      ) : (
        <div className="skills-grid">
          {skills.map((skill, index) => (
            <div 
              key={index} 
              id={`skill-card-${skill.name}`}
              className="skill-card group" 
              style={{ cursor: 'default' }}
            >
              <div className="skill-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
                <div className="skill-card-icon">
                  {skill.name.charAt(0).toUpperCase()}
                </div>
                <button 
                  style={{
                    padding: '6px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#fee2e2';
                    e.currentTarget.style.color = '#ef4444';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#94a3b8';
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeDistributedHistory(skill.name);
                  }}
                  title="删除分发记录"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <h3 className="skill-card-title">{skill.name}</h3>

              <p className="skill-card-desc mb-3">
                {skill.description || '暂无描述'}
              </p>
              
              <div style={{
                marginTop: 'auto',
                paddingTop: '12px',
                borderTop: '1px solid #f1f5f9',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                width: '100%',
                overflow: 'hidden',
              }}>
                <Server size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
                <span style={{ 
                  color: '#94a3b8', 
                  fontWeight: '600', 
                  flexShrink: 0,
                  fontSize: '11px',
                  letterSpacing: '0.02em'
                }}>
                  已分发至:
                </span>
                <span 
                  title={skill.meta.repoUrl} 
                  style={{ 
                    color: '#3b82f6', 
                    fontWeight: '500',
                    fontSize: '12px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1
                  }}
                >
                  {skill.meta.repoUrl}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
