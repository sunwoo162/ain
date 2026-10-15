/**
 * Dependency-free SDK for Node.js 22+.
 * Explicit opt-in: callers decide which sanitized fields to send.
 * No automatic prompt, environment, API key, or model-internal data capture.
 */
export function createTraceClient({ token, baseUrl = 'http://127.0.0.1:4318', source = 'my-agent', fetcher = fetch } = {}) {
  if (typeof token !== 'string' || token.length < 12) throw new Error('A collector token is required.');
  const endpoint = new URL(baseUrl);
  if (endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) ||
      endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') {
    throw new Error('The SDK only sends traces to a loopback HTTP collector.');
  }
  const send = async (events) => {
    const response = await fetcher(new URL('/v1/events', endpoint), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ schemaVersion: 1, events }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Trace collector responded with HTTP ${response.status}`);
    return response.json();
  };
  const safeTraceId = traceId => {
    if (traceId === undefined) return undefined;
    if (typeof traceId !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(traceId)) {
      throw new TypeError('traceId must be an opaque 8–80 character identifier.');
    }
    return traceId;
  };
  const node = ({ id, kind, label, detail = '', evidence = 'observed', traceId, createdAt = new Date().toISOString() }) => ({
    type: 'node', node: { id, kind, label, detail, createdAt, source, evidence,
      ...(traceId === undefined ? {} : { traceId: safeTraceId(traceId) }) },
  });
  const edge = ({ id, source: from, target, kind, evidence = 'observed', traceId, createdAt = new Date().toISOString() }) => ({
    type: 'edge', edge: { id, source: from, target, kind, createdAt, evidence,
      ...(traceId === undefined ? {} : { traceId: safeTraceId(traceId) }) },
  });
  return { send, node, edge };
}
