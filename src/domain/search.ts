import type { EvidenceLevel, GraphNode, NodeKind, Workspace } from './graph.ts';
import { EVIDENCE_LEVELS, NODE_KINDS } from './graph.ts';

/**
 * In-memory trigram posting lists for workspace-local search.
 * Never uploads, caches outside memory, or indexes API request bodies.
 * Build once per workspace revision, not on every keystroke.
 */
export type GraphSearchIndex = {
  textById: Map<string, string[]>;
  postings: Map<string, Set<string>>;
  nodes: readonly GraphNode[];
};

const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase().trim();
const grams = (value: string): string[] => {
  const parts = new Set<string>();
  for (let i = 0; i + 3 <= value.length; i++) parts.add(value.slice(i, i + 3));
  return [...parts];
};
export function createGraphSearchIndex(workspace: Pick<Workspace, 'nodes'>): GraphSearchIndex {
  const textById = new Map<string, string[]>();
  const postings = new Map<string, Set<string>>();
  for (const node of workspace.nodes) {
    const text = [node.label, node.detail, node.source].map(normalize);
    textById.set(node.id, text);
    for (const gram of new Set(text.flatMap(value => grams(value)))) {
      const ids = postings.get(gram) ?? new Set<string>();
      ids.add(node.id);
      postings.set(gram, ids);
    }
  }
  return { nodes: workspace.nodes, textById, postings };
}

type Term = { field: 'text' | 'kind' | 'source' | 'evidence' | 'trace'; value: string };
export function parseGraphQuery(query: string): Term[] {
  const terms: Term[] = [];
  const tokens = query.match(/(?:[^\s"]+:"[^"]+"|"[^"]+"|\S+)/g) ?? [];
  for (const token of tokens) {
    const colon = token.indexOf(':');
    const name = colon > 0 ? token.slice(0, colon).toLocaleLowerCase() : '';
    const field = ['kind', 'source', 'evidence', 'trace'].includes(name)
      ? name as Term['field'] : 'text';
    let value = field === 'text' ? token : token.slice(colon + 1);
    value = normalize(value.replace(/^"|"$/g, ''));
    if (value) terms.push({field, value});
  }
  return terms;
}

function termMatches(node: GraphNode, text: string[] | undefined, term: Term): boolean {
  if (term.field === 'kind') return NODE_KINDS.includes(term.value as NodeKind) && node.kind === term.value;
  if (term.field === 'evidence') return EVIDENCE_LEVELS.includes(term.value as EvidenceLevel) && node.evidence === term.value;
  if (term.field === 'source') return normalize(node.source).includes(term.value);
  if (term.field === 'trace') return Boolean(node.traceId && normalize(node.traceId).startsWith(term.value));
  return Boolean(text?.some(value => value.includes(term.value)));
}

/** AND all terms and structural filters; matches only existing node IDs. */
export function searchGraphIndex(index: GraphSearchIndex, query: string): Set<string> {
  const terms = parseGraphQuery(query);
  if (!terms.length) return new Set(index.nodes.map(node => node.id));
  const postings: Set<string>[] = [];
  for (const term of terms) {
    if (term.field !== 'text' || term.value.length < 3) continue;
    for (const gram of grams(term.value)) {
      const matches = index.postings.get(gram);
      if (!matches) return new Set();
      postings.push(matches);
    }
  }
  postings.sort((a, b) => a.size - b.size);
  const candidates = postings.length ? postings[0]! : null;
  const found = new Set<string>();
  for (const node of index.nodes) {
    if (candidates && !candidates.has(node.id)) continue;
    // Check remaining gram lists before any textual substring check.
    if (postings.some(list => !list.has(node.id))) continue;
    const text = index.textById.get(node.id);
    if (terms.every(term => termMatches(node, text, term))) found.add(node.id);
  }
  return found;
}
