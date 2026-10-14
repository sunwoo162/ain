import { randomUUID } from 'node:crypto';
import { createTraceClient } from '../sdk/client.mjs';

const token = process.env.MINDTRACE_TOKEN;
if (!token) throw new Error('Set MINDTRACE_TOKEN before running this example.');
const sdk = createTraceClient({ token, source: 'example-local-agent' });
const run = randomUUID();
const now = new Date().toISOString();

// All fields below are fabricated example labels. No actual private AI reasoning is read.
const input = sdk.node({ id: `${run}-prompt`, kind: 'prompt', label: 'How do I improve query latency?', detail: 'Synthetic demo request', createdAt: now });
const model = sdk.node({ id: `${run}-model`, kind: 'model', label: 'Local model execution', createdAt: now });
const retrieval = sdk.node({ id: `${run}-document`, kind: 'document', label: 'Query optimization guide', detail: 'Synthetic document access', createdAt: now });
const answer = sdk.node({ id: `${run}-answer`, kind: 'answer', label: 'Inspect indexes and measure queries', evidence: 'reported', createdAt: now });
const edges = [
  sdk.edge({ id: `${run}-e1`, source: input.node.id, target: model.node.id, kind: 'input-to', createdAt: now }),
  sdk.edge({ id: `${run}-e2`, source: model.node.id, target: retrieval.node.id, kind: 'retrieved', createdAt: now }),
  sdk.edge({ id: `${run}-e3`, source: model.node.id, target: answer.node.id, kind: 'produced', createdAt: now }),
];
console.log('Saved example trace:', await sdk.send([input, model, retrieval, answer, ...edges]));
