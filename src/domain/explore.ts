import type { GraphEdge, GraphNode } from './graph.ts';

/** A validated induced subgraph. Does not fabricate relationships. */
export type Subgraph = { nodes: GraphNode[]; edges: GraphEdge[] };
export type LensDepth = 0 | 1 | 2 | 3;

/**
 * Obsidian-style local graph.
 * Runs breadth-first over the currently visible graph, including both
 * incoming and outgoing relationships. Depth zero means "all visible".
 * If a selected node becomes hidden by a filter, keep the original graph.
 */
export function getNeighborhoodGraph(graph: Subgraph, pivotId: string | null, depth: LensDepth): Subgraph {
  if (depth === 0 || pivotId === null) return graph;

  const ids = new Set(graph.nodes.map(node => node.id));
  if (!ids.has(pivotId)) return graph;

  const links = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    const source = links.get(edge.source) ?? [];
    const target = links.get(edge.target) ?? [];
    source.push(edge.target);
    target.push(edge.source);
    links.set(edge.source, source);
    links.set(edge.target, target);
  }

  const visited = new Set<string>([pivotId]);
  let frontier = [pivotId];

  for (let distance = 0; distance < depth && frontier.length > 0; distance++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of links.get(id) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }

  return {
    nodes: graph.nodes.filter(node => visited.has(node.id)),
    edges: graph.edges.filter(edge => visited.has(edge.source) && visited.has(edge.target)),
  };
}
