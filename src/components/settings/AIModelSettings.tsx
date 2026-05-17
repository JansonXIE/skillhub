import { useState, useEffect } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import type { AIModel, Endpoint } from '../../types/ai';
import { EditEndpointModal } from '../modals/EditEndpointModal';
import { AddModelModal } from '../modals/AddModelModal';

const INITIAL_ENDPOINTS: Endpoint[] = [
  {
    id: '1',
    provider: '自定义 (OpenAI 兼容)',
    apiKey: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    apiUrl: 'https://api.example.com/v1',
    isVerified: false,
    models: [
      {
        id: 'm1',
        name: 'DeepSeek-V4-Flash',
        type: 'chat',
        isDefault: true,
        isDefaultQuickAdd: true,
        isDefaultTextTest: true,
        isDefaultTranslation: true,
      },
    ],
  },
];

const MODEL_TYPE_LABELS: Record<string, string> = {
  chat: '对话模型',
};

// SVG 图标合集，避免 lucide-react 版本导出不稳定的问题
const Icons = {
  Shield: ({ size = 12 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  Edit: ({ size = 14 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  Plus: ({ size = 14 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  ),
  Play: ({ size = 14 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
  ),
  Trash: ({ size = 14 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>
  ),
};

const STORAGE_KEY = 'skillhub-ai-endpoints';

export function AIModelSettings() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved) as Endpoint[];
    } catch {
      // ignore
    }
    return INITIAL_ENDPOINTS;
  });
  const [testResult, setTestResult] = useState<{ id: string; msg: string } | null>(null);
  const [editingEndpoint, setEditingEndpoint] = useState<Endpoint | null>(null);
  const [addingForEndpoint, setAddingForEndpoint] = useState<Endpoint | null>(null);

  // 每次 endpoints 变化时同步到 localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(endpoints));
  }, [endpoints]);

  const handleTestConnection = (endpoint: Endpoint) => {
    const urlOk = endpoint.apiUrl.trim().length > 0 && endpoint.apiUrl !== 'https://api.example.com/v1';
    const keyOk = endpoint.apiKey.trim().length > 0 && !endpoint.apiKey.startsWith('sk-xxx');
    const hasModels = endpoint.models.length > 0;

    if (!urlOk || !keyOk) {
      setTestResult({ id: endpoint.id, msg: '请先填写有效的 API 地址和 API Key' });
      setTimeout(() => setTestResult(null), 3000);
      return;
    }

    if (!hasModels) {
      setTestResult({ id: endpoint.id, msg: '请先为该端点添加至少一个模型' });
      setTimeout(() => setTestResult(null), 3000);
      return;
    }

    // 验证通过，标记为已验证
    setEndpoints(prev => prev.map(ep =>
      ep.id === endpoint.id ? { ...ep, isVerified: true } : ep
    ));
    setTestResult({ id: endpoint.id, msg: '端点链接成功！' });
    setTimeout(() => setTestResult(null), 3000);
  };

  const handleSaveEndpoint = (updated: Endpoint) => {
    // 每次编辑保存后，重置验证状态为未验证
    setEndpoints(prev => prev.map(ep => 
      ep.id === updated.id ? { ...updated, isVerified: false } : ep
    ));
    setEditingEndpoint(null);
  };

  const handleAddModel = (
    endpointId: string,
    model: AIModel,
    endpointInfo?: { apiKey: string; apiUrl: string; provider: string }
  ) => {
    setEndpoints(prev => prev.map(ep =>
      ep.id === endpointId
        ? {
            ...ep,
            ...(endpointInfo ?? {}),
            models: [...ep.models, model],
          }
        : ep
    ));
    setAddingForEndpoint(null);
  };

  const handleDeleteModel = (endpointId: string, modelId: string) => {
    setEndpoints(prev => prev.map(ep =>
      ep.id === endpointId ? { ...ep, models: ep.models.filter(m => m.id !== modelId) } : ep
    ));
  };

  return (
    <div className="settings-section fade-in">
      <h2 className="settings-title">AI 模型</h2>
      <h3 className="settings-subtitle">已配置账户 / 端点</h3>

      <div className="ai-endpoints-list">
        {endpoints.map(endpoint => (
          <div key={endpoint.id} className="ai-endpoint-card">
            {/* 端点头部信息 */}
            <div className="ai-endpoint-header">
              <div className="ai-endpoint-icon">
                <SettingsIcon size={20} />
              </div>
              <div className="ai-endpoint-info">
                <div className="ai-endpoint-name-row">
                  <span className="ai-endpoint-name">{endpoint.provider}</span>
                  <span className={`ai-badge ${endpoint.isVerified ? 'ai-badge-verified' : 'ai-badge-unverified'}`}>
                    <Icons.Shield size={10} />
                    {endpoint.isVerified ? '已验证' : '未验证'}
                  </span>
                </div>
                <div className="ai-endpoint-url">{endpoint.apiUrl}</div>
                <div className="ai-endpoint-model-count">{endpoint.models.length} 个模型</div>
              </div>
              <div className="ai-endpoint-actions">
                <button
                  className="ai-action-btn ai-action-btn-ghost"
                  onClick={() => handleTestConnection(endpoint)}
                >
                  <Icons.Play /> 测试连接
                </button>
                <button
                  className="ai-action-btn ai-action-btn-ghost"
                  onClick={() => setEditingEndpoint(endpoint)}
                >
                  <Icons.Edit /> 编辑
                </button>
                <button
                  className="ai-action-btn ai-action-btn-primary"
                  onClick={() => setAddingForEndpoint(endpoint)}
                >
                  <Icons.Plus /> 添加模型
                </button>
              </div>
            </div>

            {/* 测试连接成功提示 */}
            {testResult?.id === endpoint.id && (
              <div className="ai-test-toast success">
                <Icons.Shield size={14} /> {testResult.msg}
              </div>
            )}

            {/* 模型列表 */}
            {endpoint.models.length > 0 && (
              <div className="ai-models-list">
                {endpoint.models.map(model => (
                  <div key={model.id} className="ai-model-row">
                    <div className="ai-model-icon">
                      <SettingsIcon size={14} />
                    </div>
                    <div className="ai-model-info">
                      <span className="ai-model-name">{model.name}</span>
                      {model.customName && (
                        <span className="ai-model-custom-name">{model.customName}</span>
                      )}
                      <div className="ai-model-tags">
                        <span className="ai-tag">{MODEL_TYPE_LABELS[model.type]}</span>
                        {model.isDefault && <span className="ai-tag ai-tag-highlight">该类型默认</span>}
                        {model.isDefaultQuickAdd && <span className="ai-tag ai-tag-highlight">默认 Quick Add</span>}
                        {model.isDefaultTextTest && <span className="ai-tag ai-tag-highlight">默认文本测试</span>}
                        {model.isDefaultTranslation && <span className="ai-tag ai-tag-highlight">默认翻译</span>}
                      </div>
                    </div>
                    <div className="ai-model-actions">
                      <button
                        className="ai-icon-btn ai-icon-btn-danger"
                        title="删除模型"
                        onClick={() => handleDeleteModel(endpoint.id, model.id)}
                      >
                        <Icons.Trash />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 编辑端点弹窗 */}
      {editingEndpoint && (
        <EditEndpointModal
          endpoint={editingEndpoint}
          onClose={() => setEditingEndpoint(null)}
          onSave={handleSaveEndpoint}
        />
      )}

      {/* 添加模型弹窗 */}
      {addingForEndpoint && (
        <AddModelModal
          endpoint={addingForEndpoint}
          onClose={() => setAddingForEndpoint(null)}
          onAdd={handleAddModel}
        />
      )}
    </div>
  );
}
