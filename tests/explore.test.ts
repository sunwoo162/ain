import assert from 'node:assert/strict';
import test from 'node:test';
import { getNeighborhoodGraph } from '../src/domain/explore.ts';
import { getVisibleGraph, NODE_KINDS } from '../src/domain/graph.ts';
import { demoWorkspace } from '../src/data/demo.ts';

const graph = () => ({
  nodes: demoWorkspace.nodes,
  edges: demoWorkspace.edges,
});

test('zero-depth and no selection preserve the exact visible graph', () => {
  const all = graph();
  assert.equal(getNeighborhoodGraph(all, 'answer1', 0), all);
  assert.equal(getNeighborhoodGraph(all, null, 2), all);
});

test('one hop includes both inbound and outbound neighbors and their real edges', () => {
  const local = getNeighborhoodGraph(graph(), 'answer1', 1);
  assert.deepEqual(new Set(local.nodes.map(node => node.id)), new Set(['answer1', 'summary1', 'model1', 'note1']));
  assert.deepEqual(new Set(local.edges.map(edge => edge.id)), new Set(['e8', 'e9', 'e10']));
});

test('two hops include the next level but no disconnected nodes', () => {
  const local = getNeighborhoodGraph(graph(), 'answer1', 2);
  assert.ok(local.nodes.some(node => node.id === 'doc1'));
  assert.ok(local.nodes.some(node => node.id === 'doc2'));
  assert.ok(local.nodes.some(node => node.id === 'tool1'));
  assert.ok(!local.nodes.some(node => node.id === 'q2'));
  assert.ok(local.edges.every(edge => local.nodes.some(n => n.id === edge.source) &&
                                     local.nodes.some(n => n.id === edge.target)));
});

test('a hidden pivot does not erase the current query result', () => {
  const filtered = getVisibleGraph(demoWorkspace, {
    query: '인덱스 사용 문서',
    kinds: [...NODE_KINDS],
  });
  assert.equal(getNeighborhoodGraph(filtered, 'answer1', 1), filtered);
});

test('local graph cannot bypass an existing node type filter', () => {
  const filtered = getVisibleGraph(demoWorkspace, { query: '', kinds: ['model', 'answer', 'prompt'] });
  const lens = getNeighborhoodGraph(filtered, 'answer1', 3);
  assert.ok(lens.nodes.every(node => ['model', 'answer', 'prompt'].includes(node.kind)));
  assert.ok(lens.edges.every(edge => lens.nodes.some(node => node.id === edge.source) &&
                                    lens.nodes.some(node => node.id === edge.target)));
});
