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
  const node = ({ id, kind, label, detail = '', evidence = 'observed', createdAt = new Date().toISOString() }) => ({
    type: 'node', node: { id, kind, label, detail, createdAt, source, evidence },
  });
  const edge = ({ id, source: from, target, kind, evidence = 'observed', createdAt = new Date().toISOString() }) => ({
    type: 'edge', edge: { id, source: from, target, kind, createdAt, evidence },
  });
  return { send, node, edge };
}
