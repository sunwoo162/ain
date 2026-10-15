/**
 * EEEE-compatible transport-neutral adapter: plain functions returning JSON.
 * Can be wrapped by an EEEE plugin, MCP tool or a future app integration.
 * Does not perform an answer accuracy review; that needs a separate verifier.
 */
const isLoopback = value => {
  const url = new URL(value);
  if (url.protocol !== 'http:' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash ||
      url.pathname !== '/') {
    throw new Error('MindTrace collector must be a loopback HTTP root URL.');
  }
  return url;
};
const validTraceId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(value);

export function createEeeePlugin({
  baseUrl = 'http://127.0.0.1:4318',
  token,
  fetcher = fetch,
} = {}) {
  const endpoint = isLoopback(baseUrl);
  if (typeof token !== 'string' || token.length < 12) throw new Error('Collector token required.');
  if (typeof fetcher !== 'function') throw new TypeError('fetcher must be a function.');

  async function workspace() {
    const response = await fetcher(new URL('/v1/workspace', endpoint), {
      headers: { authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('Local collector unavailable (HTTP ' + response.status + ').');
    const value = await response.json();
    if (value?.schemaVersion !== 1 || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
      throw new Error('Invalid collector response.');
    }
    return value;
  }
  return {
    describe() {
      return {
        name: 'uisim-evidence',
        version: 1,
        available: ['getExecutionTrace', 'getRecentResearch'],
        notImplemented: ['reviewAnswer', 'getReviewReport', 'compareReviews'],
        note: 'A cited source is not an independent verification of the claim.',
      };
    },
    async getExecutionTrace({ traceId } = {}) {
      if (!validTraceId(traceId)) throw new TypeError('Valid opaque traceId required.');
      const data = await workspace();
      const nodes = data.nodes.filter(node => node.traceId === traceId);
      const ids = new Set(nodes.map(node => node.id));
      return {
        traceId,
        nodes,
        edges: data.edges.filter(edge =>
          edge.traceId === traceId && ids.has(edge.source) && ids.has(edge.target)),
      };
    },
    async getRecentResearch({ limit = 5 } = {}) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 30) {
        throw new TypeError('limit must be an integer from 1 to 30.');
      }
      const data = await workspace();
      const answers = data.nodes
        .filter(node => node.kind === 'answer' && node.source === 'chatgpt-web-extension')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
      const documentMap = new Map(data.nodes
        .filter(node => node.kind === 'document' && node.source === 'chatgpt-web-extension')
        .map(node => [node.id, node]));
      return answers.map(answer => ({
        traceId: answer.traceId,
        answer: answer.detail,
        observedAt: answer.createdAt,
        sources: data.edges.filter(edge =>
          edge.source === answer.id && edge.kind === 'cited' && documentMap.has(edge.target))
          .map(edge => {
            const document = documentMap.get(edge.target);
            return {
              title: document.label,
              url: document.detail.replace(/^ChatGPT 웹에 표시된 링크: /, ''),
              provenance: 'chatgpt-visible-citation',
              independentlyVerified: false,
            };
          }),
      }));
    },
  };
}
