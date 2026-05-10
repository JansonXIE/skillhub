import { X, Bot, GitBranch, FileEdit, FolderSearch, Box } from 'lucide-react';
import { useEffect } from 'react';

interface NewSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NewSkillModal({ isOpen, onClose }: NewSkillModalProps) {
  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Box size={20} className="text-primary" />
            <span>新建技能</span>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-content">
          <div className="modal-subtitle">选择添加技能的方式：</div>
          <div className="modal-options">
            <button className="option-card primary-card">
              <div className="option-icon primary-bg">
                <Bot size={24} color="white" />
              </div>
              <div className="option-info">
                <div className="option-name">
                  AI 草稿 <span className="badge badge-primary">skill-creator</span>
                </div>
                <div className="option-desc">描述你的需求，AI 先生成 SKILL.md 草稿供你确认</div>
              </div>
            </button>
            
            <button className="option-card">
              <div className="option-icon bg-light">
                <GitBranch size={24} />
              </div>
              <div className="option-info">
                <div className="option-name">从 GitHub 安装</div>
                <div className="option-desc">粘贴 GitHub 仓库地址安装</div>
              </div>
            </button>
            
            <button className="option-card">
              <div className="option-icon bg-light">
                <FileEdit size={24} />
              </div>
              <div className="option-info">
                <div className="option-name">手动创建</div>
                <div className="option-desc">从零开始编写技能</div>
              </div>
            </button>
            
            <button className="option-card">
              <div className="option-icon bg-light">
                <FolderSearch size={24} />
              </div>
              <div className="option-info">
                <div className="option-name">扫描本地</div>
                <div className="option-desc">扫描本地已有的技能</div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
