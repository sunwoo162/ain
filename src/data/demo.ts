import type { EvidenceLevel, GraphEdge, GraphNode, NodeKind, Workspace } from '../domain/graph';

const base = Date.parse('2026-10-14T08:00:00.000Z');
const at = (minute: number) => new Date(base + minute * 60000).toISOString();
const node = (id: string, kind: NodeKind, label: string, detail: string, minute: number, source: string, evidence: EvidenceLevel = 'observed'): GraphNode =>
  ({ id, kind, label, detail, createdAt: at(minute), source, evidence });
const edge = (id: string, source: string, target: string, kind: GraphEdge['kind'], minute: number, evidence: EvidenceLevel = 'observed'): GraphEdge =>
  ({ id, source, target, kind, createdAt: at(minute), evidence });

/** Explicitly synthetic data: not a trace from an actual model. */
export const demoWorkspace: Workspace = {
  schemaVersion: 1,
  id: 'mindtrace-demo',
  name: 'My workspace',
  description: 'Explore the relationships behind AI activity.',
  isDemo: true,
  nodes: [
    node('q1', 'prompt', 'Why is my API slow?', 'A developer asked why an API endpoint has high latency.', 0, 'Demo request'),
    node('model1', 'model', 'Model invocation', 'Illustrative model request. The provider did not expose internal reasoning.', 1, 'Synthetic AI runtime'),
    node('doc1', 'document', 'Database query logs', 'Example trace excerpt: repeated SELECT statements for one request.', 2, 'Synthetic document'),
    node('tool1', 'tool', 'Inspect SQL traces', 'Illustrative tool event: read query counts and timings from a log sample.', 3, 'Synthetic tool'),
    node('doc2', 'document', 'Index documentation', 'An example retrieval result describing an index and query plan.', 4, 'Synthetic search'),
    node('memory1', 'memory', 'Past performance note', 'An example memory item describing a past optimization.', 5, 'Synthetic memory'),
    node('summary1', 'reasoning-summary', 'Evidence interpretation', 'Sample explanation: repeated database reads may be an important contributor. This is an authored summary, not hidden chain-of-thought.', 6, 'Illustrative summary', 'reported'),
    node('answer1', 'answer', 'Investigate repeated queries', 'Suggested actions: measure query counts, inspect query plans, verify indexing, and benchmark changes.', 7, 'Synthetic AI response'),
    node('note1', 'note', 'Next: baseline benchmark', 'A manually curated example note. Validate latency before and after any changes.', 8, 'Demo annotation', 'manual'),
  ],
  edges: [
    edge('e1', 'q1', 'model1', 'input-to', 1),
    edge('e2', 'model1', 'tool1', 'invoked', 3),
    edge('e3', 'tool1', 'doc1', 'retrieved', 3),
    edge('e4', 'model1', 'doc2', 'retrieved', 4),
    edge('e5', 'model1', 'memory1', 'retrieved', 5),
    edge('e6', 'doc1', 'summary1', 'related', 6, 'reported'),
    edge('e7', 'doc2', 'summary1', 'related', 6, 'reported'),
    edge('e8', 'summary1', 'answer1', 'produced', 7, 'reported'),
    edge('e9', 'model1', 'answer1', 'produced', 7),
    edge('e10', 'answer1', 'note1', 'annotated', 8, 'manual'),
  ],
};
