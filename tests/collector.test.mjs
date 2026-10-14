import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCollector } from '../server/collector.mjs';
import { createTraceClient } from '../sdk/client.mjs';

const token = 'integration-test-secret-long-enough';

test('token auth, CORS, transaction validation, SDK ingestion, idempotency and restart persistence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mindtrace-test-'));
  const file = join(dir, 'graph.json');
  const origin = 'http://localhost:5173';
  const { server } = await createCollector({ token, file, origins: [origin] });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = `http://127.0.0.1:${server.address().port}`;
  try {
    const unauthorized = await fetch(address + '/v1/workspace');
    assert.equal(unauthorized.status, 401);
    const forbidden = await fetch(address + '/v1/workspace', { headers: { origin: 'https://malicious.test' } });
    assert.equal(forbidden.status, 403);
    const preflight = await fetch(address + '/v1/events', { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST' } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), origin);

    const sdk = createTraceClient({ token, baseUrl: address, source: 'test-agent' });
    const p = sdk.node({ id: 'request-1', kind: 'prompt', label: 'User asks for summary' });
    const a = sdk.node({ id: 'answer-1', kind: 'answer', label: 'Summary created', evidence: 'reported' });
    const e = sdk.edge({ id: 'response-1', source: 'request-1', target: 'answer-1', kind: 'produced' });
    const result = await sdk.send([e, p, a]);
    assert.deepEqual({ nodes: result.nodes, edges: result.edges }, { nodes: 2, edges: 1 });
    const retry = await sdk.send([e, p, a]);
    assert.equal(retry.nodes, 2);

    const failed = await fetch(address + '/v1/events', {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ schemaVersion: 1, events: [{ type: 'edge', edge: { ...e.edge, id: 'bad', target: 'missing' } }] }),
    });
    assert.equal(failed.status, 400);
    const view = await fetch(address + '/v1/workspace', { headers: { authorization: `Bearer ${token}`, origin } });
    assert.equal(view.status, 200);
    assert.equal(view.headers.get('access-control-allow-origin'), origin);
    assert.equal((await view.json()).edges.length, 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
  const reopened = await createCollector({ token, file });
  assert.equal(reopened.getWorkspace().nodes.length, 2);
  assert.equal(reopened.getWorkspace().edges.length, 1);
  await rm(dir, { recursive: true, force: true });
});

test('collector rejects a missing token and SDK rejects non-loopback hosts', async () => {
  await assert.rejects(createCollector({ token: '' }), /MINDTRACE_TOKEN/);
  assert.throws(() => createTraceClient({ token, baseUrl: 'https://example.com' }), /loopback/);
});
