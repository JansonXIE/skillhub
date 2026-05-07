import { NavLink } from 'react-router-dom';
import { Box, Star, Globe, Clock, Store, Link as LinkIcon, Settings } from 'lucide-react';

const NAV_ITEMS = [
  { name: '我的 Skills', icon: Box, path: '/', count: 0 },
  { name: '收藏', icon: Star, path: '/favorites', count: 0 },
  { name: '已分发', icon: Globe, path: '/distributed', count: 0 },
  { name: '待分发', icon: Clock, path: '/pending', count: 0 },
  { name: 'Skill 商店', icon: Store, path: '/store' },
];

const BOTTOM_LINKS = [
  { name: '推荐资源', icon: LinkIcon, path: '/resources' },
  { name: '设置', icon: Settings, path: '/settings' },
];

export function Sidebar() {
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
              {item.count !== undefined && (
                <span className="badge">{item.count}</span>
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
