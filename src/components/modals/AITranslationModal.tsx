import { useState, useEffect, useRef } from 'react';
import { X, Copy, Check, RefreshCw, Languages, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { Endpoint } from '../../types/ai';

interface AITranslationModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceContent: string;
}

export function AITranslationModal({ isOpen, onClose, sourceContent }: AITranslationModalProps) {
  const [translatedContent, setTranslatedContent] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isOpen && sourceContent) {
      handleTranslate();
    }
    return () => abortControllerRef.current?.abort();
  }, [isOpen]);

  const handleTranslate = async () => {
    setIsTranslating(true);
    setError(null);
    setTranslatedContent('');
    
    try {
      const savedEndpoints = localStorage.getItem('skillhub-ai-endpoints');
      if (!savedEndpoints) throw new Error('请先在设置中配置 AI 模型');
      
      const endpoints = JSON.parse(savedEndpoints) as Endpoint[];
      // 优先寻找已验证的端点和标记为翻译默认的模型
      const endpoint = endpoints.find(e => e.isVerified) || endpoints[0];
      if (!endpoint) throw new Error('未发现可用的 AI 端点');

      const model = endpoint.models.find(m => m.isDefaultTranslation) || 
                    endpoint.models.find(m => m.type === 'chat') || 
                    endpoint.models[0];
      
      if (!model) throw new Error('该端点下没有可用的对话模型');

      abortControllerRef.current = new AbortController();
      
      const prompt = `You are a professional translator. Translate the following Markdown content. 
If the content is in English, translate it to Chinese. 
If the content is in Chinese, translate it to English. 
Strictly maintain the original Markdown formatting, including headers, lists, code blocks, and symbols. 
Do not add any explanations, preambles, or notes. Only provide the translated content.

Content:
${sourceContent}`;

      const response = await fetch(`${endpoint.apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${endpoint.apiKey}`
        },
        body: JSON.stringify({
          model: model.name,
          messages: [{ role: 'user', content: prompt }],
          stream: true, // 开启流式输出
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) throw new Error(`API 请求失败: ${response.statusText}`);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) throw new Error('无法读取响应流');

      let accumulatedText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const data = JSON.parse(dataStr);
              const content = data.choices[0]?.delta?.content || '';
              accumulatedText += content;
              setTranslatedContent(accumulatedText);
            } catch (e) {
              // 忽略部分解析失败的 chunk
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || '翻译过程中出错');
      }
    } finally {
      setIsTranslating(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(translatedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="ai-translate-overlay fade-in">
      <div className="ai-translate-container slide-up">
        {/* Header */}
        <div className="ai-translate-header">
          <div className="flex items-center gap-3">
            <div className="ai-translate-icon-pulse">
              <Sparkles size={18} className="text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-main">AI 智能翻译</h3>
              <p className="text-xs text-secondary">正在为您进行深度中英互译并保持格式...</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              className="ai-icon-btn" 
              onClick={handleTranslate} 
              disabled={isTranslating}
              title="重新翻译"
            >
              <RefreshCw size={18} className={isTranslating ? 'animate-spin' : ''} />
            </button>
            <button className="ai-icon-btn" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="ai-translate-body">
          {error ? (
            <div className="ai-translate-error">
              <div className="text-red-500 mb-2">⚠️ 翻译出错</div>
              <p className="text-sm">{error}</p>
              <button className="btn btn-primary mt-4" onClick={handleTranslate}>重试</button>
            </div>
          ) : (
            <div className="ai-translate-content-layout">
              <div className="ai-translate-pane">
                <div className="ai-pane-label">原文</div>
                <div className="ai-pane-scroll markdown-body">
                  <ReactMarkdown>{sourceContent}</ReactMarkdown>
                </div>
              </div>
              <div className="ai-translate-divider">
                <Languages size={20} className="text-tertiary" />
              </div>
              <div className="ai-translate-pane active">
                <div className="ai-pane-label flex justify-between">
                  <span>译文</span>
                  {translatedContent && (
                    <button className="text-primary flex items-center gap-1 hover:underline" onClick={copyToClipboard}>
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      {copied ? '已复制' : '复制结果'}
                    </button>
                  )}
                </div>
                <div className="ai-pane-scroll markdown-body">
                  {isTranslating && !translatedContent ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3">
                      <div className="ai-loading-dots">
                        <span></span><span></span><span></span>
                      </div>
                      <p className="text-sm text-secondary">AI 正在思考并翻译中...</p>
                    </div>
                  ) : (
                    <ReactMarkdown>{translatedContent}</ReactMarkdown>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
