import { randomUUID } from 'node:crypto';
import { ProviderHttpError } from './provider-adapters.mjs';

const PROVIDERS = {
  openai: { label: 'OpenAI', endpoint: 'https://api.openai.com/v1/responses', format: 'sse' },
  anthropic: { label: 'Anthropic', endpoint: 'https://api.anthropic.com/v1/messages', format: 'sse' },
  ollama: { label: 'Ollama', endpoint: 'http://127.0.0.1:11434/api/chat', format: 'ndjson' },
};
const TOOL_TYPES = new Set(['function_call', 'custom_tool_call', 'mcp_call', 'web_search_call', 'file_search_call']);
const MAX_FRAME = 128 * 1024;

const safeModel = value => typeof value === 'string' && /^[A-Za-z0-9_./:-]{1,64}$/.test(value) ? value : null;
const safeInt = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const localOllama = input => {
  const url = new URL(input);
  if (url.protocol !== 'http:' ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/api/chat') {
    throw new Error('Ollama stream must use a loopback HTTP /api/chat endpoint.');
  }
  return url.toString();
};

/** A bounded, transient parser. Raw content is never saved in trace state. */
export function createStreamMetadataParser(provider) {
  if (!PROVIDERS[provider]) throw new TypeError('Unknown stream provider.');
  const stats = { input: null, output: null, toolRequests: 0, outcome: 'completed' };
  const decoder = new TextDecoder();
  let buffer = '';
  let eventData = [];
  let dropping = false;

  const observe = event => {
    if (!event || typeof event !== 'object') return;
    if (provider === 'openai') {
      if (event.type === 'response.completed' || event.type === 'response.incomplete') {
        const u = event.response?.usage;
        stats.input = safeInt(u?.input_tokens) ?? stats.input;
        stats.output = safeInt(u?.output_tokens) ?? stats.output;
        if (event.type === 'response.incomplete') stats.outcome = 'incomplete';
      }
      if (event.type === 'response.failed' || event.type === 'error') stats.outcome = 'error';
      if (event.type === 'response.output_item.added' && TOOL_TYPES.has(event.item?.type)) {
        stats.toolRequests = Math.min(50, stats.toolRequests + 1);
      }
    } else if (provider === 'anthropic') {
      if (event.type === 'message_start') {
        stats.input = safeInt(event.message?.usage?.input_tokens) ?? stats.input;
      } else if (event.type === 'message_delta') {
        // Anthropic message_delta usage contains cumulative output tokens.
        stats.output = safeInt(event.usage?.output_tokens) ?? stats.output;
      } else if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
        stats.toolRequests = Math.min(50, stats.toolRequests + 1);
      } else if (event.type === 'error') {
        stats.outcome = 'error';
      }
    } else {
      if (Array.isArray(event.message?.tool_calls)) {
        stats.toolRequests = Math.min(50, stats.toolRequests + event.message.tool_calls.length);
      }
      if (event.done === true) {
        stats.input = safeInt(event.prompt_eval_count) ?? stats.input;
        stats.output = safeInt(event.eval_count) ?? stats.output;
      }
      if (event.error) stats.outcome = 'error';
    }
  };

  const decodeEvent = payload => {
    if (!payload || payload === '[DONE]' || payload.length > MAX_FRAME) return;
    try { observe(JSON.parse(payload)); } catch { /* Unknown/private data ignored. */ }
  };
  const flushEvent = () => {
    if (eventData.length) decodeEvent(eventData.join('\n'));
    eventData = [];
  };
  const handleLine = line => {
    const trimmed = line.endsWith('\r') ? line.slice(0, -1) : line;
    if (provider === 'ollama') { decodeEvent(trimmed.trim()); return; }
    if (trimmed === '') { flushEvent(); return; }
    if (trimmed.startsWith('data:')) {
      eventData.push(trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed.slice(5));
      if (eventData.reduce((n, item) => n + item.length, 0) > MAX_FRAME) {
        eventData = []; dropping = true;
      }
    }
  };
  return {
    stats,
    push(bytes) {
      let text = decoder.decode(bytes, { stream: true });
      // Parse complete lines as they arrive. Oversized content is discarded
      // only until its next blank-line delimiter, without losing later events.
      while (text.length > 0) {
        const newline = text.indexOf('\n');
        if (newline === -1) {
          if (buffer.length + text.length > MAX_FRAME) {
            buffer = ''; eventData = []; dropping = true;
          } else if (!dropping) buffer += text;
          break;
        }
        const piece = text.slice(0, newline);
        text = text.slice(newline + 1);
        if (buffer.length + piece.length > MAX_FRAME) {
          buffer = ''; eventData = []; dropping = true;
          continue;
        }
        const line = buffer + piece;
        buffer = '';
        if (dropping) {
          if (line.trim() === '') dropping = false;
        } else handleLine(line);
      }
    },
    finish() {
      const tail = decoder.decode();
      if (tail) this.push(new TextEncoder().encode(tail));
      if (buffer.length && !dropping) handleLine(buffer);
      if (!dropping) flushEvent();
      buffer = ''; eventData = [];
      return { ...stats };
    },
  };
}

/**
 * Streams provider bytes unmodified to the caller with backpressure.
 * Only time/count/status metadata reaches the locally authenticated collector.
 *
 * Streaming methods return { response: Response, traceDone: Promise<void> }.
 * Read/cancel response.body to finish the trace; await traceDone if needed.
 */
