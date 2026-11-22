import { Languages, Loader2, RefreshCw } from 'lucide-react';
import type { useSkillTranslation } from '../hooks/useSkillTranslation';

interface SkillTranslateButtonProps {
  translation: ReturnType<typeof useSkillTranslation>;
  disabled?: boolean;
}

export function SkillTranslateButton({ translation, disabled }: SkillTranslateButtonProps) {
  const { status, error, showTranslated, setShowTranslated, translate, cancel } = translation;
  const btnClass = 'skill-action-btn text-sm flex items-center gap-1 px-2 w-auto h-auto';

  return (
    <div className="flex items-center gap-2">
      {status === 'error' && error && (
        <span className="text-xs" style={{ color: '#ef4444', maxWidth: 360 }} title={error}>
          {error.length > 60 ? `${error.slice(0, 60)}...` : error}
        </span>
      )}

      {status === 'translating' ? (
        <button className={`${btnClass} text-primary`} onClick={cancel} title="点击停止翻译">
          <Loader2 size={14} className="spin-animation" /> 翻译中...
        </button>
      ) : status === 'done' ? (
        <>
          <button
            className={`${btnClass} ${showTranslated ? 'text-primary' : ''}`}
            onClick={() => setShowTranslated(!showTranslated)}
          >
            <Languages size={14} /> {showTranslated ? '显示原文' : '显示译文'}
          </button>
          {showTranslated && (
            <button className={btnClass} onClick={() => translate(true)} title="重新翻译">
              <RefreshCw size={14} />
            </button>
          )}
        </>
      ) : (
        <button
          className={btnClass}
          onClick={() => translate()}
          disabled={disabled}
          title="使用设置中的 AI 模型将技能描述和内容翻译为中文"
        >
          <Languages size={14} /> {status === 'error' ? '重试翻译' : '翻译为中文'}
        </button>
      )}
    </div>
  );
}
