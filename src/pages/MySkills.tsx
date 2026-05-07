import { CheckSquare, LayoutGrid, List, FolderInput, RefreshCw, Box } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';

export function MySkills() {
  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <div className="page-title">
            <Box size={24} className="text-primary" style={{ color: 'var(--color-primary)' }} />
            <h1 className="text-h1">我的 Skills</h1>
            <span className="badge" style={{ backgroundColor: '#f1f5f9', color: '#64748b', fontSize: '0.875rem', padding: '0.125rem 0.5rem' }}>0</span>
          </div>
          <p className="page-subtitle">统一管理所有已导入的 skills，不区分来源渠道。</p>
        </div>
        
        <div className="action-bar">
          <button className="btn btn-outline flex items-center gap-2">
            <CheckSquare size={16} />
            批量管理
          </button>
          
          <div className="btn-outline flex items-center" style={{ padding: '0.25rem', borderRadius: 'var(--radius-md)' }}>
            <button className="btn-icon btn-ghost active" style={{ backgroundColor: 'var(--border-light)', borderRadius: 'var(--radius-sm)', color: 'var(--text-main)' }}>
              <LayoutGrid size={16} />
            </button>
            <button className="btn-icon btn-ghost" style={{ borderRadius: 'var(--radius-sm)' }}>
              <List size={16} />
            </button>
          </div>

          <button className="btn-icon btn-outline" style={{ padding: '0.5rem 0.75rem' }}>
            <FolderInput size={16} />
          </button>

          <button className="btn-icon btn-outline" style={{ padding: '0.5rem 0.75rem' }}>
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <EmptyState />
    </div>
  );
}
