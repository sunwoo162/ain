import test from 'node:test';
import assert from 'node:assert/strict';
import { latestTimelineNodes } from '../src/domain/timeline.ts';
import { demoWorkspace } from '../src/data/demo.ts';

test('chronicle orders actual node events newest-first with deterministic tie-break', () => {
  const nodes = demoWorkspace.nodes;
  const events = latestTimelineNodes(nodes, 3);
  assert.equal(events.length, 3);
  assert.equal(events[0]?.id, 'answer3');
  assert.ok(Date.parse(events[0].createdAt) >= Date.parse(events[1].createdAt));
});

test('chronicle never mutates source nodes and keeps valid explicit records', () => {
  const original = demoWorkspace.nodes.map(n => n.id);
  const events = latestTimelineNodes(demoWorkspace.nodes, 30);
  assert.deepEqual(demoWorkspace.nodes.map(n => n.id), original);
  assert.deepEqual(new Set(events.map(n => n.id)), new Set(original));
});

test('chronicle respects limit and handles invalid limits without unbounded list', () => {
  assert.equal(latestTimelineNodes(demoWorkspace.nodes, 0).length, 0);
  assert.equal(latestTimelineNodes(demoWorkspace.nodes, -5).length, 25);
  assert.equal(latestTimelineNodes(demoWorkspace.nodes, 2).length, 2);
});
