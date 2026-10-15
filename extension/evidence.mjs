/**
 * Evidence extracted from a visible ChatGPT web answer. This is a DOM capture,
 * NOT a record of the provider's complete research or hidden reasoning.
 * Pure helpers shared by the extension and Node tests.
 */
const MAX_ANSWER = 3000;
const MAX_CITATIONS = 16;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const shorten = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';

export function normalizeCapture(input) {
  if (!isObject(input)) return null;
  const answer = shorten(input.answer, MAX_ANSWER);
  if (!answer) return null;
  const sources = [];
  const seen = new Set();
  for (const item of Array.isArray(input.sources) ? input.sources.slice(0, 64) : []) {
    if (!isObject(item)) continue;
    try {
      const url = new URL(item.url);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
      if (['chatgpt.com', 'chat.openai.com'].includes(url.hostname)) continue;
      // Don't persist source URLs with query tokens, tracking IDs, or fragments.
      url.search = '';
      url.hash = '';
      const href = url.toString();
      if (href.length > 1800 || seen.has(href)) continue;
      seen.add(href);
      sources.push({ title: shorten(item.title, 160) || url.hostname, url: href });
      if (sources.length >= MAX_CITATIONS) break;
    } catch { /* Discard invalid URL. */ }
  }
  return { answer, sources };
}

export function buildTraceEvents(input, { uuid = () => crypto.randomUUID(), now = () => new Date().toISOString() } = {}) {
  const capture = normalizeCapture(input);
  if (!capture) throw new TypeError('A non-empty visible answer is required.');
  const traceId = uuid(); // Opaque locally-generated ID, never a ChatGPT conversation ID.
  const stamp = now();
  const answerId = 'chatgpt-answer-' + traceId;
  const events = [
    { type: 'node', node: {
      id: answerId, kind: 'answer', label: 'ChatGPT 웹 답변 (화면 관측)',
      detail: capture.answer, createdAt: stamp, source: 'chatgpt-web-extension',
      evidence: 'observed', traceId,
    } },
  ];
  for (let index = 0; index < capture.sources.length; index++) {
    const citation = capture.sources[index];
    const documentId = 'chatgpt-source-' + traceId + '-' + index;
    events.push({ type: 'node', node: {
      id: documentId, kind: 'document', label: citation.title,
      detail: 'ChatGPT 웹에 표시된 링크: ' + citation.url,
      createdAt: stamp, source: 'chatgpt-web-extension',
      evidence: 'reported', traceId,
    } });
    events.push({ type: 'edge', edge: {
      id: 'chatgpt-citation-' + traceId + '-' + index,
      source: answerId, target: documentId, kind: 'cited',
      createdAt: stamp, evidence: 'reported', traceId,
    } });
  }
  return { schemaVersion: 1, events };
}
