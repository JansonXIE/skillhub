import { useState } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import type { Endpoint } from '../../types/ai';

interface EditEndpointModalProps {
  endpoint: Endpoint;
  onClose: () => void;
  onSave: (updated: Endpoint) => void;
}

const PROVIDERS = [
  '自定义 (OpenAI 兼容)',
  'OpenAI',
  'Anthropic',
  'Google Gemini',
  'DeepSeek',
  '智谱 AI',
];

export function EditEndpointModal({ endpoint, onClose, onSave }: EditEndpointModalProps) {
  const [provider, setProvider] = useState(endpoint.provider);
  const [apiKey, setApiKey] = useState(endpoint.apiKey);
  const [apiUrl, setApiUrl] = useState(endpoint.apiUrl);
  const [showApiKey, setShowApiKey] = useState(false);

  const handleSave = () => {
    onSave({ ...endpoint, provider, apiKey, apiUrl });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container ai-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="ai-modal-header">
          <div>
            <div className="ai-modal-title">编辑端点</div>
            <div className="ai-modal-subtitle">会把该端点下所有模型的 provider / API Key / API 地址一并更新。</div>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="ai-modal-divider" />

        {/* Form */}
        <div className="ai-modal-body">
          <div className="ai-form-group">
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

          <div className="ai-form-group">
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

          <div className="ai-form-group">
            <label className="ai-form-label">API 地址</label>
            <input
              type="text"
              className="ai-input"
              value={apiUrl}
              onChange={e => setApiUrl(e.target.value)}
              placeholder="https://api.example.com/v1"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="ai-modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSave}>保存修改</button>
        </div>
      </div>
    </div>
  );
}
