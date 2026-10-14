import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeTrace } from '../src/domain/insights.ts';
import { demoWorkspace } from '../src/data/demo.ts';

test('a trace report counts only explicitly tagged records and real edges', () => {
  const ws=structuredClone(demoWorkspace);
  for(const id of ['q1','model1','answer1'])ws.nodes.find(n=>n.id===id)!.traceId='run_12345678';
  for(const id of ['e1','e9'])ws.edges.find(e=>e.id===id)!.traceId='run_12345678';
  const result=summarizeTrace(ws,'run_12345678')!;
  assert.equal(result.nodeCount,3);
  assert.equal(result.edgeCount,2);
  assert.equal(result.modelCalls,1);
  assert.equal(result.responses,1);
  assert.equal(result.failures,0);
  assert.equal(result.durationMs,7*60_000);
  assert.ok(result.nodes.every(n=>n.traceId==='run_12345678'));
  assert.ok(!JSON.stringify(result).includes('doc1'));
});

test('missing trace ID never falls back to similarity or label matching', () => {
  assert.equal(summarizeTrace(demoWorkspace,'run_12345678'),null);
  assert.equal(summarizeTrace(demoWorkspace,''),null);
});

test('error and reported counts describe evidence, not causal attribution', () => {
  const ws=structuredClone(demoWorkspace);
  const answer=ws.nodes.find(n=>n.id==='answer2')!;
  const model=ws.nodes.find(n=>n.id==='model2')!;
  answer.traceId='run_abcdefghi';
  model.traceId='run_abcdefghi';
  model.kind='error';
  const result=summarizeTrace(ws,'run_abcdefghi')!;
  assert.equal(result.failures,1);
  assert.equal(result.reported,1);
  assert.equal(result.responses,1);
});
