import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isWorkspace } from '../src/domain/graph.ts';
import { applyTraceBatch, emptyTraceWorkspace } from '../src/domain/trace.ts';

const LIMIT = 256 * 1024;
const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

function authenticated(input, expected) {
  const candidate = input?.startsWith('Bearer ') ? input.slice(7) : '';
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function receiveJson(request) {
  const parts = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > LIMIT) {
      const err = new Error('Trace batch exceeds 256 KiB.');
      err.status = 413;
      throw err;
    }
    parts.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); }
  catch { const err = new Error('Invalid JSON body.'); err.status = 400; throw err; }
}

export async function createCollector({
  token,
  file = resolve('.mindtrace/collector.json'),
  origins = DEFAULT_ORIGINS,
} = {}) {
  if (typeof token !== 'string' || Buffer.byteLength(token) < 12) {
    throw new Error('Set MINDTRACE_TOKEN to a secret of at least 12 bytes.');
  }
  let workspace = emptyTraceWorkspace();
  try {
    const stored = JSON.parse(await readFile(file, 'utf8'));
    if (!isWorkspace(stored)) throw new Error('Stored collector graph is invalid.');
    workspace = stored;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  let writes = Promise.resolve();
  const server = createServer(async (request, response) => {
    const origin = request.headers.origin;
    const send = (code, body) => {
      response.writeHead(code, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      response.end(JSON.stringify(body));
    };
    if (origin) {
      if (!origins.includes(origin)) { send(403, { error: 'Origin not allowed.' }); return; }
      response.setHeader('access-control-allow-origin', origin);
      response.setHeader('vary', 'Origin');
      response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
      response.setHeader('access-control-allow-headers', 'Authorization, Content-Type');
    }
    if (request.method === 'OPTIONS') { send(204, {}); return; }
    if (!authenticated(request.headers.authorization, token)) {
      send(401, { error: 'Missing or invalid collector token.' });
      return;
    }
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (request.method === 'GET' && path === '/v1/workspace') {
      send(200, workspace);
      return;
    }
    if (request.method !== 'POST' || path !== '/v1/events') {
      send(404, { error: 'Unknown endpoint.' });
      return;
    }
    if (!request.headers['content-type']?.startsWith('application/json')) {
      send(415, { error: 'Use application/json.' });
      return;
    }
    try {
      const batch = await receiveJson(request);
      // Serialize writes: concurrent POSTs cannot overwrite each other's graph.
      const update = writes.then(async () => {
        const next = applyTraceBatch(workspace, batch);
        await mkdir(dirname(file), { recursive: true });
        const tmp = `${file}.${randomBytes(8).toString('hex')}.tmp`;
        await writeFile(tmp, JSON.stringify(next), { mode: 0o600 });
        await rename(tmp, file);
        workspace = next;
        return { nodes: workspace.nodes.length, edges: workspace.edges.length };
      });
      writes = update.catch(() => {});
      const result = await update;
      send(202, { ok: true, ...result });
    } catch (error) {
      send(error.status ?? 400, { error: error instanceof Error ? error.message : 'Unable to ingest trace.' });
    }
  });
  return { server, getWorkspace: () => workspace };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const token = process.env.MINDTRACE_TOKEN;
  const file = resolve(process.env.MINDTRACE_DATA_FILE || '.mindtrace/collector.json');
  const port = Number(process.env.MINDTRACE_PORT || 4318);
  const origins = process.env.MINDTRACE_ORIGINS
    ? process.env.MINDTRACE_ORIGINS.split(',').map(origin => origin.trim())
    : DEFAULT_ORIGINS;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port.');
  const { server } = await createCollector({ token, file, origins });
  server.listen(port, '127.0.0.1', () => {
    console.log(`MindTrace collector: http://127.0.0.1:${port} (loopback only)`);
    console.log('Authentication required. Traces are saved to ' + file);
  });
}
