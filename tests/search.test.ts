import test from 'node:test';
import assert from 'node:assert/strict';
import { createGraphSearchIndex, parseGraphQuery, searchGraphIndex } from '../src/domain/search.ts';
import { demoWorkspace } from '../src/data/demo.ts';
import { getVisibleGraph, NODE_KINDS } from '../src/domain/graph.ts';

const index = createGraphSearchIndex(demoWorkspace);
const matches = (query: string) => searchGraphIndex(index, query);

test('plain Korean substring, case-insensitive English and quoted phrases', () => {
  assert.ok(matches('인덱스').has('doc2'));
  assert.ok(matches('SQL').has('tool1'));
  assert.deepEqual([...matches('"인덱스 사용 문서"')], ['doc2']);
  assert.equal(matches('실제로_존재하지않음').size, 0);
});

test('term intersection and structural filters are never treated as OR', () => {
  assert.ok(matches('kind:model').has('model1'));
  assert.equal(matches('kind:model').size, 3);
  assert.deepEqual([...matches('kind:answer 대기')], ['answer2']);
  assert.equal(matches('kind:invalid').size, 0);
  assert.equal(matches('evidence:invalid').size, 0);
  assert.deepEqual([...matches('kind:answer evidence:reported')].sort(), ['answer2','answer3']);
});

test('source filters and explicit trace prefixes retain exact source integrity', () => {
  const graph=structuredClone(demoWorkspace);
  graph.nodes[0]!.traceId='abcd1234_Opaque';
  graph.nodes[1]!.traceId='abcd1234_Other';
  graph.nodes[2]!.traceId='zxcv1234_Other';
  const local=createGraphSearchIndex(graph);
  assert.deepEqual([...searchGraphIndex(local, 'trace:abcd1234')].sort(), ['model1','q1']);
  assert.equal(searchGraphIndex(local, 'trace:zxcv kind:model').size,0);
  assert.deepEqual([...searchGraphIndex(local,'source:"가상 질문"')].sort(), ['q2','q3']);
});

test('short character searches scan and Unicode matching is normalized', () => {
  assert.ok(matches('오').size > 0);
  assert.ok(matches('ID').size >= 0);
  assert.deepEqual(parseGraphQuery('kind:model "응답 수신" source:local'),
    [{field:'kind',value:'model'},{field:'text',value:'응답 수신'},{field:'source',value:'local'}]);
});

test('index matching preserves one-hop context without adding edges', () => {
  const matched=matches('인덱스 사용 문서');
  const visible=getVisibleGraph(demoWorkspace, {query:'인덱스 사용 문서',kinds:[...NODE_KINDS]}, matched);
  const original=getVisibleGraph(demoWorkspace, {query:'인덱스 사용 문서',kinds:[...NODE_KINDS]});
  assert.deepEqual(visible,original);
  assert.ok(visible.edges.every(e=>visible.nodes.some(n=>n.id===e.source) && visible.nodes.some(n=>n.id===e.target)));
});

test('empty search preserves full workspace and uses no fabricated results', () => {
  assert.equal(matches('').size, demoWorkspace.nodes.length);
  assert.equal(matches('kind:prompt trace:123invalid').size, 0);
});

test('index is built from current workspace and does not mutate originals', () => {
  const snapshot=JSON.stringify(demoWorkspace);
  createGraphSearchIndex(demoWorkspace);
  assert.equal(JSON.stringify(demoWorkspace), snapshot);
});
