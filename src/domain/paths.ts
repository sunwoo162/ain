import type { EvidenceLevel, GraphEdge } from './graph.ts';
import type { Subgraph } from './explore.ts';

export type RecordedPath = {
  /** Ordered from start to destination. */
  nodeIds: string[];
  /** Corresponding recorded edge IDs. Orientation in the original data is unchanged. */
  edgeIds: string[];
  /** Sources of each traversed relationship, in edge order. */
  evidence: EvidenceLevel[];
};

type Step = { previous: string; edge: GraphEdge };

/**
 * Breadth-first search through explicit graph relationships, treated as an
 * undirected navigation network. The result is not proof of model causality.
 *
 * Complexity: O(nodes + edges). For equally short paths, input edge order
 * provides a stable tie break. Hidden nodes/edges are never traversed.
 */
export function findRecordedPath(
  graph: Subgraph,
  from: string | null,
  to: string | null,
  observedOnly = false,
): RecordedPath | null {
  if (!from || !to) return null;
  const available = new Set(graph.nodes.map(node => node.id));
  if (!available.has(from) || !available.has(to)) return null;
  if (from === to) return { nodeIds: [from], edgeIds: [], evidence: [] };

  const adjacent = new Map<string, { id: string; edge: GraphEdge }[]>();
  for (const edge of graph.edges) {
    if (observedOnly && edge.evidence !== 'observed') continue;
    if (!available.has(edge.source) || !available.has(edge.target)) continue;
    if (edge.source === edge.target) continue;
    if (!adjacent.has(edge.source)) adjacent.set(edge.source, []);
    if (!adjacent.has(edge.target)) adjacent.set(edge.target, []);
    adjacent.get(edge.source)!.push({ id: edge.target, edge });
    adjacent.get(edge.target)!.push({ id: edge.source, edge });
  }

  const visited = new Set<string>([from]);
  const parent = new Map<string, Step>();
  const queue = [from];

  for (let index = 0; index < queue.length; index++) {
    const current = queue[index]!;
    for (const next of adjacent.get(current) ?? []) {
      if (visited.has(next.id)) continue;
      visited.add(next.id);
      parent.set(next.id, { previous: current, edge: next.edge });
      if (next.id === to) {
        const nodeIds = [to];
        const edgeIds: string[] = [];
        const evidence: EvidenceLevel[] = [];
        let cursor = to;
        while (cursor !== from) {
          const step = parent.get(cursor)!;
          nodeIds.push(step.previous);
          edgeIds.push(step.edge.id);
          evidence.push(step.edge.evidence);
          cursor = step.previous;
        }
        nodeIds.reverse();
        edgeIds.reverse();
        evidence.reverse();
        return { nodeIds, edgeIds, evidence };
      }
      queue.push(next.id);
    }
  }
  return null;
}

/**
 * Bounded graph overview to keep the canvas responsive at large scale.
 * Prefer frequently connected real nodes, then preserve pinned nodes/path.
 * Truncation is always reported to the interface; no new edges are created.
 */
export function planGraphViewport(
  graph: Subgraph,
  options: { maxNodes?: number; maxEdges?: number; pinNodeIds?: readonly string[]; pinEdgeIds?: readonly string[] } = {},
): { graph: Subgraph; omittedNodes: number; omittedEdges: number } {
  const maxNodes = Math.max(1, Math.floor(options.maxNodes ?? 600));
  const maxEdges = Math.max(0, Math.floor(options.maxEdges ?? 1800));
  if (graph.nodes.length <= maxNodes && graph.edges.length <= maxEdges) {
    return { graph, omittedNodes: 0, omittedEdges: 0 };
  }

  const nodeMap = new Map(graph.nodes.map(node => [node.id, node]));
  const degrees = new Map(graph.nodes.map(node => [node.id, 0]));
  for (const edge of graph.edges) {
    if (!degrees.has(edge.source) || !degrees.has(edge.target)) continue;
    degrees.set(edge.source, degrees.get(edge.source)! + 1);
    degrees.set(edge.target, degrees.get(edge.target)! + 1);
  }

  const chosen = new Set<string>();
  for (const id of options.pinNodeIds ?? []) {
    if (chosen.size >= maxNodes) break;
    if (nodeMap.has(id)) chosen.add(id);
  }
  const ranked = [...graph.nodes].sort((a, b) =>
    degrees.get(b.id)! - degrees.get(a.id)! || a.id.localeCompare(b.id));
  for (const node of ranked) {
    if (chosen.size >= maxNodes) break;
    chosen.add(node.id);
  }

  const eligible = graph.edges.filter(edge => chosen.has(edge.source) && chosen.has(edge.target));
  const pinnedEdges = new Set(options.pinEdgeIds ?? []);
  const prioritised = [...eligible].sort((a, b) => {
    const priority = Number(pinnedEdges.has(b.id)) - Number(pinnedEdges.has(a.id));
    return priority || a.id.localeCompare(b.id);
  });
  const visibleEdgeIds = new Set(prioritised.slice(0, maxEdges).map(edge => edge.id));

  const shownNodes = graph.nodes.filter(node => chosen.has(node.id));
  const shownEdges = graph.edges.filter(edge => visibleEdgeIds.has(edge.id));
  return {
    graph: { nodes: shownNodes, edges: shownEdges },
    omittedNodes: graph.nodes.length - shownNodes.length,
    omittedEdges: graph.edges.length - shownEdges.length,
  };
}
