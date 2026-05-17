import { X, Bot, GitBranch, FileEdit, FolderSearch, Box, Check, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { Endpoint } from '../types/ai';

interface NewSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (skillName: string, content: string) => void;
}

export function NewSkillModal({ isOpen, onClose, onCreated }: NewSkillModalProps) {
  const [view, setView] = useState<'options' | 'github' | 'manual' | 'scan' | 'ai-draft'>('options');
  const [githubUrl, setGithubUrl] = useState('');
  
  // Manual creation states
  const [manualName, setManualName] = useState('');
  const [manualContent, setManualContent] = useState('');

  // AI Draft states
  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  
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
    setManualName('');
    setManualContent('');
    setDraftName('');
    setDraftDescription('');
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
      window.dispatchEvent(new CustomEvent('skills-updated'));
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err.toString());
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSubmit = async () => {
    if (!manualName.trim() || !manualContent.trim()) {
      setErrorMsg('请输入技能名称和内容');
      return;
    }
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const savedPath = localStorage.getItem('skillhub-data-path');
      if (!savedPath) throw new Error('请先在设置中配置数据目录');

      await invoke('create_local_skill', {
        dataPath: savedPath,
        skillName: manualName.trim(),
        content: manualContent
      });
      
      setSuccessMsg('技能创建成功！正在启动 AI 格式审查...');
      window.dispatchEvent(new CustomEvent('skills-updated'));
      
      if (onCreated) {
        onCreated(manualName.trim(), manualContent);
      }
      
      setTimeout(() => {
        handleClose();
      }, 1000);
    } catch (err: any) {
      setErrorMsg(err.toString());
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateDraft = async () => {
    if (!draftName.trim() || !draftDescription.trim()) {
      setErrorMsg('请输入技能名称和描述');
      return;
    }

    // Name format validation: lowercase letters, numbers, hyphens
    const nameRegex = /^[a-z0-9-]+$/;
    if (!nameRegex.test(draftName.trim())) {
      setErrorMsg('技能名称仅限小写字母、数字和连字符，例如 my-skill-name');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const savedEndpoints = localStorage.getItem('skillhub-ai-endpoints');
      if (!savedEndpoints) throw new Error('请先在设置中配置 AI 模型才能使用 AI 草稿生成。');
      
      const endpoints = JSON.parse(savedEndpoints) as Endpoint[];
      const endpoint = endpoints.find(e => e.isVerified) || endpoints[0];
      if (!endpoint) throw new Error('未发现可用的 AI 端点，请检查 AI 设置。');

      const model = endpoint.models.find(m => m.type === 'chat') || endpoint.models[0];
      if (!model) throw new Error('该端点下没有可用的对话模型。');

      const systemPrompt = `# Role
你是一个资深的 AI Agent 架构师，专门负责为系统生成标准化的 AI Skill（技能）。你能够根据用户的核心需求，将其转化为符合系统动态加载规范的 \`SKILL.md\` 文件及配套代码框架。

# Output Format Specification
你输出的所有 Skill 必须严格遵守以下格式规范，直接输出文件内容，不要包裹多余的解释：

1. 必须包含顶部 YAML 元数据（Front Matter），用于系统识别触发条件，包含 name 和 description 字段。
2. 必须包含底部 Markdown 主体，用于定义详细的领域知识、执行逻辑与规则约束。
3. 结构示例：
---
name: [英文唯一标识]
description: [触发该技能的详细场景描述，供AI引擎判断调用时机]
---
# [技能中文名称]

## 1. 核心执行逻辑
...
## 2. 规则与约束
...

# Workflow
1. 解析用户输入的【技能名称】、【触发场景】、【核心逻辑】。
2. 严格按照上述格式生成 \`SKILL.md\` 的文本内容。
3. 如果用户提及了具体代码需求，在同一个回答中以独立代码块形式提供核心执行代码（如 Python/TypeScript 脚本），并注明与 SKILL.md 存放在同级目录下。`;

      const response = await fetch(`${endpoint.apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${endpoint.apiKey}`
        },
        body: JSON.stringify({
          model: model.name,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `请输入【技能名称】和【触发场景/核心逻辑】：\n技能名称：${draftName.trim()}\n触发场景与描述：${draftDescription.trim()}` }
          ]
        })
      });

      if (!response.ok) throw new Error(`API 异常：${response.statusText}`);

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || '';
      if (!reply) throw new Error('AI 未返回任何有效草稿内容，请重试。');

      // Pre-fill manual creation and navigate to manual view for preview & edit
      setManualName(draftName.trim());
      setManualContent(reply);
      setView('manual');
    } catch (err: any) {
      setErrorMsg(err.message || '生成失败，请检查网络或 AI 配置。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleScanLocal = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (!selected) return;

      setIsLoading(true);
      setErrorMsg('');
      setSuccessMsg('');

      const savedPath = localStorage.getItem('skillhub-data-path');
      if (!savedPath) throw new Error('请先在设置中配置数据目录');

      const res = await invoke<string>('import_local_skill', {
        dataPath: savedPath,
        sourcePath: selected as string
      });

      setSuccessMsg(res);
      window.dispatchEvent(new CustomEvent('skills-updated'));
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
            {view === 'ai-draft' ? <Sparkles size={20} className="text-primary" /> : <Box size={20} className="text-primary" />}
            <span>{view === 'github' ? '从 GitHub 安装' : view === 'ai-draft' ? 'AI 草稿' : '新建技能'}</span>
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
                <button className="option-card primary-card" onClick={() => setView('ai-draft')}>
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
                
                <button className="option-card" onClick={() => setView('manual')}>
                  <div className="option-icon bg-light">
                    <FileEdit size={24} className="text-main" />
                  </div>
                  <div className="option-info">
                    <div className="option-name">手动创建</div>
                    <div className="option-desc">从零开始编写技能</div>
                  </div>
                </button>
                
                <button className="option-card" onClick={handleScanLocal}>
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
          ) : view === 'github' ? (
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
          ) : view === 'manual' ? (
            <div className="github-form" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="form-label">技能名称</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="例如：my-awesome-skill"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <label className="form-label">SKILL.md 内容</label>
                <textarea 
                  className="form-input" 
                  style={{ minHeight: '150px', resize: 'vertical' }}
                  placeholder="# 技能描述..."
                  value={manualContent}
                  onChange={(e) => setManualContent(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              {errorMsg && <div className="error-text">{errorMsg}</div>}
              {successMsg && <div className="success-text">{successMsg}</div>}

              <div className="form-actions">
                <button className="btn btn-ghost" onClick={() => setView('options')} disabled={isLoading}>
                  返回
                </button>
                <button 
                  className="btn btn-primary flex items-center gap-2" 
                  onClick={handleManualSubmit} 
                  disabled={isLoading || !manualName || !manualContent}
                >
                  {isLoading ? '正在创建...' : (
                    <>
                      <Check size={16} /> 创建技能
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : view === 'ai-draft' ? (
            <div className="github-form" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="info-box flex items-start gap-3" style={{ backgroundColor: '#f0f7ff', borderColor: '#e0efff', color: '#1e40af', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', marginBottom: '0.5rem', display: 'flex' }}>
                <Sparkles size={16} className="flex-shrink-0" style={{ color: '#3b82f6', marginTop: '0.125rem', marginRight: '0.5rem' }} />
                <span style={{ fontSize: '0.875rem', lineHeight: '1.4' }}>
                  使用 Skill Creator 技能生成专业的 SKILL.md 草稿，生成后可预览编辑再保存。
                </span>
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: 500 }}>技能名称 <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="my-skill"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  disabled={isLoading}
                />
                <div className="form-helper" style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                  仅限小写字母、数字和连字符，如 my-skill-name
                </div>
              </div>
              
              <div>
                <label className="form-label" style={{ fontWeight: 500 }}>描述 <span className="text-red-500">*</span></label>
                <textarea 
                  className="form-input" 
                  style={{ minHeight: '120px', resize: 'vertical' }}
                  placeholder="描述这个技能要做什么、用途、以及何时触发..."
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              {errorMsg && <div className="error-text">{errorMsg}</div>}

              <div className="form-actions" style={{ marginTop: '0.5rem' }}>
                <button className="btn btn-ghost" onClick={() => setView('options')} disabled={isLoading}>
                  返回
                </button>
                <button 
                  className="btn btn-primary flex items-center gap-2" 
                  onClick={handleGenerateDraft} 
                  disabled={isLoading || !draftName || !draftDescription}
                >
                  {isLoading ? '正在生成...' : (
                    <>
                      <Sparkles size={16} /> 生成并预览
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
