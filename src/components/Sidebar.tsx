import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Box, Star, Globe, Clock, Store, Link as LinkIcon, Settings, Plus, ChevronDown, GitBranch, Server, Trash2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import { AddStoreModal } from './modals/AddStoreModal';
import type { StoreRepo } from '../types/store';

interface SkillInfo {
  name: string;
}

const NAV_ITEMS = [
  { name: '我的 Skills', icon: Box, path: '/' },
  { name: '收藏', icon: Star, path: '/favorites' },
  { name: '已分发', icon: Globe, path: '/distributed' },
  { name: '待分发', icon: Clock, path: '/pending' },
];

const BOTTOM_LINKS = [
  { name: '推荐资源', icon: LinkIcon, path: '/resources' },
  { name: '设置', icon: Settings, path: '/settings' },
];

export function Sidebar() {
  const [mySkillsCount, setMySkillsCount] = useState(0);
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [distributedCount, setDistributedCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [storeExpanded, setStoreExpanded] = useState(true);
  const [storeRepos, setStoreRepos] = useState<StoreRepo[]>([]);
  const [showAddStore, setShowAddStore] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const isStoreActive = location.pathname.startsWith('/store');

  const fetchSkillsCount = async () => {
    try {
      let dataPath = localStorage.getItem('skillhub-data-path');
      if (!dataPath) {
        const baseDir = await appDataDir();
        dataPath = await join(baseDir, 'SkillsHub');
      }
      const result: SkillInfo[] = await invoke('get_local_skills', { dataPath });
      setMySkillsCount(result.length);

      // Load favorites
      const stored = localStorage.getItem('skillhub-favorites');
      const favoritesList: string[] = stored ? JSON.parse(stored) : [];
      const actualFavorites = result.filter(skill => favoritesList.includes(skill.name));
      setFavoritesCount(actualFavorites.length);

      // Load distributed
      const storedDistributed = localStorage.getItem('skillhub-distributed');
      const distributedList: { name: string }[] = storedDistributed ? JSON.parse(storedDistributed) : [];
      const distributedNames = distributedList.map(d => d.name);
      
      const actualDistributed = result.filter(skill => distributedNames.includes(skill.name));
      setDistributedCount(actualDistributed.length);
      
      // Pending = total - distributed
      setPendingCount(result.length - actualDistributed.length);
    } catch (error) {
      console.error('Failed to fetch skills count:', error);
    }
  };

  const loadStoreRepos = () => {
    const stored = localStorage.getItem('skillhub-store-repos');
    if (stored) {
      try {
        setStoreRepos(JSON.parse(stored));
      } catch { /* ignore */ }
    } else {
      setStoreRepos([]);
    }
  };

  const handleDeleteStoreRepo = (e: React.MouseEvent, repoId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const updated = storeRepos.filter(r => r.id !== repoId);
    setStoreRepos(updated);
    localStorage.setItem('skillhub-store-repos', JSON.stringify(updated));
    window.dispatchEvent(new Event('store-repos-updated'));
    // If we're currently viewing the deleted repo, navigate to store
    if (location.pathname.startsWith('/store/')) {
      navigate('/store');
    }
  };

  useEffect(() => {
    fetchSkillsCount();
    loadStoreRepos();
    window.addEventListener('skills-updated', fetchSkillsCount);
    window.addEventListener('favorites-updated', fetchSkillsCount);
    window.addEventListener('distributed-updated', fetchSkillsCount);
    window.addEventListener('store-repos-updated', loadStoreRepos);
    return () => {
      window.removeEventListener('skills-updated', fetchSkillsCount);
      window.removeEventListener('favorites-updated', fetchSkillsCount);
      window.removeEventListener('distributed-updated', fetchSkillsCount);
      window.removeEventListener('store-repos-updated', loadStoreRepos);
    };
  }, []);

  return (
    <aside className="sidebar">
      <div className="logo-container">
        <span>SkillHub</span>
      </div>

      <nav className="nav-section">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={18} />
              <span>{item.name}</span>
              {item.name === '我的 Skills' && (
                <span className="badge">{mySkillsCount}</span>
              )}
              {item.name === '收藏' && (
                <span className="badge">{favoritesCount}</span>
              )}
              {item.name === '已分发' && (
                <span className="badge">{distributedCount}</span>
              )}
              {item.name === '待分发' && (
                <span className="badge">{pendingCount}</span>
              )}
            </NavLink>
          );
        })}

        {/* Store Section - Expandable */}
        <div className="store-nav-group">
          <button
            className={`nav-item store-nav-header ${isStoreActive ? 'active' : ''}`}
            onClick={() => {
              setStoreExpanded(!storeExpanded);
              if (!isStoreActive) {
                navigate('/store');
              }
            }}
            style={{ 
              width: '100%', 
              border: 'none', 
              cursor: 'pointer',
              outline: 'none',
              textAlign: 'left',
              backgroundColor: isStoreActive ? 'var(--color-primary)' : 'transparent',
              color: isStoreActive ? 'var(--text-inverse)' : 'var(--text-secondary)',
            }}
          >
            <Store size={18} />
            <span>Skill 商店</span>
            <ChevronDown 
              size={14} 
              style={{ 
                marginLeft: 'auto',
                transition: 'transform 0.2s ease',
                transform: storeExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                opacity: 0.6,
              }} 
            />
          </button>

          {storeExpanded && (
            <div className="store-nav-subitems">
              {storeRepos.map((storeRepo) => {
                const isActive = location.pathname === `/store/${storeRepo.owner}/${storeRepo.repo}`;
                const isGerrit = storeRepo.type === 'gerrit';
                return (
                  <NavLink
                    key={storeRepo.id}
                    to={`/store/${storeRepo.owner}/${storeRepo.repo}`}
                    className={`store-sub-item ${isActive ? 'active' : ''}`}
                  >
                    {isGerrit ? <Server size={14} /> : <GitBranch size={14} />}
                    <span className="store-sub-name" title={isGerrit ? storeRepo.url : `${storeRepo.owner}/${storeRepo.repo}`}>
                      {storeRepo.name}
                    </span>
                    <span className="store-sub-count">{storeRepo.skillCount}</span>
                    <button
                      className="store-sub-delete"
                      onClick={(e) => handleDeleteStoreRepo(e, storeRepo.id)}
                      title="移除商店"
                    >
                      <Trash2 size={12} />
                    </button>
                  </NavLink>
                );
              })}

              <button
                className="store-add-btn"
                onClick={() => setShowAddStore(true)}
                style={{ outline: 'none' }}
              >
                <Plus size={14} />
                <span>添加商店</span>
              </button>
            </div>
          )}
        </div>
      </nav>

      <div className="sidebar-bottom">
        {BOTTOM_LINKS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={18} />
              <span>{item.name}</span>
            </NavLink>
          );
        })}
      </div>

      <AddStoreModal
        isOpen={showAddStore}
        onClose={() => setShowAddStore(false)}
        onAdded={() => loadStoreRepos()}
      />
    </aside>
  );
}
