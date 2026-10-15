/**
 * Canonical MindTrace evidence model.  Observed is not a synonym for
 * "the model used this to reason": it means an integration actually logged
 * the event or the relationship.
 */
export const NODE_KINDS = ['prompt', 'model', 'document', 'memory', 'tool', 'reasoning-summary', 'answer', 'note', 'error'] as const;
export type NodeKind = typeof NODE_KINDS[number];
export const EVIDENCE_LEVELS = ['observed', 'reported', 'inferred', 'manual'] as const;
export type EvidenceLevel = typeof EVIDENCE_LEVELS[number];
export const EDGE_KINDS = ['input-to', 'retrieved', 'invoked', 'produced', 'cited', 'related', 'annotated'] as const;
export type EdgeKind = typeof EDGE_KINDS[number];

export type GraphNode = {
  id: string;
  kind: NodeKind;
  label: string;
  detail: string;
  createdAt: string;
  source: string;
  evidence: EvidenceLevel;
  /** Optional application-generated opaque trace identifier; never provider response IDs. */
  traceId?: string;
};
export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  createdAt: string;
  evidence: EvidenceLevel;
  traceId?: string;
};
export type Workspace = {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  isDemo: boolean;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type ViewOptions = {
  query: string;
  kinds: NodeKind[];
  asOf?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isIsoTime = (value: unknown): value is string =>
  isNonEmptyString(value) && /^\d{4}-\d\d-\d\dT/.test(value) && !Number.isNaN(Date.parse(value));
const isTraceId = (id: unknown): id is string =>
  typeof id === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(id);
const validTrace = (value: Record<string, unknown>): boolean =>
  value.traceId === undefined || isTraceId(value.traceId);
const has = <T extends string>(values: readonly T[], item: unknown): item is T => typeof item === 'string' && values.includes(item as T);

export function isWorkspace(value: unknown): value is Workspace {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isNonEmptyString(value.id) || !isNonEmptyString(value.name) ||
      typeof value.description !== 'string' || typeof value.isDemo !== 'boolean' ||
      !Array.isArray(value.nodes) || !Array.isArray(value.edges) ||
      value.nodes.length > 10000 || value.edges.length > 30000) return false;
  const nodeIds = new Set<string>();
  for (const node of value.nodes) {
    if (!isRecord(node) || !isNonEmptyString(node.id) || nodeIds.has(node.id) ||
        !has(NODE_KINDS, node.kind) || !isNonEmptyString(node.label) || typeof node.detail !== 'string' ||
        !isIsoTime(node.createdAt) || !isNonEmptyString(node.source) || !has(EVIDENCE_LEVELS, node.evidence) || !validTrace(node)) return false;
    nodeIds.add(node.id);
  }
  const edgeIds = new Set<string>();
  for (const edge of value.edges) {
    if (!isRecord(edge) || !isNonEmptyString(edge.id) || edgeIds.has(edge.id) ||
        !isNonEmptyString(edge.source) || !nodeIds.has(edge.source) ||
        !isNonEmptyString(edge.target) || !nodeIds.has(edge.target) ||
        !has(EDGE_KINDS, edge.kind) || !isIsoTime(edge.createdAt) ||
        !has(EVIDENCE_LEVELS, edge.evidence) || !validTrace(edge)) return false;
    edgeIds.add(edge.id);
  }
  return true;
}

/** Includes matched nodes and one-hop context; never creates inferred links. */
export function getVisibleGraph(workspace: Workspace, options: ViewOptions, matchedIds?: ReadonlySet<string>) {
  const available = workspace.nodes.filter(node =>
    (!options.asOf || node.createdAt <= options.asOf) && options.kinds.includes(node.kind));
  const availableIds = new Set(available.map(node => node.id));
  const eligibleEdges = workspace.edges.filter(edge =>
    (!options.asOf || edge.createdAt <= options.asOf) &&
    availableIds.has(edge.source) && availableIds.has(edge.target));
  const normalized = options.query.trim().toLocaleLowerCase();
  if (!normalized && matchedIds === undefined) return { nodes: available, edges: eligibleEdges };
  const matched = new Set(available.filter(node =>
    matchedIds !== undefined ? matchedIds.has(node.id) :
    [node.label, node.detail, node.source].some(text => text.toLocaleLowerCase().includes(normalized))).map(node => node.id));
  const shown = new Set(matched);
  for (const edge of eligibleEdges) {
    if (matched.has(edge.source) || matched.has(edge.target)) {
      shown.add(edge.source); shown.add(edge.target);
    }
  }
  return {
    nodes: available.filter(node => shown.has(node.id)),
    edges: eligibleEdges.filter(edge => shown.has(edge.source) && shown.has(edge.target)),
  };
}

export function timelineFrames(workspace: Workspace): string[] {
  return Array.from(new Set([
    ...workspace.nodes.map(node => node.createdAt),
    ...workspace.edges.map(edge => edge.createdAt),
  ])).sort();
}

export function getNeighbors(workspace: Workspace, id: string) {
  const neighborIds = new Set(workspace.edges.flatMap(edge =>
    edge.source === id ? [edge.target] : edge.target === id ? [edge.source] : []));
  return workspace.nodes.filter(node => neighborIds.has(node.id));
}

export function addNote(workspace: Workspace, label: string, detail: string, now: string, id: string): Workspace {
  const trimmed = label.trim();
  if (!trimmed) throw new Error('A note must have a title.');
  if (workspace.nodes.some(node => node.id === id)) throw new Error('Duplicate node ID.');
  return {
    ...workspace,
    isDemo: false,
    nodes: [...workspace.nodes, { id, kind: 'note', label: trimmed, detail, createdAt: now, source: 'user', evidence: 'manual' }],
  };
}

export function addManualLink(workspace: Workspace, source: string, target: string, now: string, id: string): Workspace {
  if (source === target) throw new Error('Self-links are not supported.');
  if (!workspace.nodes.some(node => node.id === source) || !workspace.nodes.some(node => node.id === target)) throw new Error('Unknown node.');
  if (workspace.edges.some(edge => edge.id === id)) throw new Error('Duplicate edge ID.');
  return {
    ...workspace,
    isDemo: false,
    edges: [...workspace.edges, { id, source, target, kind: 'related', evidence: 'manual', createdAt: now }],
  };
}

export function upsertWorkspaceEvent(workspace: Workspace, event: { type: 'node'; node: GraphNode } | { type: 'edge'; edge: GraphEdge }): Workspace {
  const candidate: Workspace = event.type === 'node'
    ? { ...workspace, isDemo: false, nodes: [...workspace.nodes.filter(n => n.id !== event.node.id), event.node] }
    : { ...workspace, isDemo: false, edges: [...workspace.edges.filter(e => e.id !== event.edge.id), event.edge] };
  if (!isWorkspace(candidate)) throw new Error('Invalid event or dangling graph reference.');
  return candidate;
}
