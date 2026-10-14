import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ChangeEvent, type MutableRefObject } from 'react';
import cytoscape, { type Core, type ElementDefinition } from 'cytoscape';
import {
  Activity, ArrowDownToLine, ArrowRight, BookOpen, Check, ChevronDown, ChevronRight,
  CircleHelp, Clock3, Filter, GitBranch, GitFork,
  Layers3, Link2, Maximize, MessageCircle, MousePointer2, Network, Plus, RotateCcw,
  Search, ShieldCheck, SlidersHorizontal, Sparkles, Upload, X, ZoomIn, ZoomOut,
} from 'lucide-react';
import {
  addManualLink, addNote, getNeighbors, getVisibleGraph, NODE_KINDS,
  timelineFrames, type EvidenceLevel, type GraphEdge, type GraphNode, type NodeKind,
  type Workspace,
} from './domain/graph';
import { demoWorkspace } from './data/demo';
import { downloadWorkspace, loadWorkspace, MAX_IMPORT_BYTES, parseImport, saveWorkspace } from './lib/storage';

const KIND_META: Record<NodeKind, { label: string; color: string }> = {
  prompt: { label: 'Prompts', color: '#a2a9ff' },
  model: { label: 'Model calls', color: '#9485fa' },
  document: { label: 'Documents', color: '#5dc8be' },
  memory: { label: 'Memory', color: '#e4ae6d' },
  tool: { label: 'Tool calls', color: '#76abff' },
  'reasoning-summary': { label: 'Summaries', color: '#cc9aff' },
  answer: { label: 'Answers', color: '#71d4a4' },
  note: { label: 'My notes', color: '#e7bd7a' },
  error: { label: 'Errors', color: '#ef8a91' },
};
const EVIDENCE_META: Record<EvidenceLevel, { label: string; help: string }> = {
  observed: { label: 'Observed', help: 'Directly logged by an integration. Not proof of internal reasoning.' },
  reported: { label: 'Reported', help: 'An explanation or description provided by a source or model.' },
  inferred: { label: 'Inferred', help: 'A proposed connection, not confirmed by a trace.' },
  manual: { label: 'Manual', help: 'A user-added note or connection.' },
};
const fmtDate = (iso: string) => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

type GraphCanvasProps = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  cyRef: MutableRefObject<Core | null>;
  layoutKey: number;
};

