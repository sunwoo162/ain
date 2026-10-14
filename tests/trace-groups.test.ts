import test from 'node:test';
import assert from 'node:assert/strict';
import { groupByTraceId, compareGraphs, compareTimelineFrames } from '../src/domain/trace-groups.ts';
import { demoWorkspace } from '../src/data/demo.ts';
import { isWorkspace, timelineFrames } from '../src/domain/graph.ts';
import { createTraceClient } from '../sdk/client.mjs';

const demo = {nodes: demoWorkspace.nodes,edges:demoWorkspace.edges};
test('old workspaces remain valid with optional traceId', () => {
  assert.equal(isWorkspace(demoWorkspace),true);
  const tagged=structuredClone(demoWorkspace);
  tagged.nodes[0]!.traceId='run_12345678';
  tagged.edges[0]!.traceId='run_12345678';
  assert.equal(isWorkspace(tagged),true);
  tagged.nodes[0]!.traceId='person@example.com';
  assert.equal(isWorkspace(tagged),false);
});

test('two disconnected nodes with the same explicit ID share one trace group', () => {
  const tagged=structuredClone(demo);
  tagged.nodes.find(n=>n.id==='q1')!.traceId='trace_AAAAAAAA';
  tagged.nodes.find(n=>n.id==='q2')!.traceId='trace_AAAAAAAA';
  const groups=groupByTraceId(tagged);
  const explicit=groups.find(group=>group.traceId==='trace_AAAAAAAA');
  assert.ok(explicit);
  assert.deepEqual(explicit?.nodeIds,['q1','q2']);
  assert.equal(explicit?.edgeCount,0);
  assert.equal(groups.some(group=>group.id.startsWith('unassigned:')),true);
});

test('trace grouping refuses to infer membership from a connected edge', () => {
  const tagged=structuredClone(demo);
  tagged.nodes.find(n=>n.id==='q1')!.traceId='run_12345678';
  const groups=groupByTraceId(tagged);
  const explicit=groups.find(g=>g.traceId==='run_12345678')!;
  assert.equal(explicit.nodeCount,1);
  assert.equal(explicit.edgeCount,0);
  assert.ok(groups.some(g=>g.nodeIds.includes('model1') && !g.traceId));
});

test('SDK rejects sensitive malformed trace IDs while preserving legacy shapes', () => {
  const sdk=createTraceClient({token:'test-test-test-123'});
  assert.equal(sdk.node({id:'id',kind:'prompt',label:'x'}).node.traceId,undefined);
  assert.equal(sdk.node({id:'id',kind:'prompt',label:'x',traceId:'run_12345678'}).node.traceId,'run_12345678');
  assert.throws(()=>sdk.node({id:'id',kind:'prompt',label:'x',traceId:'person@example.com'}),/opaque/);
  assert.throws(()=>sdk.edge({id:'e',source:'a',target:'b',kind:'related',traceId:'a secret'}),/opaque/);
});

test('snapshot diff tracks added, removed and updated records with actual IDs', () => {
  const a={nodes:demo.nodes.slice(0,2),edges:demo.edges.slice(0,1)};
  const b={nodes:[{...demo.nodes[1]!,label:'changed'},demo.nodes[2]!],edges:[]};
  const result=compareGraphs(a,b);
  assert.deepEqual(result.addedNodes,['doc1']);
  assert.deepEqual(result.removedNodes,['q1']);
  assert.deepEqual(result.changedNodes,['model1']);
  assert.deepEqual(result.removedEdges,['e1']);
  assert.deepEqual(result.addedEdges,[]);
});

test('same-workspace frame comparison is chronological, with no fake removals', () => {
  const delta=compareTimelineFrames(demoWorkspace,0,timelineFrames(demoWorkspace).length);
  assert.equal(delta.addedNodes.length,25);
  assert.equal(delta.addedEdges.length,28);
  assert.equal(delta.removedNodes.length,0);
  assert.equal(delta.changedNodes.length,0);
  assert.throws(()=>compareTimelineFrames(demoWorkspace,-1,4),/Invalid/);
});

test('equal snapshots always compare as unchanged', () => {
  const a=compareGraphs(demo,demo);
  assert.ok(Object.values(a).every(values=>values.length===0));
});
