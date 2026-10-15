import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCapture, buildTraceEvents } from '../extension/evidence.mjs';

test('ChatGPT DOM evidence uses observed answer and reported citations only', () => {
  const captured = buildTraceEvents({
    answer: 'A fact claimed by an AI.',
    sources: [{ title: 'Official docs', url: 'https://example.org/docs?token=private#section' }],
  }, { uuid: () => '12345678-1234-4123-8123-123456789abc', now: () => '2026-10-15T12:00:00.000Z' });
  assert.equal(captured.events.length, 3);
  const [answer, citation, relation] = captured.events;
  assert.equal(answer.node.kind, 'answer');
  assert.equal(answer.node.detail, 'A fact claimed by an AI.');
  assert.equal(answer.node.evidence, 'observed');
  assert.equal(citation.node.kind, 'document');
  assert.equal(citation.node.evidence, 'reported');
  assert.equal(citation.node.detail, 'ChatGPT 웹에 표시된 링크: https://example.org/docs');
  assert.equal(relation.edge.kind, 'cited');
  assert.equal(relation.edge.evidence, 'reported');
  assert.equal(relation.edge.source, answer.node.id);
  assert.equal(relation.edge.target, citation.node.id);
  assert.equal(JSON.stringify(captured).includes('private'), false);
});

test('normalizer rejects invalid sources, embedded credentials and duplicate URLs', () => {
  const result = normalizeCapture({
    answer: ' text ',
    sources: [
      { title: 'unsafe', url: 'javascript:alert(1)' },
      { title: 'unsafe', url: 'https://u:pass@evil.com/private' },
      { title: 'self', url: 'https://chatgpt.com/c/secret' },
      { title: 'docs', url: 'https://docs.python.org/3/tutorial/index.html#hi' },
      { title: 'duplicate', url: 'https://docs.python.org/3/tutorial/index.html?x=1' },
    ],
  });
  assert.equal(result.answer, 'text');
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].url, 'https://docs.python.org/3/tutorial/index.html');
  assert.equal(normalizeCapture({ answer: '' }), null);
});

test('capture applies fixed length and source limits', () => {
  const result = normalizeCapture({
    answer: 'a'.repeat(5000),
    sources: Array.from({ length: 40 }, (_, i) =>
      ({ title: 'source ' + i, url: 'https://example.org/' + i })),
  });
  assert.equal(result.answer.length, 3000);
  assert.equal(result.sources.length, 16);
});
