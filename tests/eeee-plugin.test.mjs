import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCollector } from '../server/collector.mjs';
import { createTraceClient } from '../sdk/client.mjs';
import { createEeeePlugin } from '../sdk/eeee-plugin.mjs';
import { buildTraceEvents } from '../extension/evidence.mjs';

test('EEEE plugin queries real collector data without inventing a review result', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'uisim-eeee-adapter-'));
  const token = 'eeee-adapter-local-test-token';
  const { server } = await createCollector({ token, file: join(dir, 'events.json') });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  try {
    const capture = buildTraceEvents({
      answer: 'Official documentation should be checked for this claim.',
      sources: [{ title: 'Example docs', url: 'https://example.org/reference?a=secret' }],
    }, { uuid: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now: () => '2026-10-15T20:00:00.000Z' });
    const sdk = createTraceClient({ token, baseUrl: url });
    await sdk.send(capture.events);

    const adapter = createEeeePlugin({ token, baseUrl: url });
    assert.deepEqual(adapter.describe().available, ['getExecutionTrace', 'getRecentResearch']);
    assert.equal(adapter.describe().notImplemented.includes('reviewAnswer'), true);

    const recent = await adapter.getRecentResearch({ limit: 1 });
    assert.equal(recent.length, 1);
    assert.equal(recent[0].sources[0].url, 'https://example.org/reference');
    assert.equal(recent[0].sources[0].independentlyVerified, false);
    assert.equal(recent[0].answer, 'Official documentation should be checked for this claim.');

    const trace = await adapter.getExecutionTrace({ traceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
    assert.equal(trace.nodes.length, 2);
    assert.equal(trace.edges.length, 1);
    await assert.rejects(adapter.getExecutionTrace({ traceId: 'invalid!' }), /traceId/);
    await assert.rejects(adapter.getRecentResearch({ limit: 500 }), /limit/);
    await assert.rejects(createEeeePlugin({ token: 'wrong-secret-long-enough', baseUrl: url })
      .getRecentResearch(), /401/);
    assert.throws(() => createEeeePlugin({ token, baseUrl: 'https://outside.example' }), /loopback/);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
