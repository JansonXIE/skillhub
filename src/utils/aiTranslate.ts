import type { AIModel, Endpoint } from '../types/ai';

const STORAGE_KEY = 'skillhub-ai-endpoints';

const SYSTEM_PROMPT = `You are a professional technical translator. Translate the user's text into Simplified Chinese.
Rules:
- Strictly preserve the original Markdown structure: headings, lists, tables, links, emphasis, and line breaks.
- Do NOT translate content inside code blocks or inline code, command lines, file paths, URLs, variable/function names, or tool/product names.
- If a passage is already in Chinese, keep it unchanged.
- Output only the translated text. Do not add explanations, preambles, notes, or wrap the result in a code block.`;

/**
 * 从设置中挑选用于翻译的模型：
 * 优先「默认翻译」模型，其次对话模型；已验证的端点优先。
 */
export function resolveTranslationModel(): { endpoint: Endpoint; model: AIModel } {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) throw new Error('请先在「设置 - AI 模型」中配置 AI 模型');

  let endpoints: Endpoint[];
  try {
    endpoints = JSON.parse(saved);
  } catch {
    throw new Error('AI 模型配置解析失败，请在设置中重新配置');
  }

  const usable = endpoints
    .filter(e => e.apiKey && e.apiUrl && e.models?.length)
    .sort((a, b) => Number(b.isVerified) - Number(a.isVerified));
  if (usable.length === 0) throw new Error('未发现可用的 AI 端点，请在设置中配置 API 地址和密钥');

  const pickers: ((m: AIModel) => boolean)[] = [
    m => m.isDefaultTranslation,
    m => m.type === 'chat',
  ];
  for (const pick of pickers) {
    for (const endpoint of usable) {
      const model = endpoint.models.find(pick);
      if (model) return { endpoint, model };
    }
  }
  throw new Error('没有可用的对话模型，请在设置中添加');
}

function buildChatUrl(apiUrl: string) {
  const base = apiUrl.trim().replace(/\/+$/, '');
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
}

/**
 * 以流式方式将文本翻译为简体中文，onChunk 会收到累计的译文。
 */
export async function translateToChinese(
  text: string,
  options: { signal?: AbortSignal; onChunk?: (accumulated: string) => void } = {},
): Promise<string> {
  if (!text.trim()) return '';
  const { endpoint, model } = resolveTranslationModel();

  const response = await fetch(buildChatUrl(endpoint.apiUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${endpoint.apiKey}`,
    },
    body: JSON.stringify({
      model: model.name,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      temperature: 0.2,
      stream: true,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`AI 请求失败 (${response.status}): ${detail.slice(0, 200) || response.statusText}`);
  }

  // 部分服务即使请求 stream 也会返回普通 JSON
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json();
    const result: string = data.choices?.[0]?.message?.content ?? '';
    options.onChunk?.(result);
    return result;
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('无法读取响应流');

  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    // 最后一行可能不完整，留到下一次拼接
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
        if (delta) {
          accumulated += delta;
          options.onChunk?.(accumulated);
        }
      } catch {
        // 忽略无法解析的片段
      }
    }
  }

  return accumulated;
}