export function createStreamingObservers({
  traceClient,
  fetcher = fetch,
  ollamaUrl = PROVIDERS.ollama.endpoint,
  onTraceError = () => {},
} = {}) {
  if (!traceClient || ['node', 'edge', 'send'].some(key => typeof traceClient[key] !== 'function')) {
    throw new TypeError('A local traceClient is required.');
  }
  if (typeof fetcher !== 'function') throw new TypeError('fetcher must be a function.');
  const ollamaEndpoint = localOllama(ollamaUrl);

  async function invoke(provider, { apiKey, body } = {}) {
    const spec = PROVIDERS[provider];
    if (!spec || !body || typeof body !== 'object' || Array.isArray(body) || !safeModel(body.model)) {
      throw new TypeError('A valid provider and model are required.');
    }
    if (body.stream === false) throw new Error('Use the non-streaming adapter for stream:false.');
    if (provider !== 'ollama' && (typeof apiKey !== 'string' || !apiKey.trim())) {
      throw new Error('Provider API key is required.');
    }
    const endpoint = provider === 'ollama' ? ollamaEndpoint : spec.endpoint;
    const headers = { 'content-type': 'application/json' };
    if (provider === 'openai') headers.authorization = `Bearer ${apiKey}`;
    if (provider === 'anthropic') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    }

    const run = `stream-${provider}-${randomUUID()}`;
    const createdAt = new Date().toISOString();
    const startMs = performance.now();
    const model = body.model; // Validated identifier, never user-generated text.
    const node = (suffix, kind, label, detail, timestamp) => traceClient.node({
      id: `${run}-${suffix}`, kind, label, detail,
      evidence: 'observed', traceId: run.slice(`stream-${provider}-`.length), createdAt: timestamp,
    });
    const edge = (suffix, source, target, kind, timestamp) => traceClient.edge({
      id: `${run}-${suffix}`, source: `${run}-${source}`,
      target: `${run}-${target}`, kind, evidence: 'observed', traceId: run.slice(`stream-${provider}-`.length), createdAt: timestamp,
    });
    let queue = Promise.resolve();
    const send = events => {
      queue = queue.then(() => traceClient.send(events)).catch(() => {
        try { onTraceError('Local collector failed; trace data may be incomplete.'); }
        catch { /* keep provider call independent from telemetry */ }
      });
      return queue;
    };
    const requestEvents = [
      node('request', 'prompt', `${spec.label} 스트림 요청`, '요청 본문은 수집하지 않습니다.', createdAt),
      node('model', 'model', `${spec.label} · ${model}`, 'Streaming API 요청', createdAt),
      edge('request-model', 'request', 'model', 'input-to', createdAt),
    ];
    void send(requestEvents);
    let status = null;
    let completed = false;
    let finished;
    const traceDone = new Promise(resolve => { finished = resolve; });
    const parser = createStreamMetadataParser(provider);
    let firstChunkAt = null;
    let firstMs = 0;
    const finish = (outcome = 'completed') => {
      if (completed) return;
      completed = true;
      const doneAt = new Date().toISOString();
      const elapsed = Math.max(0, Math.round(performance.now() - startMs));
      const stats = parser.finish();
      const failed = outcome !== 'completed' || stats.outcome !== 'completed';
      const label = failed ? `${spec.label} 스트림 ${outcome === 'cancelled' ? '중단' : '실패'}`
        : `${spec.label} 스트림 완료`;
      const metrics = [`HTTP ${status ?? 'network'}`, `전체 ${elapsed}ms`];
      if (firstChunkAt) metrics.push(`첫 청크 ${firstMs}ms`);
      if (stats.input !== null) metrics.push(`입력 ${stats.input} tokens`);
      if (stats.output !== null) metrics.push(`출력 ${stats.output} tokens`);
      if (stats.toolRequests > 0) metrics.push(`도구 호출 요청 ${stats.toolRequests}건 (실행 여부 미확인)`);
      const events = [
        node('complete', failed ? 'error' : 'answer', label, metrics.join(' · '), doneAt),
        edge('result', 'model', 'complete', failed ? 'related' : 'produced', doneAt),
      ];
      void send(events).then(finished);
    };
    let response;
    try {
      response = await fetcher(endpoint, {
        method: 'POST', headers, body: JSON.stringify({ ...body, stream: true }), redirect: 'error',
      });
      status = response.status;
      if (!response.ok) throw new ProviderHttpError(provider, status);
      if (!response.body) throw new Error('Provider response did not contain a readable stream.');
    } catch (error) {
      finish('error');
      throw error;
    }
    const reader = response.body.getReader();
    const output = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            finish();
            controller.close();
            return;
          }
          if (!firstChunkAt) {
            firstChunkAt = new Date().toISOString();
            firstMs = Math.max(0, Math.round(performance.now() - startMs));
            void send([
              node('first', 'tool', `${spec.label} 첫 스트림 청크`,
                `첫 청크 수신 ${firstMs}ms · 응답 본문은 저장하지 않음`, firstChunkAt),
              edge('first-link', 'model', 'first', 'related', firstChunkAt),
            ]);
          }
          parser.push(value);
          controller.enqueue(value); // Exact provider bytes, not transformed JSON.
        } catch (error) {
          finish('error');
          controller.error(error);
        }
      },
      async cancel(reason) {
        finish('cancelled');
        try { await reader.cancel(reason); } catch { /* already closed */ }
      },
    }, { highWaterMark: 0 });
    return {
      response: new Response(output, {
        status: response.status,
        statusText: response.statusText,
        headers: { 'content-type': response.headers.get('content-type') ?? 'application/octet-stream' },
      }),
      traceDone,
    };
  }

  return {
    openaiResponsesStream: options => invoke('openai', options),
    anthropicMessagesStream: options => invoke('anthropic', options),
    ollamaChatStream: options => invoke('ollama', options),
  };
}
