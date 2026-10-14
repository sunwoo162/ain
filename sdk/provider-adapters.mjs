import { randomUUID } from 'node:crypto';

/**
 * Explicit opt-in instrumentation for non-streaming provider HTTP APIs.
 * The provider request/response remains in the application. Only allowlisted
 * metadata is sent to the local MindTrace collector.
 *
 * Supported: OpenAI Responses, Anthropic Messages, Ollama Chat.
 * Streaming, built-in external tools and hidden reasoning are NOT traced.
 */
const PROVIDERS = {
  openai: { name: 'OpenAI', url: 'https://api.openai.com/v1/responses' },
  anthropic: { name: 'Anthropic', url: 'https://api.anthropic.com/v1/messages' },
  ollama: { name: 'Ollama', url: 'http://127.0.0.1:11434/api/chat' },
};

const allowedModel = (value) =>
  typeof value === 'string' && /^[A-Za-z0-9_.:\/-]{1,64}$/.test(value) ? value : 'unknown-model';
const positiveInt = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
const shortCode = (value) =>
  typeof value === 'string' && /^[a-z_]{1,35}$/.test(value) ? value : null;
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function validateOllamaUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash ||
      url.pathname !== '/api/chat') {
    throw new Error('Ollama endpoint must be a loopback HTTP /api/chat URL.');
  }
  return url.toString();
}

function metadata(provider, data, elapsed, status) {
  const usage = record(data?.usage) ? data.usage : {};
  const input = positiveInt(provider === 'ollama' ? data?.prompt_eval_count : usage.input_tokens);
  const output = positiveInt(provider === 'ollama' ? data?.eval_count : usage.output_tokens);
  const stop = shortCode(provider === 'anthropic' ? data?.stop_reason :
    provider === 'ollama' ? data?.done_reason : data?.status);
  const totalNs = provider === 'ollama' && Number.isFinite(data?.total_duration)
    && data.total_duration >= 0 ? Math.round(data.total_duration / 1_000_000) : null;
  const parts = [`HTTP ${status}`, `클라이언트 응답 ${elapsed}ms`];
  if (input !== null) parts.push(`입력 ${input} tokens`);
  if (output !== null) parts.push(`출력 ${output} tokens`);
  if (stop) parts.push(`상태 ${stop}`);
  if (totalNs !== null) parts.push(`Ollama 처리 ${totalNs}ms`);
  return parts.join(' · ');
}

function providerToolCount(provider, result) {
  if (provider === 'openai') {
    return Array.isArray(result?.output)
      ? result.output.filter(item =>
        ['function_call', 'custom_tool_call', 'mcp_call', 'web_search_call', 'file_search_call']
          .includes(item?.type)).length : 0;
  }
  if (provider === 'anthropic') {
    return Array.isArray(result?.content)
      ? result.content.filter(item => item?.type === 'tool_use' || item?.type === 'server_tool_use').length : 0;
  }
  return Array.isArray(result?.message?.tool_calls) ? result.message.tool_calls.length : 0;
}

export class ProviderHttpError extends Error {
  constructor(provider, status) {
    super(`${PROVIDERS[provider].name} request failed (HTTP ${status}).`);
    this.name = 'ProviderHttpError';
    this.status = status;
    this.provider = provider;
  }
}

/**
 * Returns non-streaming, instrumented functions. The actual provider response
 * is returned unmodified. Collector errors never break successful AI calls.
 * The only transmitted labels are provider names, short model IDs and counts.
 */
