import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTraceBatch, emptyTraceWorkspace, mergeLiveWorkspace } from '../src/domain/trace.ts';
import { isWorkspace } from '../src/domain/graph.ts';

const time = '2026-10-14T00:00:00.000Z';
const prompt = { id: 'p1', kind: 'prompt', label: 'Which stack?', detail: 'Sanitized summary', createdAt: time, source: 'sample-agent', evidence: 'observed' };
const answer = { id: 'a1', kind: 'answer', label: 'Recommendation', detail: 'Short response', createdAt: time, source: 'sample-agent', evidence: 'reported' };
const link = { id: 'l1', source: 'p1', target: 'a1', kind: 'produced', createdAt: time, evidence: 'observed' };
const batch = { schemaVersion: 1, events: [
  { type: 'edge', edge: link }, // Order is intentionally reversed.
  { type: 'node', node: prompt },
  { type: 'node', node: answer },
] };

test('accepts a batch containing forward edge references and preserves provenance', () => {
  const graph = applyTraceBatch(emptyTraceWorkspace(), batch);
  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.nodes[1]?.evidence, 'reported');
  assert.ok(isWorkspace(graph));
});

test('a retried batch is idempotent', () => {
  const first = applyTraceBatch(emptyTraceWorkspace(), batch);
  const second = applyTraceBatch(first, batch);
  assert.deepEqual(second, first);
});

test('conflicting IDs are rejected without modifying previous graph', () => {
  const first = applyTraceBatch(emptyTraceWorkspace(), batch);
  assert.throws(() => applyTraceBatch(first, { schemaVersion: 1, events: [
    { type: 'node', node: { ...prompt, label: 'Different' } },
  ] }), /Conflicting node ID/);
  assert.equal(first.nodes[0]?.label, 'Which stack?');
});

test('dangling edges, unknown event types, malformed nodes, and invalid timestamps are rejected', () => {
  const workspace = emptyTraceWorkspace();
  assert.throws(() => applyTraceBatch(workspace, { schemaVersion: 1, events: [{ type: 'edge', edge: link }] }));
  assert.throws(() => applyTraceBatch(workspace, { schemaVersion: 1, events: [{ type: 'evil' }] }));
  assert.throws(() => applyTraceBatch(workspace, { schemaVersion: 1, events: [{ type: 'node' }] }));
  assert.throws(() => applyTraceBatch(workspace, { schemaVersion: 1, events: [{ type: 'node', node: { ...prompt, createdAt: 'bad' } }] }));
});

test('merges manual notes and valid links on live snapshot refresh', () => {
  const remote = applyTraceBatch(emptyTraceWorkspace(), batch);
  const note = { id: 'manual-note', kind: 'note' as const, label: 'Check this', detail: '', createdAt: time, source: 'user', evidence: 'manual' as const };
  const manualLink = { id: 'manual-link', source: 'manual-note', target: 'p1', kind: 'related' as const, createdAt: time, evidence: 'manual' as const };
  const local = { ...remote, nodes: [...remote.nodes, note], edges: [...remote.edges, manualLink] };
  const merged = mergeLiveWorkspace(local, remote);
  assert.ok(merged.nodes.some(n => n.id === 'manual-note'));
  assert.ok(merged.edges.some(e => e.id === 'manual-link'));
  assert.ok(isWorkspace(merged));
});
