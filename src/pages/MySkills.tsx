import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, RefreshCw, Box, Download, Star, Trash2 } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { invoke } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';


interface SkillInfo {
  name: string;
  description: string | null;
}

export function MySkills() {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<string[]>([]);
  const navigate = useNavigate();

  const fetchSkills = async () => {
    try {
      setLoading(true);
      let dataPath = localStorage.getItem('skillhub-data-path');
      if (!dataPath) {
        const baseDir = await appDataDir();
        dataPath = await join(baseDir, 'SkillsHub');
      }
      const result: SkillInfo[] = await invoke('get_local_skills', { dataPath });
      setSkills(result);
    } catch (error) {
      console.error('Failed to fetch skills:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFavorites = () => {
    const stored = localStorage.getItem('skillhub-favorites');
    if (stored) {
      try {
        setFavorites(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse favorites', e);
      }
    } else {
      setFavorites([]);
    }
  };

  const toggleFavorite = (e: React.MouseEvent, skillName: string) => {
    e.stopPropagation();
    const stored = localStorage.getItem('skillhub-favorites');
    let currentFavorites: string[] = [];
    if (stored) {
      try {
        currentFavorites = JSON.parse(stored);
      } catch (e) {
        console.error('Failed to parse favorites', e);
      }
    }
    
    let newFavorites: string[];
    if (currentFavorites.includes(skillName)) {
      newFavorites = currentFavorites.filter(name => name !== skillName);
    } else {
      newFavorites = [...currentFavorites, skillName];
    }
    
    localStorage.setItem('skillhub-favorites', JSON.stringify(newFavorites));
    setFavorites(newFavorites);
    window.dispatchEvent(new CustomEvent('favorites-updated'));
  };

  const handleDelete = async (e: React.MouseEvent, skillName: string) => {
    e.stopPropagation();
    try {
      let dataPath = localStorage.getItem('skillhub-data-path');
      if (!dataPath) {
        const baseDir = await appDataDir();
        dataPath = await join(baseDir, 'SkillsHub');
      }

      await invoke('delete_local_skill', { dataPath, skillName });
      
      // Auto remove from favorites if deleted
      const stored = localStorage.getItem('skillhub-favorites');
      if (stored) {
        try {
          const currentFavorites: string[] = JSON.parse(stored);
          if (currentFavorites.includes(skillName)) {
            const newFavorites = currentFavorites.filter(name => name !== skillName);
            localStorage.setItem('skillhub-favorites', JSON.stringify(newFavorites));
            window.dispatchEvent(new CustomEvent('favorites-updated'));
          }
        } catch (e) {
          console.error(e);
        }
      }

      window.dispatchEvent(new CustomEvent('skills-updated'));
    } catch (error: any) {
      console.error('Failed to delete skill:', error);
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
    fetchSkills();
    loadFavorites();
    window.addEventListener('skills-updated', fetchSkills);
    window.addEventListener('favorites-updated', loadFavorites);
    return () => {
      window.removeEventListener('skills-updated', fetchSkills);
      window.removeEventListener('favorites-updated', loadFavorites);
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
            <Box size={24} className="text-primary" style={{ color: 'var(--color-primary)' }} />
            <h1 className="text-h1">我的 Skills</h1>
            <span className="badge" style={{ backgroundColor: '#f1f5f9', color: '#64748b', fontSize: '0.875rem', padding: '0.125rem 0.5rem' }}>{skills.length}</span>
          </div>
          <p className="page-subtitle">统一管理所有已导入的 skills，不区分来源渠道。</p>
        </div>
        
        <div className="action-bar">
          <button className="btn btn-outline flex items-center gap-2">
            <CheckSquare size={16} />
            批量管理
          </button>

          <button className="btn-icon btn-outline" style={{ padding: '0.5rem 0.75rem' }} onClick={() => window.dispatchEvent(new CustomEvent('skills-updated'))}>
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12 text-secondary">加载中...</div>
      ) : skills.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="skills-grid">
          {skills.map((skill, index) => (
            <div 
              key={index} 
              id={`skill-card-${skill.name}`}
              className="skill-card hover-pointer" 
              onClick={() => navigate(`/skill/${skill.name}`)}
            >
              <div className="skill-card-header">
                <div className="skill-card-icon">
                  {skill.name.charAt(0).toUpperCase()}
                </div>
                <div className="skill-card-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="skill-action-btn" title="安装到平台">
                    <Download size={14} />
                  </button>
                  <button 
                    className="skill-action-btn focus:outline-none" 
                    title={favorites.includes(skill.name) ? "取消收藏" : "添加收藏"} 
                    onClick={(e) => toggleFavorite(e, skill.name)}
                    style={{ outline: 'none' }}
                  >
                    <Star 
                      size={14} 
                      fill={favorites.includes(skill.name) ? "var(--color-primary)" : "none"}
                      style={{ color: favorites.includes(skill.name) ? "var(--color-primary)" : "currentColor" }}
                    />
                  </button>
                  <button className="skill-action-btn skill-action-btn--danger" title="删除" onClick={(e) => handleDelete(e, skill.name)}>
                    <Trash2 size={14} />
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
