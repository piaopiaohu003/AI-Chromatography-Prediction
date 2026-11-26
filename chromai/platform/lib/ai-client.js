'use strict';

/* Thin OpenAI-compatible client used for AI method design.
 * Works with any provider exposing /chat/completions (OpenAI, DeepSeek,
 * Moonshot, Qwen compatible mode, local vLLM/Ollama gateways, ...). */

class AIError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AIError';
  }
}

function defaultBaseUrl() {
  return process.env.CHROM_AI_BASE_URL
    || process.env.OPENAI_BASE_URL
    || 'https://api.deepseek.com/v1';
}

function defaultModel() {
  return process.env.CHROM_AI_MODEL
    || process.env.OPENAI_MODEL
    || 'deepseek-chat';
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveConfig(override) {
  const o = override || {};
  const baseUrl = clean(o.base_url) || defaultBaseUrl();
  const model = clean(o.model) || defaultModel();
  const apiKey = clean(o.api_key)
    || process.env.CHROM_AI_API_KEY
    || process.env.OPENAI_API_KEY
    || '';
  return {
    base_url: baseUrl.replace(/\/+$/, ''),
    model,
    api_key: apiKey,
    configured: Boolean(apiKey),
  };
}

function publicStatus(override) {
  const config = resolveConfig(override);
  return {
    configured: config.configured,
    model: config.model,
    base_url: config.base_url,
    source: config.configured ? 'api' : 'rule',
  };
}

function endpoint(baseUrl) {
  const base = baseUrl.replace(/\/+$/, '');
  if (base.endsWith('/chat/completions')) {
    return base;
  }
  if (/\/v\d+[a-z0-9_-]*$/i.test(base)) {
    return base + '/chat/completions';
  }
  return base + '/v1/chat/completions';
}

function aiTimeoutMs() {
  const raw = Number(process.env.CHROM_AI_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw >= 1000) {
    return Math.min(Math.round(raw), 120000);
  }
  return 40000;
}

async function post(config, payload) {
  const url = endpoint(config.base_url);
  const headers = {
    Authorization: `Bearer ${config.api_key}`,
    'Content-Type': 'application/json',
  };
  const data = { ...payload, model: config.model };
  const timeoutMs = aiTimeoutMs();
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (exc) {
    // network / proxy / timeout problems
    if (exc && (exc.name === 'TimeoutError' || exc.name === 'AbortError')) {
      throw new AIError(`大模型响应超时（${Math.round(timeoutMs / 1000)}s）`);
    }
    throw new AIError(`网络请求失败：${exc && exc.message ? exc.message : exc}`);
  }
  return { url, headers, payload: data, response };
}

function buildPayload(messages, options = {}) {
  const { jsonMode = true, maxTokens = 2000, temperature } = options;
  const payload = { messages, max_tokens: maxTokens };
  // Omit temperature unless a caller explicitly needs it: several newer models
  // (for example Moonshot kimi-k3) reject any value other than 1.
  if (temperature !== undefined && temperature !== null) {
    payload.temperature = temperature;
  }
  if (jsonMode) {
    payload.response_format = { type: 'json_object' };
  }
  return payload;
}

async function chat(config, messages, options = {}) {
  if (!config || !config.configured) {
    throw new AIError('未配置 API Key');
  }
  const { jsonMode = true } = options;
  const payload = buildPayload(messages, options);

  let result = await post(config, payload);
  let response = result.response;
  let text = await response.text();

  // Some providers reject response_format; retry once without it.
  if ([400, 404, 422].includes(response.status) && jsonMode) {
    delete payload.response_format;
    result = await post(config, payload);
    response = result.response;
    text = await response.text();
  }

  // A provider may still insist on a fixed temperature; drop ours and retry.
  if (response.status === 400 && payload.temperature !== undefined && /temperature/i.test(text)) {
    delete payload.temperature;
    result = await post(config, payload);
    response = result.response;
    text = await response.text();
  }

  if (response.status >= 400) {
    throw new AIError(`大模型接口返回 ${response.status}：${text.slice(0, 400)}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (exc) {
    throw new AIError('大模型返回内容不是合法 JSON');
  }

  let message;
  try {
    message = data.choices[0].message;
  } catch (exc) {
    throw new AIError('大模型响应结构异常');
  }
  if (message === null || typeof message !== 'object') {
    throw new AIError('大模型响应结构异常');
  }

  let content = message.content || '';
  if (!content && message.reasoning_content) {
    content = message.reasoning_content;
  }
  if (!String(content).trim()) {
    throw new AIError('大模型返回空内容');
  }
  return content;
}

// Return the substring of s starting at start that forms a balanced JSON object.
function balancedJsonAt(s, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i += 1) {
    const ch = s[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return s.slice(start, i + 1);
      }
    }
  }
  return null;
}

function extractJson(text) {
  let cleaned = String(text).trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\s*/, '');
    cleaned = cleaned.replace(/\s*```$/, '');
  }
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (exc) {
    // fall through to the tolerant scan
  }

  for (let start = cleaned.indexOf('{'); start !== -1; start = cleaned.indexOf('{', start + 1)) {
    const candidate = balancedJsonAt(cleaned, start);
    if (candidate === null) {
      continue;
    }
    try {
      const parsed = JSON.parse(candidate);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch (exc) {
      // keep scanning
    }
  }
  throw new AIError('无法从大模型输出中解析 JSON');
}

async function testConnection(config) {
  const started = Date.now();
  const content = await chat(
    config,
    [
      { role: 'system', content: 'You are a connectivity probe. Reply with OK only.' },
      { role: 'user', content: 'ping' },
    ],
    { jsonMode: false, maxTokens: 16 },
  );
  return {
    ok: true,
    message: String(content).trim().slice(0, 120),
    latency_ms: Math.trunc(Date.now() - started),
  };
}

module.exports = {
  AIError,
  resolveConfig,
  publicStatus,
  endpoint,
  buildPayload,
  chat,
  extractJson,
  testConnection,
};
