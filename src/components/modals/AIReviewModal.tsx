import { useState, useEffect } from 'react';
import { X, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { Endpoint } from '../../types/ai';

interface AIReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  skillName: string;
  skillContent: string;
}

export function AIReviewModal({ isOpen, onClose, skillName, skillContent }: AIReviewModalProps) {
  const [reviewing, setReviewing] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && skillContent) {
      performReview();
    }
  }, [isOpen, skillContent]);

  const performReview = async () => {
    setReviewing(true);
    setFeedback('');
    setError('');
    try {
      const savedEndpoints = localStorage.getItem('skillhub-ai-endpoints');
      if (!savedEndpoints) throw new Error('请先在设置中配置 AI 模型才能进行格式审查。');
      
      const endpoints = JSON.parse(savedEndpoints) as Endpoint[];
      const endpoint = endpoints.find(e => e.isVerified) || endpoints[0];
      if (!endpoint) throw new Error('未发现可用的 AI 端点，请检查 AI 设置。');

      const model = endpoint.models.find(m => m.type === 'chat') || endpoint.models[0];
      if (!model) throw new Error('当前端点下没有可用的对话模型。');

      const systemPrompt = `# Role
你是一个资深的 AI Agent 技能审核专家（Skill Reviewer）。你的任务是严格审查用户提交的 \`SKILL.md\` 文件内容，确保其完全符合系统的标准化生成规范。

# Review Criteria (审核标准)
用户提交的内容必须 100% 满足以下所有条件，任何一条不满足均视为“不合规（Rejected）”：
1. **YAML 元数据完整性**：必须以 \`---\` 包裹的 YAML Front Matter 作为开头。
2. **必填字段**：YAML 中必须包含 \`name\`（英文标识符）和 \`description\`（详细触发场景描述）。
3. **Markdown 主体**：YAML 元数据下方必须包含 Markdown 格式的技能主体内容。
4. **逻辑清晰度**：Markdown 主体中必须清晰定义“核心执行逻辑（Workflow/Logic）”和“规则约束（Rules/Constraints）”。
5. **无冗余文本**：不能包含偏离技能定义的无关闲聊内容。

# Workflow & Output Format
请仔细检查用户输入，并严格按照以下结构输出你的 Review 报告：

## 1. 审核结果 (Status)
*   如果完全符合：输出 \`✅ [通过] 您的 Skill 结构规范，符合系统要求。\`
*   如果不符合：输出 \`❌ [拒绝] 您的 Skill 不符合系统规范，请根据以下提示进行修改。\`

## 2. 问题诊断 (Issues Found)
（仅在状态为“拒绝”时输出）
逐条列出用户违反了哪几项审核标准。例如：
*   **缺失 YAML 头**：未发现 \`---\` 包裹的元数据。
*   **缺少 description 字段**：这将导致 AI 引擎无法判断何时调用该技能。
*   **缺少核心逻辑**：Markdown 主体中未定义 AI 的具体执行步骤。

## 3. 改进建议与示例 (Actionable Advice)
提供具体的修改建议。如果用户的内容有缺失，请给出一个修正后的格式骨架让他们填空，例如：
\`\`\`markdown
请确保您的技能按照以下结构修改：
---
name: [您的技能名称]
description: [请补充触发此技能的具体场景]
---
# [技能标题]
## 1. 执行逻辑
[请补充]
## 2. 约束规则
[请补充]
\`\`\``;

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
            { role: 'user', content: `以下是用户提交的 SKILL.md 内容：\n\n${skillContent}` }
          ]
        })
      });

      if (!response.ok) throw new Error(`API 异常：${response.statusText}`);

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || '未返回审核建议。';
      setFeedback(reply);
    } catch (err: any) {
      setError(err.message || '审核请求失败，请检查网络或 AI 配置。');
    } finally {
      setReviewing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="ai-translate-overlay fade-in" style={{ zIndex: 1100 }}>
      <div className="ai-translate-container slide-up" style={{ maxWidth: '650px', height: '80vh' }}>
        <div className="ai-translate-header">
          <div className="flex items-center gap-3">
            <div className="ai-translate-icon-pulse">
              <Sparkles size={18} className="text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-main">AI 技能规范审核</h3>
              <p className="text-xs text-secondary">正在深度审查 「{skillName}」 的结构与规范...</p>
            </div>
          </div>
          <button className="ai-icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="ai-translate-body" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 64px)', overflow: 'hidden' }}>
          <div style={{ flex: 1, padding: '1.25rem', overflowY: 'auto' }} className="markdown-body">
            {reviewing ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <div className="ai-loading-dots">
                  <span></span><span></span><span></span>
                </div>
                <p className="text-sm text-secondary">AI 正在深度审查结构合规性，请稍候...</p>
              </div>
            ) : error ? (
              <div className="ai-translate-error">
                <div className="text-red-500 mb-2">⚠️ 审核失败</div>
                <p className="text-sm">{error}</p>
                <button className="btn btn-primary mt-4" onClick={performReview}>重新审查</button>
              </div>
            ) : (
              <ReactMarkdown>{feedback}</ReactMarkdown>
            )}
          </div>

          <div className="ai-modal-footer" style={{ borderTop: '1px solid var(--border-light)', padding: '1rem 1.25rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', backgroundColor: 'var(--bg-card)' }}>
            <button className="btn btn-primary" onClick={onClose} disabled={reviewing}>
              关闭审核报告
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
