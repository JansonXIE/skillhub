import { useState } from 'react';
import { X, Eye, EyeOff, Play } from 'lucide-react';
import type { Endpoint, AIModel } from '../../types/ai';

interface AddModelModalProps {
  endpoint: Endpoint;
  onClose: () => void;
  onAdd: (endpointId: string, model: AIModel, endpointInfo: { apiKey: string; apiUrl: string; provider: string }) => void;
}

const MODEL_TYPES = [
  { value: 'chat', label: '对话模型' },
];

const PROVIDERS = [
  '自定义 (OpenAI 兼容)',
  'OpenAI',
  'Anthropic',
  'Google Gemini',
  'DeepSeek',
  '智谱 AI',
  'MINIMAX',
];

export function AddModelModal({ endpoint, onClose, onAdd }: AddModelModalProps) {
  const [modelType, setModelType] = useState<'chat' | 'embedding' | 'image'>('chat');
  const [customName, setCustomName] = useState('');
  const [provider, setProvider] = useState(endpoint.provider);
  const [apiKey, setApiKey] = useState(endpoint.apiKey);
  const [apiUrl, setApiUrl] = useState(endpoint.apiUrl);
  const [modelName, setModelName] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  const baseUrl = apiUrl.trim().replace(/\/$/, '');
  const previewUrl = baseUrl ? `${baseUrl}/chat/completions` : '';

  const handleTestConfig = () => {
    setTestStatus('testing');
    setTimeout(() => setTestStatus('success'), 1500);
  };

  const handleAdd = () => {
    if (!modelName.trim()) return;
    const newModel: AIModel = {
      id: `m-${Date.now()}`,
      name: modelName.trim(),
      customName: customName.trim() || undefined,
      type: modelType,
      isDefault: false,
      isDefaultQuickAdd: false,
      isDefaultTextTest: false,
      isDefaultTranslation: false,
    };
    onAdd(endpoint.id, newModel, { apiKey, apiUrl, provider });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container ai-modal ai-modal-wide" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="ai-modal-header">
          <div>
            <div className="ai-modal-title">添加模型</div>
            <div className="ai-modal-subtitle">保存后会立即写入设置，并参与默认模型选择。</div>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="ai-modal-divider" />

        {/* Form */}
        <div className="ai-modal-body ai-modal-body-scroll">
          {/* Row 1: 模型类型 + 自定义名称 */}
          <div className="ai-form-row">
            <div className="ai-form-group ai-form-group-half">
              <label className="ai-form-label">模型类型</label>
              <div className="ai-select-wrapper">
                <select
                  className="ai-select"
                  value={modelType}
                  onChange={e => setModelType(e.target.value as 'chat' | 'embedding' | 'image')}
                >
                  {MODEL_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <span className="ai-select-icon">▾</span>
              </div>
            </div>
            <div className="ai-form-group ai-form-group-half">
              <label className="ai-form-label">自定义名称（可选）</label>
              <input
                type="text"
                className="ai-input"
                placeholder="例如：我的 GPT-4o、工作用"
                value={customName}
                onChange={e => setCustomName(e.target.value)}
              />
            </div>
          </div>

          {/* Row 2: 供应商 + API Key */}
          <div className="ai-form-row">
            <div className="ai-form-group ai-form-group-half">
              <label className="ai-form-label">供应商</label>
              <div className="ai-select-wrapper">
                <select
                  className="ai-select"
                  value={provider}
                  onChange={e => setProvider(e.target.value)}
                >
                  {PROVIDERS.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <span className="ai-select-icon">▾</span>
              </div>
            </div>
            <div className="ai-form-group ai-form-group-half">
              <label className="ai-form-label">API Key</label>
              <div className="ai-input-wrapper">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  className="ai-input"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="请输入 API Key"
                />
                <button
                  type="button"
                  className="ai-input-icon-btn"
                  onClick={() => setShowApiKey(v => !v)}
                >
                  {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>

          {/* API 地址 */}
          <div className="ai-form-group">
            <label className="ai-form-label">API 地址</label>
            <input
              type="text"
              className="ai-input"
              placeholder="https://api.example.com/v1"
              value={apiUrl}
              onChange={e => setApiUrl(e.target.value)}
            />
            <div className="ai-url-hint">
              <p>这里只填供应商基础地址或版本根路径即可，不用手动补 /chat/completions 或 /images/generations，SkillsHub 会自动补全。</p>
              <p>示例: https://api.openai.com · https://api.example.com/v1</p>
              {baseUrl && (
                <>
                  <p>保存后的 Base URL: <span className="ai-url-preview">{baseUrl}</span></p>
                  <p>实际请求地址预览: <span className="ai-url-preview">{previewUrl}</span></p>
                </>
              )}
            </div>
          </div>

          {/* 模型名称 */}
          <div className="ai-form-group">
            <div className="ai-form-label-row">
              <label className="ai-form-label">模型名称</label>
            </div>
            <input
              type="text"
              className="ai-input"
              placeholder="例如：gpt-4o、deepseek-chat"
              value={modelName}
              onChange={e => setModelName(e.target.value)}
            />
          </div>

          {/* 高级参数 折叠 */}
          <button
            className="ai-advanced-toggle"
            onClick={() => setIsAdvancedOpen(v => !v)}
          >
            <div>
              <div className="ai-advanced-title">高级参数</div>
              <div className="ai-advanced-desc">为当前对话模型配置生成参数。</div>
            </div>
            <span className={`ai-advanced-chevron ${isAdvancedOpen ? 'open' : ''}`}>▾</span>
          </button>
          {isAdvancedOpen && (
            <div className="ai-advanced-content">
              <p className="text-secondary" style={{ fontSize: '0.8125rem' }}>暂无高级参数配置。</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="ai-modal-footer ai-modal-footer-split">
          <button
            className="btn btn-ghost ai-test-btn"
            onClick={handleTestConfig}
            disabled={testStatus === 'testing'}
          >
            <Play size={14} />
            {testStatus === 'testing' ? '测试中...' : testStatus === 'success' ? '测试成功 ✓' : '测试当前配置'}
          </button>
          <div className="ai-modal-footer-right">
            <button className="btn btn-ghost" onClick={onClose}>取消</button>
            <button
              className="btn btn-primary"
              onClick={handleAdd}
              disabled={!modelName.trim()}
            >
              添加模型
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
