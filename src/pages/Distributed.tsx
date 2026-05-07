import { EmptyState } from '../components/EmptyState';
import { Globe } from 'lucide-react';

export function Distributed() {
  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <div className="page-title">
            <Globe size={24} className="text-primary" style={{ color: 'var(--color-primary)' }} />
            <h1 className="text-h1">已分发</h1>
            <span className="badge" style={{ backgroundColor: '#f1f5f9', color: '#64748b', fontSize: '0.875rem', padding: '0.125rem 0.5rem' }}>0</span>
          </div>
          <p className="page-subtitle">自己已经提交到公司Gerrit或个人github中的skill。</p>
        </div>
      </div>
      <EmptyState title="暂无已分发技能" description="将本地技能分发到远程仓库" />
    </div>
  );
}
