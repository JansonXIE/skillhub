import { useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { BookOpen, ExternalLink, FileText, X } from 'lucide-react';
import claudeSkillGuidePdf from '../../docs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf';

const RESOURCE_LINKS = [
  {
    title: 'Agent Skills: Skill Creation Best Practices',
    description: '来自 agentskills.io 的技能创建最佳实践，适合整理结构、指令边界和交付规范。',
    url: 'https://agentskills.io/skill-creation/best-practices',
  },
  {
    title: 'Claude Code 最佳实践',
    description: 'Claude Code 官方中文最佳实践文档，适合补充代码代理工作流和落地习惯。',
    url: 'https://code.claude.com/docs/zh-CN/best-practices',
  },
];

export function Resources() {
  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = useState(false);

  const handleOpenExternalUrl = async (url: string) => {
    try {
      await openUrl(url);
    } catch (error) {
      console.error('Failed to open external resource with Tauri opener:', error);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="page-container resources-page">
      <div className="page-header">
        <div>
          <div className="page-title">
            <BookOpen size={24} className="text-primary" style={{ color: 'var(--color-primary)' }} />
            <h1 className="text-h1">推荐资源</h1>
          </div>
          <p className="page-subtitle">整理技能构建与代码代理实践资料，外链可直接打开，内置 PDF 可在应用内预览。</p>
        </div>
      </div>

      <section className="resources-grid" aria-label="推荐资源列表">
        {RESOURCE_LINKS.map((resource) => (
          <article key={resource.url} className="resource-card">
            <div className="resource-card-head">
              <div className="resource-icon">
                <ExternalLink size={20} />
              </div>
              <span className="resource-tag">外部链接</span>
            </div>
            <div className="resource-card-body">
              <h2 className="resource-title">{resource.title}</h2>
              <p className="resource-description">{resource.description}</p>
            </div>
            <div className="resource-actions">
              <button
                className="btn btn-primary resource-action-link"
                type="button"
                onClick={() => void handleOpenExternalUrl(resource.url)}
              >
                打开链接
                <ExternalLink size={16} />
              </button>
            </div>
          </article>
        ))}

        <article className="resource-card">
          <div className="resource-card-head">
            <div className="resource-icon">
              <FileText size={20} />
            </div>
            <span className="resource-tag">内置 PDF</span>
          </div>
          <div className="resource-card-body">
            <h2 className="resource-title">The Complete Guide to Building Skill for Claude</h2>
            <p className="resource-description">应用内置 PDF 文档，点击后会在当前界面弹出预览，方便边看边整理 Skill。</p>
          </div>
          <div className="resource-actions">
            <button className="btn btn-primary" type="button" onClick={() => setIsPdfPreviewOpen(true)}>
              预览 PDF
            </button>
          </div>
        </article>
      </section>

      {isPdfPreviewOpen && (
        <div className="modal-overlay" onClick={() => setIsPdfPreviewOpen(false)}>
          <div className="resource-pdf-modal" onClick={(event) => event.stopPropagation()}>
            <div className="resource-pdf-header">
              <div>
                <h2 className="resource-pdf-title">The Complete Guide to Building Skill for Claude</h2>
                <p className="resource-pdf-subtitle">应用内 PDF 预览</p>
              </div>
              <button
                className="btn btn-ghost btn-icon"
                type="button"
                aria-label="关闭 PDF 预览"
                onClick={() => setIsPdfPreviewOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="resource-pdf-viewer">
              <iframe src={claudeSkillGuidePdf} title="The Complete Guide to Building Skill for Claude" className="resource-pdf-frame" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}