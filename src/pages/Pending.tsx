import { EmptyState } from '../components/EmptyState';
import { Clock } from 'lucide-react';

export function Pending() {
  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <div className="page-title">
            <Clock size={24} className="text-primary" style={{ color: 'var(--color-primary)' }} />
            <h1 className="text-h1">待分发</h1>
            <span className="badge" style={{ backgroundColor: '#f1f5f9', color: '#64748b', fontSize: '0.875rem', padding: '0.125rem 0.5rem' }}>0</span>
          </div>
          <p className="page-subtitle">本地的skill，代表可以push到公司Gerrit或个人github。</p>
        </div>
      </div>
      <EmptyState title="暂无待分发技能" description="你的所有本地技能都已经分发" />
    </div>
  );
}
