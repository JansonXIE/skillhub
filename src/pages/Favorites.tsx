import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, LayoutGrid, List, RefreshCw, Star, Trash2, Download } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { invoke } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';

interface SkillInfo {
  name: string;
  description: string | null;
}

export function Favorites() {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchFavorites = async () => {
    try {
      setLoading(true);
      let dataPath = localStorage.getItem('skillhub-data-path');
      if (!dataPath) {
        const baseDir = await appDataDir();
        dataPath = await join(baseDir, 'SkillsHub');
      }
      const result: SkillInfo[] = await invoke('get_local_skills', { dataPath });
      
      const stored = localStorage.getItem('skillhub-favorites');
      const favoritesList: string[] = stored ? JSON.parse(stored) : [];
      
      const filtered = result.filter(skill => favoritesList.includes(skill.name));
      setSkills(filtered);
    } catch (error) {
      console.error('Failed to fetch favorites:', error);
    } finally {
      setLoading(false);
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
        console.error(e);
      }
    }
    
    // In Favorites page, clicking Star always removes it!
    const newFavorites = currentFavorites.filter(name => name !== skillName);
    localStorage.setItem('skillhub-favorites', JSON.stringify(newFavorites));
    
    // Update local state directly so it feels incredibly smooth
    setSkills(prev => prev.filter(skill => skill.name !== skillName));
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
          const newFavorites = currentFavorites.filter(name => name !== skillName);
          localStorage.setItem('skillhub-favorites', JSON.stringify(newFavorites));
          window.dispatchEvent(new CustomEvent('favorites-updated'));
        } catch (e) {
          console.error(e);
        }
      }
      
      window.dispatchEvent(new CustomEvent('skills-updated'));
    } catch (error: any) {
      console.error('Failed to delete skill:', error);
    }
  };

  useEffect(() => {
    fetchFavorites();
    window.addEventListener('skills-updated', fetchFavorites);
    window.addEventListener('favorites-updated', fetchFavorites);
    return () => {
      window.removeEventListener('skills-updated', fetchFavorites);
      window.removeEventListener('favorites-updated', fetchFavorites);
    };
  }, []);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <div className="page-title">
            <Star size={24} className="text-primary" style={{ color: 'var(--color-primary)', fill: 'var(--color-primary)' }} />
            <h1 className="text-h1">收藏</h1>
            <span className="badge" style={{ backgroundColor: '#f1f5f9', color: '#64748b', fontSize: '0.875rem', padding: '0.125rem 0.5rem' }}>{skills.length}</span>
          </div>
          <p className="page-subtitle">我收藏的 skills。</p>
        </div>
        
        <div className="action-bar">
          <button className="btn btn-outline flex items-center gap-2" style={{ outline: 'none' }}>
            <CheckSquare size={16} />
            批量管理
          </button>

          <button className="btn-icon btn-outline" style={{ padding: '0.5rem 0.75rem', outline: 'none' }} onClick={fetchFavorites}>
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12 text-secondary">加载中...</div>
      ) : skills.length === 0 ? (
        <EmptyState title="暂无收藏" description="去“我的 Skills”或者 Skill 商店探索并收藏你喜欢的技能" />
      ) : (
        <div className="skills-grid">
          {skills.map((skill, index) => (
            <div key={index} className="skill-card hover-pointer" onClick={() => navigate(`/skill/${skill.name}`)}>
              <div className="skill-card-header">
                <div className="skill-card-icon">
                  {skill.name.charAt(0).toUpperCase()}
                </div>
                <div className="skill-card-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="skill-action-btn focus:outline-none" title="安装到平台" style={{ outline: 'none' }}>
                    <Download size={14} />
                  </button>
                  <button 
                    className="skill-action-btn focus:outline-none" 
                    title="取消收藏" 
                    onClick={(e) => toggleFavorite(e, skill.name)}
                    style={{ outline: 'none' }}
                  >
                    <Star size={14} fill="var(--color-primary)" style={{ color: 'var(--color-primary)' }} />
                  </button>
                  <button 
                    className="skill-action-btn skill-action-btn--danger focus:outline-none" 
                    title="删除" 
                    onClick={(e) => handleDelete(e, skill.name)}
                    style={{ outline: 'none' }}
                  >
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