export function createProviderObservers({
  traceClient, fetcher = fetch, ollamaUrl = PROVIDERS.ollama.url,
  onTraceError = () => {},
} = {}) {
  if (!traceClient || typeof traceClient.send !== 'function' ||
      typeof traceClient.node !== 'function' || typeof traceClient.edge !== 'function') {
    throw new TypeError('A MindTrace traceClient is required.');
  }
  if (typeof fetcher !== 'function') throw new TypeError('fetcher must be a function.');
  const ollamaEndpoint = validateOllamaUrl(ollamaUrl);

  async function recordCall(provider, model, result, status, startedAt, elapsed, failed) {
    const runId = randomUUID(); // Never use provider response IDs or caller trace IDs.
    const prefix = `provider-${provider}-${runId}`;
    const service = PROVIDERS[provider].name;
    const observedAt = new Date().toISOString();
    const events = [
      traceClient.node({
        id: `${prefix}-request`, kind: 'prompt', label: `${service} API 요청`,
        detail: '요청이 발생했다는 사실만 기록했습니다. 질문 본문은 수집하지 않습니다.',
        createdAt: startedAt, evidence: 'observed',
      }),
      traceClient.node({
        id: `${prefix}-model`, kind: 'model', label: `${service} · ${allowedModel(model)}`,
        detail: `${service} HTTP 호출 · non-streaming`, createdAt: startedAt, evidence: 'observed',
      }),
      traceClient.edge({
        id: `${prefix}-request-model`, source: `${prefix}-request`,
        target: `${prefix}-model`, kind: 'input-to', createdAt: startedAt, evidence: 'observed',
      }),
    ];

    if (failed) {
      events.push(traceClient.node({
        id: `${prefix}-error`, kind: 'error', label: `${service} 요청 실패`,
        detail: `HTTP ${status ?? 'network'} · ${elapsed}ms`,
        createdAt: observedAt, evidence: 'observed',
      }));
      events.push(traceClient.edge({
        id: `${prefix}-error-link`, source: `${prefix}-model`,
        target: `${prefix}-error`, kind: 'related',
        createdAt: observedAt, evidence: 'observed',
      }));
    } else {
      events.push(traceClient.node({
        id: `${prefix}-answer`, kind: 'answer', label: `${service} 응답 수신`,
        detail: metadata(provider, result, elapsed, status),
        createdAt: observedAt, evidence: 'observed',
      }));
      events.push(traceClient.edge({
        id: `${prefix}-answer-link`, source: `${prefix}-model`,
        target: `${prefix}-answer`, kind: 'produced',
        createdAt: observedAt, evidence: 'observed',
      }));
      // A provider can REQUEST a tool call. This is not proof that the tool ran.
      const toolCount = Math.min(providerToolCount(provider, result), 50);
      if (toolCount > 0) {
        events.push(traceClient.node({
          id: `${prefix}-tool`, kind: 'tool', label: `${service} 도구 호출 요청 ${toolCount}건`,
          detail: '모델 응답에 도구 호출 요청이 포함되었습니다. 실제 도구 실행 여부는 확인하지 않았습니다.',
          createdAt: observedAt, evidence: 'reported',
        }));
        events.push(traceClient.edge({
          id: `${prefix}-tool-link`, source: `${prefix}-model`,
          target: `${prefix}-tool`, kind: 'related',
          createdAt: observedAt, evidence: 'reported',
        }));
      }
    }
    try {
      await traceClient.send(events);
    } catch {
      // Fail open, and never forward the potentially secret-rich error object.
      try { onTraceError('Local collector did not accept this request; no trace was saved.'); }
      catch { /* observer callbacks cannot break provider calls */ }
    }
  }

  async function invoke(provider, { apiKey, body } = {}) {
    if (!record(body) || !allowedModel(body.model) || allowedModel(body.model) === 'unknown-model') {
      throw new TypeError('A request object with a valid model ID is required.');
    }
    if (body.stream !== undefined && body.stream !== false) {
      throw new Error('Streaming is not supported by these metadata-only adapters.');
    }
    if (provider !== 'ollama' && (typeof apiKey !== 'string' || !apiKey.trim())) {
      throw new Error(`${PROVIDERS[provider].name} API key is required.`);
    }
    const service = PROVIDERS[provider];
    const url = provider === 'ollama' ? ollamaEndpoint : service.url;
    const headers = { 'content-type': 'application/json' };
    if (provider === 'openai') headers.authorization = `Bearer ${apiKey}`;
    if (provider === 'anthropic') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    }
    const outbound = { ...body, stream: false };
    const startedAt = new Date().toISOString();
    const started = performance.now();
    let status = null;
    let failed = true;
    let result;
    try {
      const response = await fetcher(url, {
        method: 'POST', headers, body: JSON.stringify(outbound), redirect: 'error',
      });
      status = response.status;
      if (!response.ok) throw new ProviderHttpError(provider, status);
      result = await response.json();
      failed = false;
      return result;
    } finally {
      const elapsed = Math.max(0, Math.round(performance.now() - started));
      // Include only sanitized counts and known provider/model names, never
      // request content, output text, tool arguments, raw errors or API keys.
      await recordCall(provider, body.model, result, status, startedAt, elapsed, failed);
    }
  }

  return {
    openaiResponses: (options) => invoke('openai', options),
    anthropicMessages: (options) => invoke('anthropic', options),
    ollamaChat: (options) => invoke('ollama', options),
  };
}
