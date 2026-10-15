import type { Workspace, GraphNode } from './graph.ts';
import { getVisibleGraph, NODE_KINDS, timelineFrames } from './graph.ts';
import type { Subgraph } from './explore.ts';
import { findConnectedClusters, type ConnectedCluster } from './clusters.ts';

/**
 * True trace-ID grouping: only explicitly tagged nodes may enter a trace
 * group. Untagged records remain connected-component groups marked "미지정".
 * No provider IDs, labels or edges are used to infer trace membership.
 */
export function groupByTraceId(graph: Subgraph): ConnectedCluster[] {
  const members = new Map<string, GraphNode[]>();
  const unassigned: GraphNode[] = [];
  for (const node of graph.nodes) {
    if (!node.traceId) { unassigned.push(node); continue; }
    const current = members.get(node.traceId) ?? [];
    current.push(node);
    members.set(node.traceId, current);
  }
  const groups: ConnectedCluster[] = [];
  for (const [traceId, nodes] of members) {
    const ids = new Set(nodes.map(node => node.id));
    const edges = graph.edges.filter(edge =>
      ids.has(edge.source) && ids.has(edge.target) && (edge.traceId === undefined || edge.traceId === traceId));
    const sorted = [...nodes].sort((a, b) =>
      Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
    const recent = sorted[sorted.length - 1]!;
    groups.push({
      id: `trace:${traceId}`,
      traceId,
      label: `실행 ID · ${traceId.slice(0, 8)}`,
      description: sorted.find(node => node.kind === 'prompt')?.label ?? sorted[0]!.label,
      nodeIds: nodes.map(node => node.id).sort(),
      edgeIds: edges.map(edge => edge.id).sort(),
      nodeCount: nodes.length,
      edgeCount: edges.length,
      observedCount: nodes.filter(node => node.evidence === 'observed').length,
      latestAt: recent.createdAt,
      earliestAt: sorted[0]!.createdAt,
      primaryKind: sorted.find(node => node.kind === 'model')?.kind ?? sorted[0]!.kind,
      sources: Array.from(new Set(sorted.map(node => node.source))).slice(0, 4),
    });
  }
  const unassignedIds = new Set(unassigned.map(node => node.id));
  const unassignedEdges = graph.edges.filter(edge =>
    unassignedIds.has(edge.source) && unassignedIds.has(edge.target));
  for (const group of findConnectedClusters({nodes: unassigned, edges: unassignedEdges})) {
    groups.push({
      ...group,
      id: `unassigned:${group.id}`,
      label: `ID 미지정 · ${group.label}`,
      description: '명시적인 trace ID가 없는 연결 묶음입니다.',
    });
  }
  return groups.sort((a, b) =>
    Date.parse(b.latestAt) - Date.parse(a.latestAt) || a.id.localeCompare(b.id));
}

export type GraphDelta = {
  addedNodes: string[];
  removedNodes: string[];
  changedNodes: string[];
  addedEdges: string[];
  removedEdges: string[];
  changedEdges: string[];
};
function differences<T extends {id:string}>(before: readonly T[], after: readonly T[]) {
  const old = new Map(before.map(item => [item.id, item]));
  const next = new Map(after.map(item => [item.id, item]));
  return {
    added: after.filter(item => !old.has(item.id)).map(item => item.id),
    removed: before.filter(item => !next.has(item.id)).map(item => item.id),
    changed: after.filter(item => {
      const prior = old.get(item.id);
      return prior !== undefined && JSON.stringify(prior) !== JSON.stringify(item);
    }).map(item => item.id),
  };
}
export function compareGraphs(before: Subgraph, after: Subgraph): GraphDelta {
  const nodes = differences(before.nodes, after.nodes);
  const edges = differences(before.edges, after.edges);
  return {
    addedNodes: nodes.added, removedNodes: nodes.removed, changedNodes: nodes.changed,
    addedEdges: edges.added, removedEdges: edges.removed, changedEdges: edges.changed,
  };
}

/** Compare genuine recorded event timestamps, not simulated snapshots. */
export function compareTimelineFrames(workspace: Workspace, start: number, end: number) {
  const frames = timelineFrames(workspace);
  const at = (index: number): Subgraph => {
    if (!Number.isInteger(index) || index < 0 || index > frames.length) throw new RangeError('Invalid timeline frame.');
    if (index === 0) return {nodes:[],edges:[]};
    return getVisibleGraph(workspace,{query:'', kinds:[...NODE_KINDS], asOf: frames[index-1]});
  };
  return {
    baseline: start === 0 ? null : frames[start-1],
    target: end === 0 ? null : frames[end-1],
    ...compareGraphs(at(start), at(end)),
  };
}
