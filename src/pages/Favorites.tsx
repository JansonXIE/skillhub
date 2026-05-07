import { EmptyState } from '../components/EmptyState';
import { Star } from 'lucide-react';

export function Favorites() {
  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <div className="page-title">
            <Star size={24} className="text-primary" style={{ color: 'var(--color-primary)' }} />
            <h1 className="text-h1">收藏</h1>
            <span className="badge" style={{ backgroundColor: '#f1f5f9', color: '#64748b', fontSize: '0.875rem', padding: '0.125rem 0.5rem' }}>0</span>
          </div>
          <p className="page-subtitle">我收藏的 skills。</p>
        </div>
      </div>
      <EmptyState title="暂无收藏" description="去 Skill 商店探索并收藏你喜欢的技能" />
    </div>
  );
}
