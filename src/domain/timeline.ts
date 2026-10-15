import type { GraphNode } from './graph.ts';

/**
 * Stable, newest-first view over already filtered events.
 * A timeline entry is always a real recorded node; timestamps are not invented.
 */
export function latestTimelineNodes(nodes: readonly GraphNode[], limit = 48): GraphNode[] {
  const safeLimit = Number.isInteger(limit) && limit >= 0 ? Math.min(limit, 250) : 48;
  return [...nodes]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id))
    .slice(0, safeLimit);
}
