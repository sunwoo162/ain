import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addManualLink, addNote, getNeighbors, getVisibleGraph, isWorkspace, timelineFrames, upsertWorkspaceEvent,
} from '../src/domain/graph.ts';
import { demoWorkspace } from '../src/data/demo.ts';

const sample = () => structuredClone(demoWorkspace);

test('sample graph is valid and all references resolve', () => {
  assert.equal(isWorkspace(demoWorkspace), true);
  assert.equal(demoWorkspace.nodes.length, 9);
  assert.equal(demoWorkspace.edges.length, 10);
});

test('schema rejects duplicate IDs and dangling references', () => {
  const duplicated = sample();
  duplicated.nodes.push({ ...duplicated.nodes[0] });
  assert.equal(isWorkspace(duplicated), false);
  const dangling = sample();
  dangling.edges[0].target = 'not-a-node';
  assert.equal(isWorkspace(dangling), false);
});

test('search keeps one-hop context and never invents edges', () => {
  const graph = getVisibleGraph(demoWorkspace, { query: 'Index documentation', kinds: demoWorkspace.nodes.map(n => n.kind) });
  assert.deepEqual(graph.nodes.map(n => n.id).sort(), ['doc2', 'model1', 'summary1']);
  assert.deepEqual(graph.edges.map(e => e.id).sort(), ['e4', 'e7']);
});

test('kind filters remove connected edges with hidden endpoints', () => {
  const graph = getVisibleGraph(demoWorkspace, { query: '', kinds: ['prompt', 'model'] });
  assert.equal(graph.nodes.length, 2);
  assert.deepEqual(graph.edges.map(e => e.id), ['e1']);
});

test('timeline filters both nodes and edges by event time', () => {
  const ts = timelineFrames(demoWorkspace);
  assert.equal(ts.length, 9);
  const graph = getVisibleGraph(demoWorkspace, { query: '', kinds: demoWorkspace.nodes.map(n => n.kind), asOf: ts[3] });
  assert.deepEqual(graph.nodes.map(n => n.id), ['q1', 'model1', 'doc1', 'tool1']);
  assert.deepEqual(graph.edges.map(e => e.id), ['e1', 'e2', 'e3']);
});

test('notes and manual links preserve provenance', () => {
  const now = '2026-10-15T00:00:00Z';
  const withNote = addNote(sample(), 'My experiment', 'Compare baselines', now, 'my-note');
  assert.equal(withNote.isDemo, false);
  assert.equal(withNote.nodes.at(-1)?.evidence, 'manual');
  const result = addManualLink(withNote, 'my-note', 'answer1', now, 'my-edge');
  assert.equal(result.edges.at(-1)?.evidence, 'manual');
  assert.ok(getNeighbors(result, 'answer1').some(n => n.id === 'my-note'));
  assert.equal(isWorkspace(result), true);
});

test('reject invalid link and upsert event', () => {
  assert.throws(() => addManualLink(sample(), 'q1', 'q1', new Date().toISOString(), 'self'));
  assert.throws(() => upsertWorkspaceEvent(sample(), { type: 'edge', edge: {
    id: 'bad', source: 'q1', target: 'missing', kind: 'related', evidence: 'observed', createdAt: new Date().toISOString(),
  } }));
});
