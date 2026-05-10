import { X, Bot, GitBranch, FileEdit, FolderSearch, Box, Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface NewSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NewSkillModal({ isOpen, onClose }: NewSkillModalProps) {
  const [view, setView] = useState<'options' | 'github'>('options');
  const [githubUrl, setGithubUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

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

  const handleClose = () => {
    setView('options');
    setGithubUrl('');
    setErrorMsg('');
    setSuccessMsg('');
    onClose();
  };

  const handleGithubSubmit = async () => {
    if (!githubUrl) {
      setErrorMsg('请输入 GitHub 仓库地址');
      return;
    }
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    
    try {
      const savedPath = localStorage.getItem('skillhub-data-path');
      if (!savedPath) {
        throw new Error('请先在设置中配置数据目录');
      }

      const res = await invoke<string>('clone_github_repo', { 
        url: githubUrl,
        basePath: savedPath
      });
      setSuccessMsg(res);
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err.toString());
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-container" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Box size={20} className="text-primary" />
            <span>{view === 'github' ? '从 GitHub 安装' : '新建技能'}</span>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={handleClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-content">
          {view === 'options' ? (
            <>
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
                
                <button className="option-card" onClick={() => setView('github')}>
                  <div className="option-icon bg-light">
                    <GitBranch size={24} className="text-main" />
                  </div>
                  <div className="option-info">
                    <div className="option-name">从 GitHub 安装</div>
                    <div className="option-desc">粘贴 GitHub 仓库地址安装</div>
                  </div>
                </button>
                
                <button className="option-card">
                  <div className="option-icon bg-light">
                    <FileEdit size={24} className="text-main" />
                  </div>
                  <div className="option-info">
                    <div className="option-name">手动创建</div>
                    <div className="option-desc">从零开始编写技能</div>
                  </div>
                </button>
                
                <button className="option-card">
                  <div className="option-icon bg-light">
                    <FolderSearch size={24} className="text-main" />
                  </div>
                  <div className="option-info">
                    <div className="option-name">扫描本地</div>
                    <div className="option-desc">扫描本地已有的技能</div>
                  </div>
                </button>
              </div>
            </>
          ) : (
            <div className="github-form">
              <label className="form-label">GitHub 仓库地址</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="https://github.com/owner/skill-repo"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                disabled={isLoading}
              />
              <div className="form-helper">
                请输入仓库根地址。SkillHub 会先扫描仓库中的可导入 SKILL.md，再让你选择要导入的内容。
              </div>
              
              <div className="info-box">
                <p>目前只支持仓库根地址，例如 https://github.com/owner/skill-repo</p>
                <p>如果没有找到 SKILL.md，SkillHub 会回退到仓库根目录的 README.md，并将其作为单个导入候选。</p>
              </div>

              {errorMsg && <div className="error-text">{errorMsg}</div>}
              {successMsg && <div className="success-text">{successMsg}</div>}

              <div className="form-actions">
                <button className="btn btn-ghost" onClick={() => setView('options')} disabled={isLoading}>
                  返回
                </button>
                <button className="btn btn-primary flex items-center gap-2" onClick={handleGithubSubmit} disabled={isLoading}>
                  {isLoading ? '正在拉取...' : (
                    <>
                      <Check size={16} /> 扫描仓库
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
