import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Box, Star, Globe, Clock, Store, Link as LinkIcon, Settings } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';

interface SkillInfo {
  name: string;
}

const NAV_ITEMS = [
  { name: '我的 Skills', icon: Box, path: '/' },
  { name: '收藏', icon: Star, path: '/favorites' },
  { name: '已分发', icon: Globe, path: '/distributed' },
  { name: '待分发', icon: Clock, path: '/pending' },
  { name: 'Skill 商店', icon: Store, path: '/store' },
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

  useEffect(() => {
    fetchSkillsCount();
    window.addEventListener('skills-updated', fetchSkillsCount);
    window.addEventListener('favorites-updated', fetchSkillsCount);
    window.addEventListener('distributed-updated', fetchSkillsCount);
    return () => {
      window.removeEventListener('skills-updated', fetchSkillsCount);
      window.removeEventListener('favorites-updated', fetchSkillsCount);
      window.removeEventListener('distributed-updated', fetchSkillsCount);
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
    </aside>
  );
}