function GraphCanvas({ nodes, edges, selected, onSelect, cyRef, layoutKey }: GraphCanvasProps) {
  const mount = useRef<HTMLDivElement>(null);
  const selectHandler = useRef(onSelect);
  useEffect(() => { selectHandler.current = onSelect; }, [onSelect]);
  const elements = useMemo<ElementDefinition[]>(() => [
    ...nodes.map(n => ({ data: { id: n.id, label: n.label, kind: n.kind, evidence: n.evidence, color: KIND_META[n.kind].color } })),
    ...edges.map(e => ({ data: { id: e.id, source: e.source, target: e.target, kind: e.kind, evidence: e.evidence } })),
  ], [nodes, edges]);

  useEffect(() => {
    if (!mount.current) return;
    const cy = cytoscape({
      container: mount.current,
      elements,
      minZoom: 0.25,
      maxZoom: 3,
      wheelSensitivity: 0.16,
      selectionType: 'single',
      boxSelectionEnabled: false,
      style: [
        { selector: 'node', style: {
          'background-color': 'data(color)', width: 32, height: 32,
          'border-width': 5, 'border-color': '#151a28', 'border-opacity': 1,
          label: 'data(label)', color: '#cdd3e2', 'font-size': 11, 'font-family': 'Inter, ui-sans-serif, system-ui, sans-serif',
          'text-wrap': 'ellipsis', 'text-max-width': '112px', 'text-overflow-wrap': 'anywhere',
          'text-valign': 'bottom', 'text-margin-y': 14,
          'min-zoomed-font-size': 7,
          'overlay-opacity': 0,
        } },
        { selector: 'node[evidence = "reported"]', style: { 'border-style': 'dashed', 'border-color': '#9284c0' } },
        { selector: 'node[evidence = "inferred"]', style: { 'border-style': 'dotted', 'border-color': '#efb96e' } },
        { selector: 'node[evidence = "manual"]', style: { shape: 'round-rectangle', width: 34, height: 30 } },
        { selector: 'edge', style: {
          width: 1.5, 'line-color': '#45516c', 'target-arrow-shape': 'triangle',
          'target-arrow-color': '#45516c', 'arrow-scale': 0.62, 'curve-style': 'bezier', opacity: 0.62,
        } },
        { selector: 'edge[evidence = "reported"], edge[evidence = "inferred"]', style: { 'line-style': 'dashed' } },
        { selector: 'edge[evidence = "manual"]', style: { 'line-style': 'dotted', 'line-color': '#d7af78', 'target-arrow-color': '#d7af78' } },
        { selector: '.dim', style: { opacity: 0.12 } },
        { selector: 'node.focused', style: {
          'border-color': '#f9fafb', 'border-width': 3, 'background-color': 'data(color)', opacity: 1,
        } },
        { selector: 'edge.connected', style: { opacity: 1, width: 2.2, 'line-color': '#8392ba', 'target-arrow-color': '#8392ba' } },
      ],
      layout: { name: 'cose', animate: false, padding: 56, idealEdgeLength: 126, nodeRepulsion: () => 450000, randomize: false },
    });
    cyRef.current = cy;
    cy.on('tap', 'node', e => selectHandler.current(e.target.id()));
    cy.on('tap', e => { if (e.target === cy) selectHandler.current(null); });
    const observer = new ResizeObserver(() => cy.resize());
    observer.observe(mount.current);
    return () => {
      observer.disconnect();
      if (cyRef.current === cy) cyRef.current = null;
      cy.destroy();
    };
  }, [elements, cyRef, layoutKey]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass('dim focused connected');
    if (!selected || !cy.getElementById(selected).length) return;
    const node = cy.getElementById(selected);
    const adjacent = node.closedNeighborhood();
    cy.elements().not(adjacent).addClass('dim');
    node.addClass('focused');
    node.connectedEdges().addClass('connected');
  }, [selected, elements, cyRef, layoutKey]);

  return <div className="graph-canvas" ref={mount} role="img" aria-label="Interactive AI evidence graph. Select nodes to inspect their details." />;
}

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>(loadWorkspace);
  const [query, setQuery] = useState('');
  const [kinds, setKinds] = useState<NodeKind[]>([...NODE_KINDS]);
  const [selected, setSelected] = useState<string | null>('answer1');
  const [frame, setFrame] = useState<number | null>(null);
  const [mode, setMode] = useState<'graph' | 'timeline' | 'library'>('graph');
  const [layoutKey, setLayoutKey] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteDetail, setNoteDetail] = useState('');
  const [linkTarget, setLinkTarget] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [toast, setToast] = useState('');
  const cyRef = useRef<Core | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const frames = useMemo(() => timelineFrames(workspace), [workspace]);
  const currentFrame = frame === null ? frames.length : Math.min(frame, frames.length);
  const asOf = currentFrame === frames.length ? undefined : frames[Math.max(0, currentFrame - 1)];
  const filtered = useMemo(() => getVisibleGraph(workspace, { query, kinds, asOf }), [workspace, query, kinds, asOf]);
  const selectedNode = useMemo(() => workspace.nodes.find(n => n.id === selected) ?? null, [workspace, selected]);
  const neighbors = useMemo(() => selected ? getNeighbors(workspace, selected) : [], [workspace, selected]);
  const counts = useMemo(() => Object.fromEntries(NODE_KINDS.map(k => [k, workspace.nodes.filter(n => n.kind === k).length])) as Record<NodeKind, number>, [workspace]);

  useEffect(() => {
    try { saveWorkspace(workspace); }
    catch { setToast('Could not save: browser storage is full or disabled. Export your graph to keep a copy.'); }
  }, [workspace]);
  useEffect(() => { if (selected && !workspace.nodes.some(n => n.id === selected)) setSelected(null); }, [selected, workspace]);
  const flash = useCallback((msg: string) => { setToast(msg); }, []);
  const toggleKind = (kind: NodeKind) => setKinds(prev => prev.includes(kind) ? prev.filter(k => k !== kind) : [...prev, kind]);
  const changeMode = (next: 'graph' | 'timeline' | 'library') => { setMode(next); if (next === 'timeline') setFrame(curr => curr ?? frames.length); };
  const addNewNote = (event: FormEvent) => {
    event.preventDefault();
    try {
      const id = `note-${uid()}`;
      setWorkspace(prev => addNote(prev, noteTitle, noteDetail, new Date().toISOString(), id));
      setSelected(id); setFrame(null); setNoteTitle(''); setNoteDetail(''); setEditorOpen(false);
      flash('Note saved locally.');
    } catch (err) { flash(err instanceof Error ? err.message : 'Unable to create note.'); }
  };
  const addLink = (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !linkTarget) return;
    try {
      setWorkspace(prev => addManualLink(prev, selected, linkTarget, new Date().toISOString(), `edge-${uid()}`));
      setFrame(null); setLinkTarget(''); setLinkOpen(false); flash('Manual relationship created.');
    } catch (err) { flash(err instanceof Error ? err.message : 'Unable to create link.'); }
  };
  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error('Import must be under 2 MB.');
      const next = parseImport(await file.text());
      setWorkspace(next); setSelected(null); setFrame(null); setQuery(''); setKinds([...NODE_KINDS]);
      flash(`Imported ${next.nodes.length} nodes.`);
    } catch (err) { flash(err instanceof Error ? err.message : 'Invalid import.'); }
    finally { event.target.value = ''; }
  };
  const reset = () => {
    if (!window.confirm('Replace this local workspace with the sample graph? Export your data first if you want to keep it.')) return;
    setWorkspace(structuredClone(demoWorkspace)); setSelected('answer1'); setFrame(null);
    setQuery(''); setKinds([...NODE_KINDS]); flash('Restored sample graph.');
  };
  const exportGraph = () => { downloadWorkspace(workspace); flash('Workspace exported.'); };
  const cycleFrame = (direction: 1 | -1) => setFrame(Math.min(frames.length, Math.max(0, currentFrame + direction)));

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon"><Network size={21} strokeWidth={2.25} /></div><div><strong>mindtrace<span className="brand-dot">.</span></strong><small>AI KNOWLEDGE EXPLORER</small></div></div>
      <div className="workspace-card"><div className="workspace-avatar">M</div><div className="workspace-text"><strong>{workspace.name}</strong><small>{workspace.isDemo ? 'Example workspace' : 'Local workspace'}</small></div><ChevronDown size={15} className="muted" /></div>
      <div className="sidebar-section-label">WORKSPACE</div>
      <nav className="nav-list" aria-label="Views">
        <button type="button" className={`nav-item ${mode === 'graph' ? 'active' : ''}`} onClick={() => changeMode('graph')}><Network size={17} /> Graph explorer <span className="nav-key">G</span></button>
        <button type="button" className={`nav-item ${mode === 'timeline' ? 'active' : ''}`} onClick={() => changeMode('timeline')}><Clock3 size={17} /> Timeline</button>
        <button type="button" className={`nav-item ${mode === 'library' ? 'active' : ''}`} onClick={() => changeMode('library')}><BookOpen size={17} /> Node library</button>
      </nav>
      <div className="section-top"><span className="sidebar-section-label">NODE TYPES</span><button type="button" className="tiny-link" onClick={() => setKinds(kinds.length === NODE_KINDS.length ? [] : [...NODE_KINDS])}>{kinds.length === NODE_KINDS.length ? 'Clear' : 'All'}</button></div>
      <div className="type-list">{NODE_KINDS.map(kind => <label key={kind} className="type-row"><input type="checkbox" checked={kinds.includes(kind)} onChange={() => toggleKind(kind)} /><span className="type-dot" style={{ backgroundColor: KIND_META[kind].color }} /><span>{KIND_META[kind].label}</span><small>{counts[kind]}</small></label>)}</div>
      <div className="sidebar-bottom"><div className="privacy-card"><ShieldCheck size={17} /><div><strong>Local-first by design</strong><p>Your graph stays in this browser. No account or tracking required.</p></div></div><a className="sidebar-link" href="https://github.com/sunwoo162/ain" target="_blank" rel="noreferrer"><GitBranch size={16} /> Open source on GitHub <ArrowRight size={13} /></a></div>
    </aside>

    <div className="main-layout">
      <header className="topbar"><div className="crumbs"><span>Workspace</span><ChevronRight size={15}/><strong>{mode === 'graph' ? 'Graph explorer' : mode === 'timeline' ? 'Timeline' : 'Node library'}</strong></div><div className="header-actions"><span className="autosave"><span className="status-dot" /> Saved locally</span><span className="header-divider"/><button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()} title="Import a MindTrace JSON workspace"><Upload size={16}/> Import</button><button type="button" className="btn btn-ghost" onClick={exportGraph}><ArrowDownToLine size={16}/> Export</button><button type="button" className="btn btn-primary" onClick={() => setEditorOpen(true)}><Plus size={16}/> New note</button></div></header>
      <main className="content">
        <div className="page-heading"><div><div className="eyebrow"><Sparkles size={13}/> TRACE THE EVIDENCE</div><h1>{mode === 'graph' ? 'Knowledge graph' : mode === 'timeline' ? 'Trace timeline' : 'Node library'}</h1><p>{mode === 'graph' ? 'Explore the connections behind AI activity.' : mode === 'timeline' ? 'Step through observable events, without inventing hidden thoughts.' : 'Browse every piece of evidence in your workspace.'}</p></div><div className="heading-meta"><div><strong>{workspace.nodes.length}</strong><small>Nodes</small></div><div><strong>{workspace.edges.length}</strong><small>Connections</small></div></div></div>
        <div className="canvas-toolbar"><label className="search-field"><Search size={17}/><input aria-label="Search nodes" placeholder="Search nodes, sources, details..." value={query} onChange={e => setQuery(e.target.value)} />{query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={14}/></button>}<kbd>⌘ K</kbd></label><div className="toolbar-right"><span className="result-count">{filtered.nodes.length} shown</span><span className="toolbar-separator"/><button type="button" className="icon-button" title="Show all node types" onClick={() => setKinds([...NODE_KINDS])}><Filter size={17}/></button><button type="button" className="icon-button" title="Rearrange graph" onClick={() => setLayoutKey(k => k + 1)}><SlidersHorizontal size={17}/></button><button type="button" className="icon-button" title="Restore sample graph" onClick={reset}><RotateCcw size={17}/></button></div></div>
        {mode === 'library' ? <div className="library-view"><div className="library-header"><span>NAME</span><span>TYPE</span><span>PROVENANCE</span><span>CREATED</span></div>{filtered.nodes.map(node => <button className={`library-row ${selected === node.id ? 'selected' : ''}`} key={node.id} onClick={() => setSelected(node.id)}><span className="library-title"><span className="type-dot" style={{ backgroundColor: KIND_META[node.kind].color }}/>{node.label}</span><span>{KIND_META[node.kind].label}</span><span className={`evidence-text evidence-${node.evidence}`}>{EVIDENCE_META[node.evidence].label}</span><span>{fmtDate(node.createdAt)}</span></button>)}{!filtered.nodes.length && <div className="empty-state">No nodes match the current filters.</div>}</div> : <div className="graph-surface">
          <div className="surface-top"><span><span className="pulse-dot"/> {workspace.isDemo ? 'SAMPLE DATA' : 'LOCAL WORKSPACE'}</span><span className="surface-note"><MousePointer2 size={13}/> Select a node to inspect</span></div>
          {filtered.nodes.length ? <GraphCanvas nodes={filtered.nodes} edges={filtered.edges} selected={selected} onSelect={setSelected} cyRef={cyRef} layoutKey={layoutKey}/> : <div className="empty-graph"><Network size={30}/><strong>No matching nodes</strong><span>Try a different search or node filter.</span></div>}
          <div className="graph-controls"><button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => cyRef.current?.zoom({ level: Math.min(3, (cyRef.current?.zoom() ?? 1) * 1.25), renderedPosition: { x: (cyRef.current?.width() ?? 0) / 2, y: (cyRef.current?.height() ?? 0) / 2 } })}><ZoomIn size={17}/></button><button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => cyRef.current?.zoom({ level: Math.max(.25, (cyRef.current?.zoom() ?? 1) / 1.25), renderedPosition: { x: (cyRef.current?.width() ?? 0) / 2, y: (cyRef.current?.height() ?? 0) / 2 } })}><ZoomOut size={17}/></button><div className="control-divider"/><button type="button" title="Fit graph" aria-label="Fit graph" onClick={() => cyRef.current?.fit(undefined, 55)}><Maximize size={17}/></button></div>
          <div className="legend"><span><i className="legend-line"/> Observed</span><span><i className="legend-line dashed"/> Reported / inferred</span><span><i className="legend-line dotted"/> Manual</span></div>
        </div>}
        {(mode === 'timeline' || frame !== null) && <div className="timeline-card"><div className="timeline-label"><Clock3 size={16}/> <strong>Event replay</strong><span>{frames.length ? (currentFrame === frames.length ? 'All events' : currentFrame === 0 ? 'Before first event' : fmtDate(frames[currentFrame - 1]!)) : 'No events'}</span></div><div className="timeline-controls"><button type="button" aria-label="Previous event" onClick={() => cycleFrame(-1)} disabled={currentFrame <= 0}>‹</button><input type="range" aria-label="Event position" min="0" max={frames.length} value={currentFrame} onChange={e => setFrame(Number(e.target.value))}/><button type="button" aria-label="Next event" onClick={() => cycleFrame(1)} disabled={currentFrame >= frames.length}>›</button><button type="button" className="tiny-link" onClick={() => setFrame(null)}>Latest</button></div><small>{currentFrame} / {frames.length} events</small></div>}
        <div className="under-graph"><div><Activity size={15}/><span>Graph connections describe recorded relationships, not private model thoughts.</span></div><a href="https://github.com/sunwoo162/ain#evidence-model" target="_blank" rel="noreferrer">Evidence model <ArrowRight size={13}/></a></div>
      </main>
    </div>

    <aside className="inspector"><div className="inspector-header"><div><Layers3 size={17}/> Inspector</div><button type="button" aria-label="Clear selection" title="Clear selection" onClick={() => setSelected(null)}><X size={16}/></button></div>{selectedNode ? <div className="inspector-body"><div className="inspector-caption">SELECTED NODE</div><div className="node-symbol" style={{ color: KIND_META[selectedNode.kind].color, backgroundColor: `${KIND_META[selectedNode.kind].color}1b` }}><Network size={24}/></div><h2>{selectedNode.label}</h2><div className="node-tags"><span className="tag"><span className="type-dot" style={{ backgroundColor: KIND_META[selectedNode.kind].color }}/>{KIND_META[selectedNode.kind].label}</span><span className={`tag provenance evidence-${selectedNode.evidence}`}>{EVIDENCE_META[selectedNode.evidence].label}</span></div><div className="inspector-divider"/><div className="inspector-caption">DESCRIPTION</div><p className="node-description">{selectedNode.detail || 'No description provided.'}</p><div className="inspector-caption" style={{ marginTop: 26 }}>PROVENANCE</div><dl className="node-properties"><div><dt>Source</dt><dd>{selectedNode.source}</dd></div><div><dt>Recorded</dt><dd>{fmtDate(selectedNode.createdAt)}</dd></div><div><dt>Evidence</dt><dd>{EVIDENCE_META[selectedNode.evidence].label}</dd></div></dl><div className="provenance-info"><CircleHelp size={15}/>{EVIDENCE_META[selectedNode.evidence].help}</div><div className="inspector-divider"/><div className="connections-heading"><span>CONNECTED NODES</span><span>{neighbors.length}</span></div><div className="connections-list">{neighbors.length ? neighbors.map(n => <button key={n.id} onClick={() => { setSelected(n.id); if (mode === 'timeline' && frame !== null) setFrame(null); }}><span className="type-dot" style={{ backgroundColor: KIND_META[n.kind].color }} /><span>{n.label}</span><ArrowRight size={13}/></button>) : <p className="muted small">No connections yet.</p>}</div><button type="button" className="btn btn-outline link-button" onClick={() => { setLinkOpen(x => !x); setLinkTarget(''); }}><Link2 size={15}/> Add manual connection</button>{linkOpen && <form className="link-form" onSubmit={addLink}><label>Connect to</label><select value={linkTarget} onChange={e => setLinkTarget(e.target.value)} required><option value="">Choose a node</option>{workspace.nodes.filter(n => n.id !== selectedNode.id).map(n => <option key={n.id} value={n.id}>{n.label}</option>)}</select><button className="btn btn-primary" type="submit">Create link</button></form>}</div> : <div className="inspector-placeholder"><GitFork size={32}/><strong>Nothing selected</strong><p>Click a node to inspect its source, evidence and connections.</p></div>}
      <div className="inspector-footer"><span><ShieldCheck size={14}/> Provenance-aware by design</span></div>
    </aside>

    <input hidden ref={fileRef} type="file" accept="application/json,.json" onChange={importFile} />
    {editorOpen && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setEditorOpen(false); }}><form className="modal" onSubmit={addNewNote} aria-label="Create a note"><div className="modal-top"><div><span className="eyebrow">PERSONAL ANNOTATION</span><h2>New note</h2></div><button type="button" className="icon-button" onClick={() => setEditorOpen(false)} aria-label="Close"><X size={18}/></button></div><label htmlFor="note-title">Title</label><input id="note-title" required maxLength={140} autoFocus placeholder="What did you discover?" value={noteTitle} onChange={e => setNoteTitle(e.target.value)} /><label htmlFor="note-detail">Details</label><textarea id="note-detail" rows={5} maxLength={10000} placeholder="Add context, observations or links..." value={noteDetail} onChange={e => setNoteDetail(e.target.value)} /><div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={() => setEditorOpen(false)}>Cancel</button><button type="submit" className="btn btn-primary"><Check size={15}/> Create note</button></div></form></div>}
    {toast && <div className="toast" role="status"><MessageCircle size={16}/><span>{toast}</span><button type="button" aria-label="Dismiss notification" onClick={() => setToast('')}><X size={14}/></button></div>}
  </div>;
}
