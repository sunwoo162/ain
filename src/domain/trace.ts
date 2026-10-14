import { isWorkspace, type GraphEdge, type GraphNode, type Workspace } from './graph.ts';

export type TraceEvent = { type: 'node'; node: GraphNode } | { type: 'edge'; edge: GraphEdge };
export type TraceBatch = { schemaVersion: 1; events: TraceEvent[] };

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Validate and commit a full batch atomically.
 * Nodes are applied before edges so a batch may contain forward references.
 * Retries with identical IDs/content are safe; conflicting IDs are rejected.
 */
export function applyTraceBatch(workspace: Workspace, input: unknown): Workspace {
  if (!record(input) || input.schemaVersion !== 1 ||
      !Array.isArray(input.events) || input.events.length < 1 || input.events.length > 200) {
    throw new Error('Invalid trace batch: expected 1–200 events in schemaVersion 1.');
  }
  const nodes = new Map(workspace.nodes.map(node => [node.id, node]));
  const edges = new Map(workspace.edges.map(edge => [edge.id, edge]));
  for (const event of input.events) {
    if (!record(event)) throw new Error('Invalid event.');
    if (event.type !== 'node') continue;
    if (!record(event.node)) throw new Error('Invalid node event.');
    const node = event.node as GraphNode;
    if (typeof node.id !== 'string') throw new Error('Node ID is required.');
    const previous = nodes.get(node.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(node)) {
      throw new Error('Conflicting node ID: ' + node.id);
    }
    nodes.set(node.id, node);
  }
  for (const event of input.events) {
    if (!record(event)) throw new Error('Invalid event.');
    if (event.type === 'node') continue;
    if (event.type !== 'edge' || !record(event.edge)) throw new Error('Unknown event type.');
    const edge = event.edge as GraphEdge;
    if (typeof edge.id !== 'string') throw new Error('Edge ID is required.');
    const previous = edges.get(edge.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(edge)) {
      throw new Error('Conflicting edge ID: ' + edge.id);
    }
    edges.set(edge.id, edge);
  }
  const candidate: Workspace = {
    ...workspace,
    isDemo: false,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
  };
  if (!isWorkspace(candidate)) throw new Error('Invalid trace: node, relationship or reference is malformed.');
  return candidate;
}

/** Keep the user's manual notes and links while refreshing a live collector snapshot. */
export function mergeLiveWorkspace(local: Workspace, remote: Workspace): Workspace {
  if (!isWorkspace(remote)) throw new Error('Invalid collector workspace.');
  const nodes = [...remote.nodes];
  const seenNodes = new Set(nodes.map(node => node.id));
  for (const node of local.nodes) {
    if (node.evidence === 'manual' && !seenNodes.has(node.id)) {
      nodes.push(node);
      seenNodes.add(node.id);
    }
  }
  const edges = [...remote.edges];
  const seenEdges = new Set(edges.map(edge => edge.id));
  for (const edge of local.edges) {
    if (edge.evidence === 'manual' && !seenEdges.has(edge.id) &&
        seenNodes.has(edge.source) && seenNodes.has(edge.target)) {
      edges.push(edge);
      seenEdges.add(edge.id);
    }
  }
  const result: Workspace = { ...remote, nodes, edges, isDemo: false };
  if (!isWorkspace(result)) throw new Error('Graph limit exceeded during live merge.');
  return result;
}

export function emptyTraceWorkspace(): Workspace {
  return {
    schemaVersion: 1,
    id: 'local-traces',
    name: 'Local AI traces',
    description: 'Only explicitly submitted events are recorded. No private model reasoning is collected.',
    isDemo: false,
    nodes: [],
    edges: [],
  };
}
