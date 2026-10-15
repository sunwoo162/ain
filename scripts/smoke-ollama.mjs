import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCollector } from '../server/collector.mjs';
import { createTraceClient } from '../sdk/client.mjs';
import { createProviderObservers } from '../sdk/provider-adapters.mjs';
import { createStreamingObservers } from '../sdk/stream-observers.mjs';

// Optional *real* Ollama E2E; never runs in normal CI or downloads a model.
// Only loopback Ollama and an ephemeral, authenticated collector are contacted.
// Output is limited to counts and statuses. Prompts/responses are never logged.
const model = process.env.OLLAMA_MODEL || 'qwen2.5:1.5b';
if (!/^[A-Za-z0-9_.:/-]{1,64}$/.test(model)) {
  throw new Error('Model identifier is invalid.');
}
const url = 'http://127.0.0.1:11434';
const tag = randomBytes(10).toString('hex').toUpperCase();
const marker = 'RC1_PRIVATE_' + tag;
const tmp = await mkdtemp(join(tmpdir(), 'uisim-live-ollama-'));
const token = randomBytes(24).toString('hex');
let server;
try {
  const check = await fetch(url + '/api/tags', { signal: AbortSignal.timeout(5_000) });
  if (!check.ok) throw new Error('Local Ollama is not responding (HTTP ' + check.status + ')');
  const tags = await check.json();
  if (!tags.models?.some(entry => entry.name === model)) {
    throw new Error('Ollama model is not installed. Set OLLAMA_MODEL to an installed model.');
  }
  const collector = await createCollector({ token, file: join(tmp, 'trace.json') });
  server = collector.server;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const trace = createTraceClient({
    baseUrl: 'http://127.0.0.1:' + server.address().port,
    token, source: 'ollama-rc1-real-smoke',
  });
  const notices = [];
  const fetcher = (endpoint, init) => fetch(endpoint, {
    ...init, signal: AbortSignal.timeout(120_000),
  });
  const live = createProviderObservers({
    traceClient: trace, fetcher,
    onTraceError: text => notices.push(text),
  });
  const streamed = createStreamingObservers({
    traceClient: trace, fetcher,
    onTraceError: text => notices.push(text),
  });

  const nonstream = await live.ollamaChat({
    body: { model, messages: [{role: 'user',
      content: 'Answer with a short positive greeting. Do not repeat the test marker: ' + marker
    }] },
  });
  if (typeof nonstream.message?.content !== 'string' || !nonstream.message.content) {
    throw new Error('Ollama non-streaming response had no text.');
  }
  const { response, traceDone } = await streamed.ollamaChatStream({
    body: { model, messages: [{role:'user',
      content:'Reply in one short word. Do not repeat: ' + marker
    }] },
  });
  if (response.status !== 200) throw new Error('Ollama streaming HTTP status: ' + response.status);
  const raw = await response.arrayBuffer();
  await traceDone;
  if (raw.byteLength < 2) throw new Error('Ollama streaming response was empty.');

  const workspace = collector.getWorkspace();
  const saved = await readFile(join(tmp, 'trace.json'), 'utf8');
  if (workspace.nodes.length !== 7 || workspace.edges.length !== 5) {
    throw new Error('Expected exactly 7 nodes and 5 edges; got ' +
      workspace.nodes.length + ' nodes and ' + workspace.edges.length + ' edges.');
  }
  if (notices.length) throw new Error('Telemetry collector reported an error.');
  if (saved.includes(marker) || saved.includes(token) ||
      saved.includes(nonstream.message.content)) {
    throw new Error('Sensitive prompt, collector token, or full output was persisted.');
  }
  const groups = new Set(workspace.nodes.map(node => node.traceId));
  if (groups.size !== 2 || groups.has(undefined)) {
    throw new Error('Expected two explicit, separate trace IDs.');
  }
  if (!workspace.nodes.some(node => node.kind === 'answer' &&
      /입력 [0-9]+ tokens/.test(node.detail))) {
    throw new Error('Nonstreaming usage metrics were not recorded.');
  }
  if (!workspace.nodes.some(node => node.label.includes('첫 스트림 청크'))) {
    throw new Error('Streaming first chunk event was not recorded.');
  }
  console.log(JSON.stringify({
    result: 'PASS', provider: 'Ollama (local)', model,
    nonStreaming: true, streaming: true,
    nodes: workspace.nodes.length, edges: workspace.edges.length,
    distinctTraceGroups: groups.size, rawPromptOrResponseSaved: false,
    collectorAuthenticated: true, persistedToTemporaryFileOnly: true,
  }, null, 2));
} finally {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  await rm(tmp, { recursive: true, force: true });
}
