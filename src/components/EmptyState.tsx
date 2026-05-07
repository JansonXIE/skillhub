import { Box } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
}

export function EmptyState({ 
  title = "暂无技能", 
  description = "从 Skill 商店添加、扫描本地环境或手动创建技能开始使用" 
}: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-icon-wrapper">
        <Box size={48} strokeWidth={1.5} />
      </div>
      <h3 className="empty-title">{title}</h3>
      <p className="empty-desc">{description}</p>
    </div>
  );
}
