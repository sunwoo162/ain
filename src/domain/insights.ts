import type { EvidenceLevel, GraphNode, Workspace } from './graph.ts';

export type TraceSummary = {
  traceId: string;
  nodes: GraphNode[];
  nodeCount: number;
  edgeCount: number;
  observed: number;
  reported: number;
  inferred: number;
  manual: number;
  modelCalls: number;
  toolRequests: number;
  failures: number;
  responses: number;
  startedAt: string;
  endedAt: string;
  durationMs: number;
};

/**
 * Analyze only explicitly trace-tagged records. A timestamp span is an
 * observed record window, NOT inferred model generation latency.
 * No provider response text or reasoning is synthesized.
 */
export function summarizeTrace(workspace: Workspace, traceId: string): TraceSummary | null {
  if (!traceId) return null;
  const nodes = workspace.nodes.filter(node => node.traceId === traceId)
    .sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)||a.id.localeCompare(b.id));
  if(!nodes.length)return null;
  const ids=new Set(nodes.map(node=>node.id));
  const edges=workspace.edges.filter(edge=>
    ids.has(edge.source) && ids.has(edge.target) && (edge.traceId === undefined || edge.traceId === traceId));
  const provenance:Record<EvidenceLevel,number>={observed:0,reported:0,inferred:0,manual:0};
  for(const node of nodes)provenance[node.evidence]++;
  const stamps=nodes.map(n=>Date.parse(n.createdAt))
    .concat(edges.map(e=>Date.parse(e.createdAt)));
  const start=Math.min(...stamps),end=Math.max(...stamps);
  return {
    traceId,nodes,nodeCount:nodes.length,edgeCount:edges.length,
    ...provenance,
    modelCalls:nodes.filter(n=>n.kind==='model').length,
    toolRequests:nodes.filter(n=>n.kind==='tool').length,
    failures:nodes.filter(n=>n.kind==='error').length,
    responses:nodes.filter(n=>n.kind==='answer').length,
    startedAt:new Date(start).toISOString(),
    endedAt:new Date(end).toISOString(),
    durationMs:Math.max(0,end-start),
  };
}
