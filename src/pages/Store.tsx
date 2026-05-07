import { EmptyState } from '../components/EmptyState';
import { Store as StoreIcon } from 'lucide-react';

export function Store() {
  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <div className="page-title">
            <StoreIcon size={24} className="text-primary" style={{ color: 'var(--color-primary)' }} />
            <h1 className="text-h1">Skill 商店</h1>
          </div>
          <p className="page-subtitle">探索和发现各种来源的 skills 目录。</p>
        </div>
      </div>
      <EmptyState title="商店加载中" description="请稍候..." />
    </div>
  );
}
