import type { EvidenceLevel, GraphNode } from './graph.ts';
import type { Subgraph } from './explore.ts';

export type ConnectedCluster = {
  /** Stable identifier derived from a recorded node, not a fabricated graph entity. */
  id: string;
  label: string;
  description: string;
  nodeIds: string[];
  edgeIds: string[];
  nodeCount: number;
  edgeCount: number;
  observedCount: number;
  latestAt: string;
  earliestAt: string;
  primaryKind: GraphNode['kind'];
  sources: string[];
};

const readableLabel = (node: GraphNode) => node.label.trim().slice(0, 95);

/**
 * Connected components of EXISTING, currently visible relationships.
 * This is a structural grouping: a component is NOT proof of one provider run,
 * model reasoning sequence or causal execution.
 * Complexity O(V + E) excluding deterministic sort.
 */
export function findConnectedClusters(graph: Subgraph): ConnectedCluster[] {
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const adjacency = new Map(graph.nodes.map(node => [node.id, [] as string[]]));
  const edgesFor = new Map(graph.nodes.map(node => [node.id, [] as string[]]));

  for (const edge of graph.edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) continue;
    adjacency.get(edge.source)!.push(edge.target);
    adjacency.get(edge.target)!.push(edge.source);
    edgesFor.get(edge.source)!.push(edge.id);
    edgesFor.get(edge.target)!.push(edge.id);
  }

  const visited = new Set<string>();
  const clusters: ConnectedCluster[] = [];
  for (const first of graph.nodes) {
    if (visited.has(first.id)) continue;
    visited.add(first.id);
    const nodeIds: string[] = [];
    const edgeIds = new Set<string>();
    const queue = [first.id];
    for (let position = 0; position < queue.length; position++) {
      const id = queue[position]!;
      nodeIds.push(id);
      for (const edgeId of edgesFor.get(id) ?? []) edgeIds.add(edgeId);
      for (const neighbor of adjacency.get(id) ?? []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
    const members = nodeIds.map(id => nodes.get(id)!);
    const oldest = [...members].sort((a, b) =>
      Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
    // Prefer an explicit prompt as the cluster title, then a model or first node.
    const anchor = oldest.find(node => node.kind === 'prompt')
      ?? oldest.find(node => node.kind === 'model') ?? oldest[0]!;
    const newest = [...members].sort((a, b) =>
      Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
    const stableId = [...nodeIds].sort()[0]!;
    const sources = Array.from(new Set(oldest.map(node => node.source))).slice(0, 4);
    clusters.push({
      id: stableId,
      label: readableLabel(anchor),
      description: readableLabel(newest[0]!),
      nodeIds: [...nodeIds].sort(),
      edgeIds: [...edgeIds].sort(),
      nodeCount: nodeIds.length,
      edgeCount: edgeIds.size,
      observedCount: members.filter(node => node.evidence === 'observed').length,
      latestAt: newest[0]!.createdAt,
      earliestAt: oldest[0]!.createdAt,
      primaryKind: anchor.kind,
      sources,
    });
  }
  // Recently active groups appear first, then stable ties by component ID.
  return clusters.sort((a, b) => Date.parse(b.latestAt) - Date.parse(a.latestAt) || a.id.localeCompare(b.id));
}

/** Return only real nodes/edges in the chosen visible connected group. */
export function filterToCluster(graph: Subgraph, cluster: ConnectedCluster | null): Subgraph {
  if (!cluster) return graph;
  const memberIds = new Set(cluster.nodeIds);
  return {
    nodes: graph.nodes.filter(node => memberIds.has(node.id)),
    edges: graph.edges.filter(edge => memberIds.has(edge.source) && memberIds.has(edge.target)),
  };
}

export type ZoomLevel = 'overview' | 'explore' | 'detail';
/** Small hysteresis band prevents style flicker while using trackpads. */
export function semanticZoomLevel(zoom: number, previous: ZoomLevel = 'explore'): ZoomLevel {
  if (!Number.isFinite(zoom)) return previous;
  if (previous === 'overview') return zoom > 0.76 ? 'explore' : 'overview';
  if (previous === 'detail') return zoom < 1.26 ? 'explore' : 'detail';
  if (zoom < 0.64) return 'overview';
  if (zoom > 1.52) return 'detail';
  return 'explore';
}

export function provenanceCounts(nodes: readonly GraphNode[]): Record<EvidenceLevel, number> {
  const counts = { observed: 0, reported: 0, inferred: 0, manual: 0 };
  for (const node of nodes) counts[node.evidence]++;
  return counts;
}
