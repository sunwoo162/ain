import test from 'node:test';
import assert from 'node:assert/strict';
import { findConnectedClusters, filterToCluster, semanticZoomLevel, provenanceCounts } from '../src/domain/clusters.ts';
import { demoWorkspace } from '../src/data/demo.ts';
import { getVisibleGraph, NODE_KINDS } from '../src/domain/graph.ts';

const demo = { nodes: demoWorkspace.nodes, edges: demoWorkspace.edges };

test('synthetic demo yields 3 strictly connected groups, no made-up edges', () => {
  const groups = findConnectedClusters(demo);
  assert.equal(groups.length, 3);
  assert.deepEqual(groups.map(g => g.nodeCount), [8,8,9]);
  assert.deepEqual(groups.map(g => g.edgeCount), [9,9,10]);
  const selected = filterToCluster(demo, groups[0]);
  assert.equal(selected.nodes.length, 8);
  assert.equal(selected.edges.length, 9);
  assert.ok(selected.edges.every(edge => demo.edges.some(original => original.id === edge.id)));
  assert.ok(selected.nodes.every(node => demo.nodes.some(original => original.id === node.id)));
});

test('stable IDs and ordering do not depend on input node or edge order', () => {
  const normal = findConnectedClusters(demo);
  const reverse = findConnectedClusters({
    nodes: [...demo.nodes].reverse(),
    edges: [...demo.edges].reverse(),
  });
  assert.deepEqual(reverse, normal);
});

test('a real cross-link merges clusters without inventing a provider run', () => {
  const bridge = {id:'bridge',source:'answer1',target:'q2',kind:'related' as const,
    evidence:'manual' as const,createdAt:'2026-10-14T09:00:00.000Z'};
  const groups = findConnectedClusters({ nodes: demo.nodes, edges: [...demo.edges, bridge] });
  assert.equal(groups.length, 2);
  assert.ok(groups.some(g => g.nodeIds.includes('q1') && g.nodeIds.includes('q2')));
});

test('filtering occurs before grouping; hidden nodes are never resurrected', () => {
  const filtered = getVisibleGraph(demoWorkspace, {
    query:'인덱스 사용 문서', kinds:[...NODE_KINDS],
  });
  const clusters = findConnectedClusters(filtered);
  assert.equal(clusters.length, 1);
  const subset = filterToCluster(filtered, clusters[0]!);
  assert.deepEqual(subset, filtered);
});

test('isolated real nodes form one-node groups without fabricated links', () => {
  const groups = findConnectedClusters({nodes:[demo.nodes[0]!], edges:demo.edges});
  assert.equal(groups.length,1);
  assert.equal(groups[0]!.nodeCount,1);
  assert.equal(groups[0]!.edgeCount,0);
  assert.deepEqual(filterToCluster(demo,null), demo);
});

test('semantic zoom uses hysteresis to avoid flicker at transition boundaries', () => {
  assert.equal(semanticZoomLevel(0.5), 'overview');
  assert.equal(semanticZoomLevel(0.7,'overview'), 'overview');
  assert.equal(semanticZoomLevel(0.78,'overview'), 'explore');
  assert.equal(semanticZoomLevel(1.8), 'detail');
  assert.equal(semanticZoomLevel(1.4,'detail'), 'detail');
  assert.equal(semanticZoomLevel(1.2,'detail'), 'explore');
  assert.equal(semanticZoomLevel(NaN,'detail'), 'detail');
});

test('provenance summary is based only on recorded node evidence', () => {
  const first = findConnectedClusters(demo)[0]!;
  const nodes = filterToCluster(demo,first).nodes;
  const counts = provenanceCounts(nodes);
  assert.equal(Object.values(counts).reduce((a,b) => a+b, 0), first.nodeCount);
  assert.equal(counts.observed, first.observedCount);
});
