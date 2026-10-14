import test from 'node:test';
import assert from 'node:assert/strict';
import { findRecordedPath, planGraphViewport } from '../src/domain/paths.ts';
import { demoWorkspace } from '../src/data/demo.ts';
import type { Subgraph } from '../src/domain/explore.ts';

const graph: Subgraph = { nodes: demoWorkspace.nodes, edges: demoWorkspace.edges };

test('finds shortest real route across directed edges, without inventing edges', () => {
  const path = findRecordedPath(graph, 'q1', 'answer1');
  assert.deepEqual(path?.nodeIds, ['q1', 'model1', 'answer1']);
  assert.deepEqual(path?.edgeIds, ['e1', 'e9']);
  assert.deepEqual(path?.evidence, ['observed', 'observed']);
  const back = findRecordedPath(graph, 'answer1', 'q1');
  assert.deepEqual(back?.nodeIds, ['answer1', 'model1', 'q1']);
  assert.deepEqual(back?.edgeIds, ['e9', 'e1']);
});

test('reported edges can be excluded to avoid suggesting direct observation', () => {
  const all = findRecordedPath(graph, 'doc2', 'summary1');
  const observed = findRecordedPath(graph, 'doc2', 'summary1', true);
  assert.deepEqual(all?.edgeIds, ['e7']);
  assert.ok(!observed || !observed.evidence.some(level => level !== 'observed'));
  assert.ok(observed === null || observed.edgeIds.length > 1);
});

test('disconnected graphs, missing endpoints and zero-hop routes', () => {
  assert.equal(findRecordedPath(graph, 'q1', 'q2'), null);
  assert.equal(findRecordedPath(graph, 'unknown', 'q1'), null);
  assert.equal(findRecordedPath(graph, null, 'q1'), null);
  assert.deepEqual(findRecordedPath(graph, 'q1', 'q1'), { nodeIds: ['q1'], edgeIds: [], evidence: [] });
});

test('path respects visible subset and does not traverse hidden nodes', () => {
  const visible: Subgraph = {
    nodes: graph.nodes.filter(node => ['q1', 'answer1'].includes(node.id)),
    edges: graph.edges,
  };
  assert.equal(findRecordedPath(visible, 'q1', 'answer1'), null);
});

test('viewport is unchanged below limits', () => {
  const p = planGraphViewport(graph);
  assert.equal(p.graph, graph);
  assert.equal(p.omittedNodes, 0);
  assert.equal(p.omittedEdges, 0);
});

test('viewport enforces node/edge budget while pinning selected route', () => {
  const route = findRecordedPath(graph, 'q1', 'answer1')!;
  const p = planGraphViewport(graph, { maxNodes: 4, maxEdges: 2, pinNodeIds: route.nodeIds, pinEdgeIds: route.edgeIds });
  assert.ok(p.graph.nodes.some(node => node.id === 'q1'));
  assert.ok(p.graph.nodes.some(node => node.id === 'answer1'));
  assert.deepEqual(new Set(p.graph.edges.map(edge => edge.id)), new Set(['e1','e9']));
  assert.equal(p.graph.nodes.length, 4);
  assert.equal(p.graph.edges.length, 2);
  assert.equal(p.omittedNodes, graph.nodes.length - 4);
  assert.equal(p.omittedEdges, graph.edges.length - 2);
  assert.ok(p.graph.edges.every(edge => p.graph.nodes.some(node => node.id === edge.source) &&
                                        p.graph.nodes.some(node => node.id === edge.target)));
});

test('viewport is deterministic for the same input and never adds relationships', () => {
  const options = { maxNodes: 6, maxEdges: 2 };
  const a = planGraphViewport(graph, options);
  const b = planGraphViewport(graph, options);
  assert.deepEqual(a, b);
  assert.ok(a.graph.edges.every(edge => graph.edges.some(original => original.id === edge.id)));
});
