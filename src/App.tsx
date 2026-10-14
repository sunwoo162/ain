import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ChangeEvent, type MutableRefObject } from 'react';
import cytoscape, { type Core, type ElementDefinition } from 'cytoscape';
import {
  Activity, ArrowDownToLine, ArrowRight, BookOpen, Check, ChevronDown, ChevronRight,
  CircleHelp, Clock3, Filter, GitBranch, GitFork, Radio,
  Layers3, Link2, Maximize, MessageCircle, MousePointer2, Network, Plus, RotateCcw,
  Search, ShieldCheck, SlidersHorizontal, Sparkles, Upload, X, ZoomIn, ZoomOut, Focus,
} from 'lucide-react';
import {
  addManualLink, addNote, getNeighbors, getVisibleGraph, NODE_KINDS,
  timelineFrames, type EvidenceLevel, type GraphEdge, type GraphNode, type NodeKind,
  type Workspace,
} from './domain/graph';
import { demoWorkspace } from './data/demo';
import { mergeLiveWorkspace } from './domain/trace';
import { EventChronicle } from './components/EventChronicle';
import { ConstellationExplorer } from './components/ConstellationExplorer';
import { GraphMinimap } from './components/GraphMinimap';
import { TimelineDiff } from './components/TimelineDiff';
import { groupByTraceId } from './domain/trace-groups';
import { createGraphSearchIndex, searchGraphIndex } from './domain/search';
import { TraceInsights } from './components/TraceInsights';
import { QuickStart } from './components/QuickStart';
import { findConnectedClusters, filterToCluster, semanticZoomLevel, type ZoomLevel } from './domain/clusters';
import { getNeighborhoodGraph, type LensDepth } from './domain/explore';
import { findRecordedPath, planGraphViewport, type RecordedPath } from './domain/paths';
import { downloadWorkspace, loadWorkspace, MAX_IMPORT_BYTES, parseImport, saveWorkspace } from './lib/storage';

const KIND_META: Record<NodeKind, { label: string; color: string }> = {
  prompt: { label: '질문', color: '#a2a9ff' },
  model: { label: '모델 호출', color: '#9485fa' },
  document: { label: '문서', color: '#5dc8be' },
  memory: { label: '메모리', color: '#e4ae6d' },
  tool: { label: '도구 실행', color: '#76abff' },
  'reasoning-summary': { label: '근거 요약', color: '#cc9aff' },
  answer: { label: '답변', color: '#71d4a4' },
  note: { label: '내 메모', color: '#e7bd7a' },
  error: { label: '오류', color: '#ef8a91' },
};
const EVIDENCE_META: Record<EvidenceLevel, { label: string; help: string }> = {
  observed: { label: '관측됨', help: '연동 프로그램이 실제로 기록한 이벤트입니다. 내부 사고에서 사용했다는 증거는 아닙니다.' },
  reported: { label: '제공된 설명', help: '모델 또는 외부 자료가 제공한 설명이며 직접 관측한 근거와 다릅니다.' },
  inferred: { label: '추정', help: '확인되지 않은 관계입니다. 검증된 사실로 취급하지 마세요.' },
  manual: { label: '수동 작성', help: '사용자가 직접 추가한 노트 또는 연결입니다.' },
};
const fmtDate = (iso: string) => new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

type GraphCanvasProps = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selected: string | null;
  path: RecordedPath | null;
  onSelect: (id: string | null) => void;
  onZoomTier: (tier: ZoomLevel) => void;
  onReady: (engine: Core | null) => void;
  cyRef: MutableRefObject<Core | null>;
  layoutKey: number;
};

function GraphCanvas({
  nodes, edges, selected, path, onSelect, onZoomTier, onReady, cyRef, layoutKey,
}: GraphCanvasProps) {
  const mount = useRef<HTMLDivElement>(null);
  const selectHandler = useRef(onSelect);
  const zoomTierHandler = useRef(onZoomTier);
  const zoomTierRef = useRef<ZoomLevel>('explore');
  const previousLayoutKey = useRef<number | null>(null);
  const hasLaidOut = useRef(false);
  useEffect(() => { selectHandler.current = onSelect; }, [onSelect]);
  useEffect(() => { zoomTierHandler.current = onZoomTier; }, [onZoomTier]);

  const elements = useMemo<ElementDefinition[]>(() => [
    ...nodes.map(n => ({ data: {
      id: n.id, label: n.label, kind: n.kind, evidence: n.evidence, color: KIND_META[n.kind].color,
    } })),
    ...edges.map(e => ({ data: {
      id: e.id, source: e.source, target: e.target, kind: e.kind, evidence: e.evidence,
    } })),
  ], [nodes, edges]);

  // One Cytoscape instance per mounted graph. Data refreshes no longer reset
  // camera zoom, pan, pointer listeners, or every existing node's position.
  useEffect(() => {
    if (!mount.current) return;
    const cy = cytoscape({
      container: mount.current,
      elements: [],
      minZoom: 0.18, maxZoom: 1.9,
      wheelSensitivity: 0.16,
      selectionType: 'single',
      boxSelectionEnabled: false,
      style: [
        { selector: 'node', style: {
          'background-color': 'data(color)', width: 29, height: 29,
          'border-width': 6, 'border-color': '#0b1224', 'border-opacity': 1,
          label: 'data(label)', color: '#dce6f9', 'font-size': 11, 'font-weight': 600, 'font-family': 'Inter, ui-sans-serif, system-ui, sans-serif',
          'text-wrap': 'ellipsis', 'text-max-width': '112px', 'text-overflow-wrap': 'anywhere',
          'text-valign': 'bottom', 'text-margin-y': 14,
          'min-zoomed-font-size': 7,
          'overlay-opacity': 0,
        } },
        { selector: 'node[kind = "answer"]', style: { width: 44, height: 44, 'border-width': 7, 'border-color': '#2a706e' } },
        { selector: 'node[kind = "model"]', style: { width: 39, height: 39, 'border-width': 7, 'border-color': '#574b91' } },
        { selector: 'node[kind = "prompt"]', style: { width: 36, height: 36, 'border-width': 7, 'border-color': '#3e5787' } },
        { selector: 'node[evidence = "reported"]', style: { 'border-style': 'dashed', 'border-color': '#9284c0' } },
        { selector: 'node[evidence = "inferred"]', style: { 'border-style': 'dotted', 'border-color': '#efb96e' } },
        { selector: 'node[evidence = "manual"]', style: { shape: 'round-rectangle', width: 34, height: 30 } },
        { selector: 'edge', style: {
          width: 1.35, 'line-color': '#526a91', 'target-arrow-shape': 'triangle',
          'target-arrow-color': '#526a91', 'arrow-scale': 0.52, 'curve-style': 'bezier', opacity: 0.52,
        } },
        { selector: 'edge[evidence = "reported"], edge[evidence = "inferred"]', style: { 'line-style': 'dashed' } },
        { selector: 'edge[evidence = "manual"]', style: { 'line-style': 'dotted', 'line-color': '#d7af78', 'target-arrow-color': '#d7af78' } },
        { selector: '.dim', style: { opacity: 0.08 } },
        { selector: 'node.route-node', style: { opacity: 1, 'border-width': 4, 'border-color': '#c9f7ff', 'z-index': 70 } },
        { selector: 'node.route-start', style: { 'border-color': '#bcb1ff', 'border-width': 6, 'z-index': 90 } },
        { selector: 'node.route-end', style: { 'border-color': '#75f4d5', 'border-width': 6, 'z-index': 90 } },
        { selector: 'edge.route-edge', style: { opacity: 1, width: 4.2, 'line-color': '#74e4f4', 'target-arrow-color': '#74e4f4', 'z-index': 80 } },
        // Semantic zoom: camera scale changes label density, never the graph data.
        { selector: 'node.semantic-overview', style: { 'text-opacity': 0 } },
        { selector: 'node.semantic-overview[kind = "prompt"], node.semantic-overview[kind = "model"], node.semantic-overview[kind = "answer"]',
          style: { 'text-opacity': 1, 'font-size': 12, 'font-weight': 700 } },
        { selector: 'edge.semantic-overview', style: { opacity: 0.24, width: 1 } },
        { selector: 'node.semantic-explore', style: { 'text-opacity': 0.87 } },
        { selector: 'node.semantic-detail', style: { 'text-opacity': 1, 'font-size': 12 } },
        { selector: 'edge.semantic-detail', style: { opacity: 0.74 } },
        { selector: 'node.route-node', style: { 'text-opacity': 1 } },
        { selector: 'node.focused', style: {
          'border-color': '#eafcff', 'border-width': 4, 'background-color': 'data(color)', opacity: 1, 'overlay-opacity': 0.1,
        } },
        { selector: 'edge.connected', style: { opacity: 1, width: 2.2, 'line-color': '#9acbfa', 'target-arrow-color': '#9acbfa' } },
        // Highlighted routes must remain visible even in far-away semantic zoom.
        { selector: 'edge.route-edge.semantic-overview', style: {
          opacity: 1, width: 4.2, 'line-color': '#74e4f4', 'target-arrow-color': '#74e4f4',
        } },
        { selector: 'node.focused.semantic-overview', style: { 'text-opacity': 1 } },
      ],
      layout: { name: 'preset' },
    });
    cyRef.current = cy;
    onReady(cy);
    cy.on('tap', 'node', event => selectHandler.current(event.target.id()));
    cy.on('tap', event => { if (event.target === cy) selectHandler.current(null); });
    const syncZoom = () => {
      const next = semanticZoomLevel(cy.zoom(), zoomTierRef.current);
      if (next === zoomTierRef.current) return;
      cy.batch(() => {
        cy.elements().removeClass('semantic-overview semantic-explore semantic-detail');
        cy.elements().addClass(`semantic-${next}`);
      });
      zoomTierRef.current = next;
      zoomTierHandler.current(next);
    };
    cy.on('zoom', syncZoom);
    const observer = new ResizeObserver(() => { cy.resize(); });
    observer.observe(mount.current);
    return () => {
      observer.disconnect();
      if (cyRef.current === cy) cyRef.current = null;
      onReady(null);
      cy.destroy();
    };
  }, [cyRef, onReady]);

  // Patch only changed graph elements; a selection or path highlight does not
  // recreate the engine or run force-layout. Large graphs get a bounded layout.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const desired = new Map(elements.map(element => [String(element.data.id), element]));
    const obsolete = cy.elements().filter(element => {
      const next = desired.get(element.id());
      if (!next) return true;
      if (!element.isEdge()) return false;
      return element.data('source') !== next.data.source || element.data('target') !== next.data.target;
    });
    const obsoleteIds = new Set(obsolete.map(element => element.id()));
    const additions = elements.filter(element =>
      !cy.getElementById(String(element.data.id)).length || obsoleteIds.has(String(element.data.id)));
    const topologyChanged = obsolete.length > 0 || additions.length > 0;
    cy.batch(() => {
      if (obsolete.length) cy.remove(obsolete);
      if (additions.length) cy.add(additions).addClass(`semantic-${zoomTierRef.current}`);
      for (const item of elements) {
        const element = cy.getElementById(String(item.data.id));
        if (!element.length || obsoleteIds.has(element.id())) continue;
        for (const [key, value] of Object.entries(item.data)) {
          if (element.data(key) !== value) element.data(key, value);
        }
      }
    });
    if (topologyChanged || previousLayoutKey.current !== layoutKey) {
      const initial = !hasLaidOut.current;
      const count = cy.nodes().length;
      const layout = count > 250
        ? { name: 'concentric', fit: initial, padding: 64, animate: false }
        : { name: 'cose', fit: initial, animate: false, padding: 64,
            idealEdgeLength: 130, nodeRepulsion: () => 450000, randomize: false };
      cy.layout(layout).run();
      previousLayoutKey.current = layoutKey;
      hasLaidOut.current = true;
    }
  }, [elements, layoutKey, cyRef]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass('dim focused connected route-node route-edge route-start route-end');
    if (path && path.nodeIds.length > 1) {
      cy.elements().addClass('dim');
      for (const id of path.nodeIds) {
        cy.getElementById(id).removeClass('dim').addClass('route-node');
      }
      for (const id of path.edgeIds) {
        cy.getElementById(id).removeClass('dim').addClass('route-edge');
      }
      cy.getElementById(path.nodeIds[0]!).addClass('route-start');
      cy.getElementById(path.nodeIds[path.nodeIds.length - 1]!).addClass('route-end');
    } else if (selected && cy.getElementById(selected).length) {
      const node = cy.getElementById(selected);
      const adjacent = node.closedNeighborhood();
      cy.elements().not(adjacent).addClass('dim');
      node.addClass('focused');
      node.connectedEdges().addClass('connected');
    }
  }, [selected, path, elements, cyRef, layoutKey]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !selected) return;
    const node = cy.getElementById(selected);
    if (!node.length) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;
    cy.stop();
    cy.animate({ center: { eles: node }, duration: 300 });
  }, [selected, cyRef]);

  return <div className="graph-canvas" ref={mount} role="img"
    aria-label="의심암귀 관계 그래프. 노드를 클릭하면 출처와 기록된 연결 경로를 탐색할 수 있습니다." />;
}

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>(loadWorkspace);
  const [query, setQuery] = useState('');
  const [kinds, setKinds] = useState<NodeKind[]>([...NODE_KINDS]);
  const [selected, setSelected] = useState<string | null>(null);
  const [lensDepth, setLensDepth] = useState<LensDepth>(0);
  const [clusterId, setClusterId] = useState<string | null>(null);
  const [groupMode, setGroupMode] = useState<'connected'|'trace'>('connected');
  const [diffBaseline, setDiffBaseline] = useState(0);
  const [zoomTier, setZoomTier] = useState<ZoomLevel>('explore');
  const [pathStart, setPathStart] = useState<string | null>(null);
  const [pathObservedOnly, setPathObservedOnly] = useState(false);
  const [frame, setFrame] = useState<number | null>(null);
  const [mode, setMode] = useState<'graph' | 'timeline' | 'library'>('graph');
  const [layoutKey, setLayoutKey] = useState(0);
  const [immersive, setImmersive] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteDetail, setNoteDetail] = useState('');
  const [linkTarget, setLinkTarget] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [liveOpen, setLiveOpen] = useState(false);
  const [liveUrl, setLiveUrl] = useState('http://127.0.0.1:4318');
  const [liveToken, setLiveToken] = useState('');
  const [liveSession, setLiveSession] = useState<{ url: string; token: string } | null>(null);
  const [liveState, setLiveState] = useState('연결 안 됨');
  const [providerHelpOpen, setProviderHelpOpen] = useState(false);
  const [showQuickStart, setShowQuickStart] = useState(() => {
    try { return localStorage.getItem('uisim.quickstart.dismissed.v1') !== 'yes'; }
    catch { return true; }
  });
  const dismissQuickStart = () => {
    setShowQuickStart(false);
    try { localStorage.setItem('uisim.quickstart.dismissed.v1', 'yes'); }
    catch { /* Private browsing may disable storage. Guide remains dismissible. */ }
  };
  const cyRef = useRef<Core | null>(null);
  const [graphCore, setGraphCore] = useState<Core | null>(null);
  const handleGraphReady = useCallback((engine: Core | null) => setGraphCore(engine), []);
  // Fit only when changing presentation modes, not on every live graph update.
  // A full-width immersive canvas otherwise inherits the old narrow camera.
  useEffect(() => {
    if (mode === 'library') return;
    // Wait for the grid/panel geometry to settle, then fit the actual nodes.
    // 'fit' can over-zoom a two-node neighborhood on an ultra-wide canvas.
    const raf = window.requestAnimationFrame(() => {
      const inner = window.requestAnimationFrame(() => {
        const cy = cyRef.current;
        if (!cy || cy.destroyed() || cy.nodes().length === 0) return;
        cy.stop();
        cy.resize();
        cy.fit(cy.nodes(), immersive ? 130 : 80);
        if (cy.zoom() > 1.25) {
          cy.zoom(1.25);
          cy.center(cy.nodes());
        }
      });
      second.current = inner;
    });
    const second = { current: 0 };
    return () => {
      window.cancelAnimationFrame(raf);
      window.cancelAnimationFrame(second.current);
    };
  }, [immersive, lensDepth, clusterId, mode]);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const frames = useMemo(() => timelineFrames(workspace), [workspace]);
  const currentFrame = frame === null ? frames.length : Math.min(frame, frames.length);
  const asOf = currentFrame === frames.length ? undefined : frames[Math.max(0, currentFrame - 1)];
  const searchIndex = useMemo(() => createGraphSearchIndex(workspace), [workspace]);
  const searchMatches = useMemo(() => query.trim() ? searchGraphIndex(searchIndex, query) : undefined, [searchIndex, query]);
  const filtered = useMemo(
    () => getVisibleGraph(workspace, {query, kinds, asOf}, searchMatches),
    [workspace, query, kinds, asOf, searchMatches],
  );
  const clusters = useMemo(
    () => groupMode === 'trace' ? groupByTraceId(filtered) : findConnectedClusters(filtered),
    [filtered, groupMode],
  );
  const activeCluster = useMemo(
    () => clusters.find(cluster => cluster.id === clusterId) ?? null,
    [clusters, clusterId],
  );
  const clusterGraph = useMemo(() => filterToCluster(filtered, activeCluster), [filtered, activeCluster]);
  const scoped = useMemo(
    () => pathStart ? clusterGraph : getNeighborhoodGraph(clusterGraph, selected, lensDepth),
    [clusterGraph, selected, lensDepth, pathStart],
  );
  const pathRequested = pathStart !== null && selected !== null && selected !== pathStart;
  const recordedPath = useMemo(() =>
    pathRequested ? findRecordedPath(clusterGraph, pathStart, selected, pathObservedOnly) : null,
    [clusterGraph, pathStart, selected, pathObservedOnly, pathRequested],
  );
  const viewport = useMemo(() => planGraphViewport(scoped, {
    maxNodes: 600, maxEdges: 1800,
    pinNodeIds: [pathStart, selected, ...(recordedPath?.nodeIds ?? [])].filter((id): id is string => id !== null),
    pinEdgeIds: recordedPath?.edgeIds,
  }), [scoped, pathStart, selected, recordedPath]);
  const canFocus = selected !== null && clusterGraph.nodes.some(node => node.id === selected);
  const selectedNode = useMemo(() => workspace.nodes.find(n => n.id === selected) ?? null, [workspace, selected]);
  const neighbors = useMemo(() => selected ? getNeighbors(workspace, selected) : [], [workspace, selected]);
  const counts = useMemo(() => Object.fromEntries(NODE_KINDS.map(k => [k, workspace.nodes.filter(n => n.kind === k).length])) as Record<NodeKind, number>, [workspace]);
  const providerCounts = useMemo(() => {
    const result = { OpenAI: 0, Anthropic: 0, Ollama: 0 };
    for (const node of workspace.nodes) {
      if (node.kind !== 'model') continue;
      if (node.label.startsWith('OpenAI · ')) result.OpenAI++;
      else if (node.label.startsWith('Anthropic · ')) result.Anthropic++;
      else if (node.label.startsWith('Ollama · ')) result.Ollama++;
    }
    return result;
  }, [workspace]);
  const focusProvider = (name: 'OpenAI' | 'Anthropic' | 'Ollama') => {
    setQuery(name); setSelected(null); setPathStart(null); setClusterId(null); setLensDepth(0); setFrame(null); setMode('graph');
    searchRef.current?.blur();
  };

  useEffect(() => {
    try { saveWorkspace(workspace); }
    catch { setToast('Could not save: browser storage is full or disabled. Export your graph to keep a copy.'); }
  }, [workspace]);
  useEffect(() => { if (selected && !workspace.nodes.some(n => n.id === selected)) setSelected(null); }, [selected, workspace]);
  useEffect(() => {
    if (pathStart && !workspace.nodes.some(node => node.id === pathStart)) setPathStart(null);
  }, [pathStart, workspace]);
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape' && immersive && !(event.target instanceof HTMLInputElement)) {
        setImmersive(false);
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [immersive]);
  useEffect(() => {
    if (!liveSession) return;
    let stopped = false;
    let pending = false;
    let hasSynced = false;
    let lastSnapshot: string | null = null;
    const controller = new AbortController();
    const refresh = async () => {
      if (pending || stopped) return;
      pending = true;
      try {
        const response = await fetch(new URL('/v1/workspace', liveSession.url), {
          headers: { authorization: `Bearer ${liveSession.token}` },
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status} — 수집기 연결 실패`);
        const raw = await response.text();
        if (raw.length > MAX_IMPORT_BYTES) throw new Error('수집 그래프가 2 MB를 초과했습니다.');
        if (raw !== lastSnapshot) {
          const incoming = parseImport(raw);
          if (stopped) return;
          // Capture whether THIS response is the first snapshot before React
          // schedules the state updater. Reading a mutable flag from inside
          // the updater can accidentally carry demo-only manual notes into
          // the real collector graph.
          const firstSync = !hasSynced;
          hasSynced = true;
          lastSnapshot = raw;
          setWorkspace(previous => firstSync ? incoming : mergeLiveWorkspace(previous, incoming));
        }
        if (!stopped) setLiveState('연결됨 · 2초마다 갱신');
      } catch (error) {
        if (!stopped) setLiveState(error instanceof Error ? error.message : '수집기 연결 실패');
      } finally { pending = false; }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 2000);
    return () => { stopped = true; controller.abort(); window.clearInterval(timer); };
  }, [liveSession]);
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
      setLiveSession(null); setLiveState('연결 안 됨'); setWorkspace(next); setSelected(null); setPathStart(null); setClusterId(null); setDiffBaseline(0); setLensDepth(0); setFrame(null); setQuery(''); setKinds([...NODE_KINDS]);
      flash(`Imported ${next.nodes.length} nodes.`);
    } catch (err) { flash(err instanceof Error ? err.message : 'Invalid import.'); }
    finally { event.target.value = ''; }
  };
  const reset = () => {
    if (!window.confirm('Replace this local workspace with the sample graph? Export your data first if you want to keep it.')) return;
    setLiveSession(null); setLiveState('연결 안 됨');
    setWorkspace(structuredClone(demoWorkspace)); setSelected(null); setPathStart(null); setClusterId(null); setDiffBaseline(0); setLensDepth(0); setFrame(null);
    setQuery(''); setKinds([...NODE_KINDS]); flash('Restored sample graph.');
  };
  const exportGraph = () => { downloadWorkspace(workspace); flash('Workspace exported.'); };
  const connectLive = (event: FormEvent) => {
    event.preventDefault();
    try {
      const url = new URL(liveUrl);
      if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
          url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
        throw new Error('로컬 주소(http://127.0.0.1:4318)만 연결할 수 있습니다.');
      }
      if (liveToken.length < 12) throw new Error('수집기 토큰을 입력해 주세요.');
      if (!window.confirm('현재 그래프를 수집기 데이터로 교체합니다. 필요하면 먼저 JSON으로 내보내세요. 연결할까요?')) return;
      setLiveState('연결 중...');
      setLiveSession({ url: url.origin, token: liveToken });
      setLiveToken('');
      setLiveOpen(false);
      setSelected(null);
      setPathStart(null);
      setClusterId(null);
      setDiffBaseline(0);
      setLensDepth(0);
      setFrame(null);
      setMode('graph');
      setQuery('');
      setKinds([...NODE_KINDS]);
    } catch (error) { flash(error instanceof Error ? error.message : '연결할 수 없습니다.'); }
  };
  const disconnectLive = () => { setLiveSession(null); setLiveState('연결 안 됨'); flash('실시간 동기화를 중지했습니다.'); };
  const cycleFrame = (direction: 1 | -1) => setFrame(Math.min(frames.length, Math.max(0, currentFrame + direction)));

  return <div className={`app-shell ${immersive ? 'immersive' : ''}`}>
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon"><Network size={21} strokeWidth={2.25} /></div><div><strong className="brand-name">의심암귀<span className="brand-dot">.</span></strong><small>疑心暗鬼 / EVIDENCE UNIVERSE</small></div></div>
      <div className="workspace-card"><div className="workspace-avatar">疑</div><div className="workspace-text"><strong>{workspace.name}</strong><small>{workspace.isDemo ? 'Example workspace' : 'Local workspace'}</small></div><ChevronDown size={15} className="muted" /></div>
      <div className="sidebar-section-label">탐색 공간 / WORKSPACE</div>
      <nav className="nav-list" aria-label="Views">
        <button type="button" className={`nav-item ${mode === 'graph' ? 'active' : ''}`} onClick={() => changeMode('graph')}><Network size={17} /> 관계망 탐색 <span className="nav-key">G</span></button>
        <button type="button" className={`nav-item ${mode === 'timeline' ? 'active' : ''}`} onClick={() => changeMode('timeline')}><Clock3 size={17} /> 시간 기록</button>
        <button type="button" className={`nav-item ${mode === 'library' ? 'active' : ''}`} onClick={() => changeMode('library')}><BookOpen size={17} /> 노드 라이브러리</button>
      </nav>
      <div className="section-top"><span className="sidebar-section-label">노드 유형</span><button type="button" className="tiny-link" onClick={() => setKinds(kinds.length === NODE_KINDS.length ? [] : [...NODE_KINDS])}>{kinds.length === NODE_KINDS.length ? 'Clear' : 'All'}</button></div>
      <div className="type-list">{NODE_KINDS.map(kind => <label key={kind} className="type-row"><input type="checkbox" checked={kinds.includes(kind)} onChange={() => toggleKind(kind)} /><span className="type-dot" style={{ backgroundColor: KIND_META[kind].color }} /><span>{KIND_META[kind].label}</span><small>{counts[kind]}</small></label>)}</div>
      <div className="sidebar-bottom"><div className="privacy-card"><ShieldCheck size={17} /><div><strong>로컬 우선 · 개인정보 보호</strong><p>명시적으로 연결하지 않으면 이 브라우저에만 저장됩니다.</p></div></div><a className="sidebar-link" href="https://github.com/sunwoo162/ain" target="_blank" rel="noreferrer"><GitBranch size={16} /> GitHub 오픈소스 <ArrowRight size={13} /></a></div>
    </aside>

    <div className="main-layout">
      <header className="topbar"><div className="crumbs"><span>Workspace</span><ChevronRight size={15}/><strong>{mode === 'graph' ? 'Graph explorer' : mode === 'timeline' ? 'Timeline' : 'Node library'}</strong></div><div className="header-actions"><span className="autosave"><span className="status-dot" /> Saved locally</span><span className="header-divider"/><button type="button" className="btn btn-ghost" onClick={() => setShowQuickStart(true)} title="첫 사용 가이드 열기" aria-label="시작 가이드">시작 가이드</button><button type="button" className="btn btn-ghost" onClick={() => liveSession ? disconnectLive() : setLiveOpen(true)} title={liveSession ? 'Disconnect local collector' : 'Connect local AI collector'}><Radio size={15}/>{liveSession ? 'Disconnect' : 'Live connect'}</button><button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()} title="Import a MindTrace JSON workspace"><Upload size={16}/> Import</button><button type="button" className="btn btn-ghost" onClick={exportGraph}><ArrowDownToLine size={16}/> Export</button><button type="button" className="btn btn-primary" onClick={() => setEditorOpen(true)}><Plus size={16}/> New note</button></div></header>
      <main className="content">
        <div className="page-heading"><div className="hero-copy"><div className="eyebrow"><Sparkles size={13}/> 의심암귀 · THE OBSERVATORY <span className="eyebrow-divider"/> <span>疑心暗鬼 / LOCAL-FIRST</span></div><h1>{mode === 'graph' ? <>모든 답변에는 <em>흔적이 있다.</em></> : mode === 'timeline' ? <>흔적을 따라 <em>시간 속으로.</em></> : <>노드 하나까지 <em>의심하라.</em></>}</h1><p>{mode === 'graph' ? 'AI가 남긴 관측 가능한 실행과 근거를 하나의 지식 우주에서 탐험하세요.' : mode === 'timeline' ? '기록된 실행을 되짚어 보세요. 관측된 이벤트를 숨겨진 내부 사고와 혼동하지 않습니다.' : '기록과 근거, 메모리와 모델 호출, 연결 관계까지 한곳에서 확인하세요.'}</p></div><div className="heading-meta"><div><span className="metric-label">01 / SIGNALS</span><strong>{workspace.nodes.length.toLocaleString()}</strong><small>기록된 노드</small></div><div><span className="metric-label">02 / PATHWAYS</span><strong>{workspace.edges.length.toLocaleString()}</strong><small>연결된 관계</small></div><div className="metric-status"><span className="metric-label">03 / ORIGIN</span><strong><span className="metric-live-dot"/> {liveSession ? 'LIVE' : 'LOCAL'}</strong><small>{liveSession ? 'Collector linked' : 'Private workspace'}</small></div></div></div>
        {showQuickStart && <QuickStart
          isDemo={workspace.isDemo}
          onDemo={() => {
            dismissQuickStart(); setMode('graph'); setFrame(null); setQuery('');
            setSelected(workspace.nodes[0]?.id ?? null); setClusterId(null);
            setLensDepth(0);
          }}
          onConnect={() => { dismissQuickStart(); setLiveOpen(true); }}
          onGuide={() => { dismissQuickStart(); setProviderHelpOpen(true); }}
          onDismiss={dismissQuickStart}
        />}
        <div className="provider-telemetry" aria-label="AI 제공자 실행 기록">
          <div className="provider-heading"><span className="eyebrow">CONNECTED INTELLIGENCE</span><strong>실제 AI 실행 신호</strong><small>명시적으로 관측한 호출만 표시해요.</small></div>
          <div className="provider-entries">
            {(['OpenAI', 'Anthropic', 'Ollama'] as const).map(provider => <button
              key={provider} type="button"
              className={`provider-entry ${providerCounts[provider] ? 'recorded' : ''} ${query === provider ? 'is-active' : ''}`}
              title={`${provider} 기록 ${providerCounts[provider]}건 ${providerCounts[provider] ? '· 클릭하여 검색' : ''}`}
              onClick={() => focusProvider(provider)} aria-label={`${provider} 실행 기록 ${providerCounts[provider]}건 탐색`}>
              <span className="provider-orb" aria-hidden="true"/>
              <span className="provider-identity"><strong>{provider === 'Anthropic' ? 'Claude' : provider}</strong><small>{providerCounts[provider] > 0 ? 'RECORDED' : 'NO TRACES YET'}</small></span>
              <span className="provider-count">{providerCounts[provider]}</span>
            </button>)}
            <button type="button" className="provider-guide" onClick={() => setProviderHelpOpen(true)}>
              <CircleHelp size={15}/> 연동 방법
            </button>
          </div>
        </div>
        {mode === 'graph' && <ConstellationExplorer
          clusters={clusters}
          activeId={activeCluster?.id ?? null}
          groupMode={groupMode}
          onGroupModeChange={mode => {
            setGroupMode(mode);
            setClusterId(null); setSelected(null); setPathStart(null); setLensDepth(0);
          }}
          totalNodes={filtered.nodes.length}
          onPick={id => {
            setClusterId(id);
            setSelected(null);
            setPathStart(null);
            setLensDepth(0);
            setFrame(null);
            setMode('graph');
          }}
        />}
        {mode === 'graph' && activeCluster?.traceId && <TraceInsights
          workspace={workspace}
          traceId={activeCluster.traceId}
          onSelect={id => { setSelected(id); setQuery(''); setKinds([...NODE_KINDS]); setFrame(null); }}
        />}
        <div className="canvas-toolbar"><label className="search-field"><Search size={17}/><input ref={searchRef} aria-label="노드 검색" placeholder="검색 · kind:model · evidence:observed" title="조건 검색: kind:model evidence:observed source:... trace:..." value={query} onChange={e => setQuery(e.target.value)} />{query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={14}/></button>}<kbd>Ctrl / ⌘ K</kbd></label><div className="toolbar-right"><span className="result-count">{viewport.graph.nodes.length} / {filtered.nodes.length} 노드</span>
        {mode !== 'library' && <div className="scope-switch" role="group" aria-label="관계 탐색 범위">
          <span className="scope-prefix"><Focus size={13}/> 관계 렌즈</span>
          {([0, 1, 2, 3] as const).map(depth => <button key={depth} type="button"
            aria-label={depth === 0 ? '전체 관계 표시' : `선택 노드에서 ${depth}단계 관계 표시`}
            title={depth === 0 ? '모든 노드 표시' : canFocus ? `선택한 노드에서 ${depth}단계 연결 탐색` : '먼저 노드를 선택하세요'}
            aria-pressed={lensDepth === depth}
            disabled={depth > 0 && (!canFocus || pathStart !== null)}
            className={`scope-button ${lensDepth === depth ? 'active' : ''}`}
            onClick={() => setLensDepth(depth)}>{depth === 0 ? '전체' : `${depth}단계`}</button>)}
        </div>}
        <span className="toolbar-separator"/><button type="button" aria-pressed={immersive} className={`btn btn-ghost focus-toggle ${immersive ? 'is-active' : ''}`} title={immersive ? 'Exit immersive mode (Esc)' : 'Enter immersive mode'} onClick={() => setImmersive(value => !value)}><Maximize size={15}/>{immersive ? 'Exit focus' : 'Immersive'}</button><span className="toolbar-separator"/><button type="button" className="icon-button" title="Show all node types" onClick={() => setKinds([...NODE_KINDS])}><Filter size={17}/></button><button type="button" className="icon-button" title="Rearrange graph" onClick={() => setLayoutKey(k => k + 1)}><SlidersHorizontal size={17}/></button><button type="button" className="icon-button" title="Restore sample graph" onClick={reset}><RotateCcw size={17}/></button></div></div>
        {mode === 'library' ? <div className="library-view"><div className="library-header"><span>NAME</span><span>TYPE</span><span>PROVENANCE</span><span>CREATED</span></div>{filtered.nodes.map(node => <button className={`library-row ${selected === node.id ? 'selected' : ''}`} key={node.id} onClick={() => setSelected(node.id)}><span className="library-title"><span className="type-dot" style={{ backgroundColor: KIND_META[node.kind].color }}/>{node.label}</span><span>{KIND_META[node.kind].label}</span><span className={`evidence-text evidence-${node.evidence}`}>{EVIDENCE_META[node.evidence].label}</span><span>{fmtDate(node.createdAt)}</span></button>)}{!filtered.nodes.length && <div className="empty-state">No nodes match the current filters.</div>}</div> : <>{query.trim() && <div className="advanced-search-tips" role="status">
          <span><Search size={12}/> 검색에 일치한 노드 <strong>{searchMatches?.size ?? 0}</strong>개 · 연결된 이웃은 별도로 표시</span>
          <code>kind:model</code><code>evidence:observed</code><code>trace:ID</code>
          <button type="button" onClick={() => setQuery('')}>초기화</button>
        </div>}
        <div className="graph-surface">
          <div className="cosmos-aurora" aria-hidden="true"><div className="cosmos-ring ring-one"/><div className="cosmos-ring ring-two"/><div className="cosmos-crosshair"/></div>
          <div className="surface-top"><span className="telemetry-chip"><span className="pulse-dot"/> {liveSession ? liveState : workspace.isDemo ? 'SIMULATED CONSTELLATION' : 'PRIVATE KNOWLEDGE SPACE'}</span><span className="surface-note"><MousePointer2 size={13}/> DRAG TO EXPLORE <span className="surface-marker">/</span> SCROLL TO ZOOM</span></div>
          <div className="surface-coordinates" aria-hidden="true"><span>疑 / EVIDENCE FIELD</span><span>{activeCluster ? 'SELECTED CONSTELLATION' : lensDepth === 0 || !canFocus ? 'GLOBAL CONSTELLATION' : `LOCAL LENS / ${lensDepth} HOPS`}</span></div>
          <GraphMinimap cy={graphCore} graphRevision={viewport.graph}/>
          <div className="semantic-zoom-hud" role="status" aria-label="그래프 확대 단계">
            <span className={`semantic-led ${zoomTier}`}/>
            <strong>{zoomTier === 'overview' ? '은하 조망' : zoomTier === 'detail' ? '세부 분석' : '관계 탐색'}</strong>
            <small>{zoomTier === 'overview' ? '중요 노드 중심 표시' : zoomTier === 'detail' ? '모든 노드 제목 표시' : '연결 구조 탐색'}</small>
          </div>
          {viewport.graph.nodes.length ? <GraphCanvas nodes={viewport.graph.nodes} edges={viewport.graph.edges}
            selected={selected} path={recordedPath} onSelect={setSelected} onZoomTier={setZoomTier} onReady={handleGraphReady} cyRef={cyRef} layoutKey={layoutKey}/> : <div className="empty-graph"><Network size={30}/><strong>No matching nodes</strong><span>Try a different search or node filter.</span></div>}
          {immersive && selectedNode && <div className="immersive-node-panel" aria-live="polite"><span className="inspector-caption">SELECTED SIGNAL / {KIND_META[selectedNode.kind].label.toUpperCase()}</span><strong>{selectedNode.label}</strong><span>{EVIDENCE_META[selectedNode.evidence].label} · {neighbors.length} linked nodes</span></div>}
          {(viewport.omittedNodes > 0 || viewport.omittedEdges > 0) && <div className="render-budget" role="status">
            <Layers3 size={13}/> 화면 성능 보호: {viewport.omittedNodes.toLocaleString()}개 노드 · {viewport.omittedEdges.toLocaleString()}개 연결 생략
            <span>검색하거나 관계 렌즈로 범위를 좁혀 주세요.</span>
          </div>}
          <div className="graph-controls"><button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => cyRef.current?.zoom({ level: Math.min(1.9, (cyRef.current?.zoom() ?? 1) * 1.25), renderedPosition: { x: (cyRef.current?.width() ?? 0) / 2, y: (cyRef.current?.height() ?? 0) / 2 } })}><ZoomIn size={17}/></button><button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => cyRef.current?.zoom({ level: Math.max(.25, (cyRef.current?.zoom() ?? 1) / 1.25), renderedPosition: { x: (cyRef.current?.width() ?? 0) / 2, y: (cyRef.current?.height() ?? 0) / 2 } })}><ZoomOut size={17}/></button><div className="control-divider"/><button type="button" title="Fit graph" aria-label="Fit graph" onClick={() => cyRef.current?.fit(undefined, 55)}><Maximize size={17}/></button></div>
          <div className="legend"><span className="legend-title">SIGNAL KEY</span><span><i className="legend-line"/> Observed</span><span><i className="legend-line dashed"/> Reported / inferred</span><span><i className="legend-line dotted"/> Manual</span></div>
        </div></>}
        {(mode === 'timeline' || frame !== null) && <div className="timeline-card"><div className="timeline-label"><Clock3 size={16}/> <strong>Event replay</strong><span>{frames.length ? (currentFrame === frames.length ? 'All events' : currentFrame === 0 ? 'Before first event' : fmtDate(frames[currentFrame - 1]!)) : 'No events'}</span></div><div className="timeline-controls"><button type="button" aria-label="Previous event" onClick={() => cycleFrame(-1)} disabled={currentFrame <= 0}>‹</button><input type="range" aria-label="Event position" min="0" max={frames.length} value={currentFrame} onChange={e => setFrame(Number(e.target.value))}/><button type="button" aria-label="Next event" onClick={() => cycleFrame(1)} disabled={currentFrame >= frames.length}>›</button><button type="button" className="tiny-link" onClick={() => setFrame(null)}>Latest</button></div><small>{currentFrame} / {frames.length} events</small></div>}
        {mode === 'timeline' && <TimelineDiff
          workspace={workspace}
          baseline={Math.min(diffBaseline, frames.length)}
          onBaseline={setDiffBaseline}
          targetFrame={currentFrame}
        />}
        {mode === 'timeline' && <EventChronicle
          nodes={filtered.nodes}
          selected={selected}
          isLive={liveSession !== null}
          onSelect={node => {
            setSelected(node.id);
            setClusterId(null);
            setPathStart(null);
            setLensDepth(0);
            setFrame(null);
          }}
        />}
        <div className="under-graph"><div><Activity size={15}/><span>Graph connections describe recorded relationships, not private model thoughts.</span></div><a href="https://github.com/sunwoo162/ain#evidence-model" target="_blank" rel="noreferrer">Evidence model <ArrowRight size={13}/></a></div>
      </main>
    </div>

    <aside className="inspector"><div className="inspector-header"><div><Layers3 size={17}/> 근거 상세</div><button type="button" aria-label="Clear selection" title="Clear selection" onClick={() => setSelected(null)}><X size={16}/></button></div>{selectedNode ? <div className="inspector-body"><div className="inspector-caption">선택한 노드 / SELECTED SIGNAL</div><div className="node-symbol" style={{ color: KIND_META[selectedNode.kind].color, backgroundColor: `${KIND_META[selectedNode.kind].color}1b` }}><Network size={24}/></div><h2>{selectedNode.label}</h2><div className="node-tags"><span className="tag"><span className="type-dot" style={{ backgroundColor: KIND_META[selectedNode.kind].color }}/>{KIND_META[selectedNode.kind].label}</span><span className={`tag provenance evidence-${selectedNode.evidence}`}>{EVIDENCE_META[selectedNode.evidence].label}</span></div>
        <div className="route-panel" aria-label="기록된 연결 경로 탐색">
          <div className="route-heading"><GitFork size={15}/><strong>근거 경로 추적</strong>
            {pathStart && <button type="button" className="tiny-link" onClick={() => setPathStart(null)}>초기화</button>}
          </div>
          {!pathStart ? <p>이 노드를 출발점으로 지정한 다음, 관계망에서 다른 노드를 클릭해 보세요.</p>
            : <p>출발점: <strong>{workspace.nodes.find(n => n.id === pathStart)?.label ?? pathStart}</strong></p>}
          <div className="route-actions">
            <button type="button" className="btn btn-outline" disabled={!canFocus}
              onClick={() => { setPathStart(selectedNode.id); setLensDepth(0); setMode('graph'); }}>
              <Focus size={14}/>{pathStart === selectedNode.id ? '출발점 선택됨' : '이 노드에서 시작'}
            </button>
            <label className="observed-toggle"><input type="checkbox" checked={pathObservedOnly}
              onChange={event => setPathObservedOnly(event.target.checked)}/> 관측된 관계만</label>
          </div>
          {pathStart && !pathRequested && <div className="route-hint">도착할 노드를 선택하면 최단 연결 경로를 표시합니다.</div>}
          {pathRequested && (recordedPath ? <div className="route-result">
            <span className="route-hops">{recordedPath.edgeIds.length}단계 · 실제 기록된 연결</span>
            <div className="route-steps">{recordedPath.nodeIds.map((id, index) => <button
              type="button" key={id} onClick={() => setSelected(id)}
              title={`경로 ${index + 1}번째 노드로 이동`}>{index + 1}. {workspace.nodes.find(n => n.id === id)?.label ?? id}</button>)}</div>
          </div> : <div className="route-unreachable" role="status">현재 필터와 근거 조건에서 연결된 경로가 없습니다.</div>)}
          <small>경로는 기록된 관계의 최단 탐색 결과입니다. 모델이 실제로 그 순서로 생각했다는 의미는 아닙니다.</small>
        </div>
        <div className="inspector-divider"/><div className="inspector-caption">설명 / DESCRIPTION</div><p className="node-description">{selectedNode.detail || 'No description provided.'}</p><div className="inspector-caption" style={{ marginTop: 26 }}>출처 / PROVENANCE</div><dl className="node-properties"><div><dt>Source</dt><dd>{selectedNode.source}</dd></div><div><dt>Recorded</dt><dd>{fmtDate(selectedNode.createdAt)}</dd></div><div><dt>Evidence</dt><dd>{EVIDENCE_META[selectedNode.evidence].label}</dd></div></dl><div className="provenance-info"><CircleHelp size={15}/>{EVIDENCE_META[selectedNode.evidence].help}</div><div className="inspector-divider"/><div className="connections-heading"><span>연결된 노드</span><span>{neighbors.length}</span></div><div className="connections-list">{neighbors.length ? neighbors.map(n => <button key={n.id} onClick={() => { setSelected(n.id); if (mode === 'timeline' && frame !== null) setFrame(null); }}><span className="type-dot" style={{ backgroundColor: KIND_META[n.kind].color }} /><span>{n.label}</span><ArrowRight size={13}/></button>) : <p className="muted small">No connections yet.</p>}</div><button type="button" className="btn btn-outline link-button" onClick={() => { setLinkOpen(x => !x); setLinkTarget(''); }}><Link2 size={15}/> Add manual connection</button>{linkOpen && <form className="link-form" onSubmit={addLink}><label>Connect to</label><select value={linkTarget} onChange={e => setLinkTarget(e.target.value)} required><option value="">Choose a node</option>{workspace.nodes.filter(n => n.id !== selectedNode.id).map(n => <option key={n.id} value={n.id}>{n.label}</option>)}</select><button className="btn btn-primary" type="submit">Create link</button></form>}</div> : <div className="inspector-placeholder"><GitFork size={32}/><strong>노드를 선택해 보세요</strong><p>관계망의 별을 클릭하면 출처와 근거, 연결 기록이 펼쳐집니다.</p></div>}
      <div className="inspector-footer"><span><ShieldCheck size={14}/> Provenance-aware by design</span></div>
    </aside>

    <input hidden ref={fileRef} type="file" accept="application/json,.json" onChange={importFile} />
    {providerHelpOpen && <div className="modal-backdrop" role="presentation"
      onMouseDown={event => { if (event.target === event.currentTarget) setProviderHelpOpen(false); }}>
      <div className="modal provider-help-modal" role="dialog" aria-modal="true" aria-label="AI 제공자 연결 방법">
        <div className="modal-top"><div><span className="eyebrow">LOCAL PROVIDER OBSERVERS</span><h2>AI 실행 기록 연결</h2></div>
          <button type="button" className="icon-button" aria-label="닫기" onClick={() => setProviderHelpOpen(false)}><X size={18}/></button></div>
        <p className="muted small">API 키나 질문 원문은 수집기에 저장하지 않아요. 자신의 앱에 관측 어댑터를 연결해야 실제 기록이 나타납니다.</p>
        <div className="provider-help-steps">
          <div><span>01</span><p><strong>로컬 수집기 시작</strong><code>npm run collector</code><small>먼저 환경 변수 MINDTRACE_TOKEN을 설정해 주세요.</small></p></div>
          <div><span>02</span><p><strong>웹 앱 연결</strong><code>npm run dev</code><small>Live connect에서 동일한 토큰을 입력합니다.</small></p></div>
          <div><span>03</span><p><strong>실제 AI 요청 관측</strong><code>node examples/observe-providers.mjs ollama</code><small>OpenAI / Claude를 쓰려면 해당 API 키가 필요하고 비용이 발생할 수 있어요.</small></p></div>
        </div>
        <a className="provider-doc-link" href="https://github.com/sunwoo162/ain/blob/release/v1.0.0-rc1/docs/providers.md"
          target="_blank" rel="noreferrer">전체 연동 문서 보기 <ArrowRight size={15}/></a>
        <div className="modal-actions"><button type="button" className="btn btn-primary" onClick={() => setProviderHelpOpen(false)}>확인</button></div>
      </div></div>}
    {liveOpen && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setLiveOpen(false); }}><form className="modal" onSubmit={connectLive} aria-label="로컬 AI 수집기 연결"><div className="modal-top"><div><span className="eyebrow">LOCAL EVENT COLLECTOR</span><h2>실시간 기록 연결</h2></div><button type="button" className="icon-button" aria-label="닫기" onClick={() => setLiveOpen(false)}><X size={18}/></button></div><p className="muted small">로컬 수집기의 관측된 이벤트만 불러옵니다. 모델의 숨겨진 추론은 수집하지 않습니다.</p><label htmlFor="collector-url">수집기 주소</label><input id="collector-url" type="url" value={liveUrl} onChange={e => setLiveUrl(e.target.value)} required/><label htmlFor="collector-token">수집기 토큰</label><input id="collector-token" type="password" autoComplete="off" value={liveToken} onChange={e => setLiveToken(e.target.value)} required placeholder="MINDTRACE_TOKEN"/><div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={() => setLiveOpen(false)}>취소</button><button type="submit" className="btn btn-primary"><Radio size={15}/> 연결</button></div></form></div>}
    {editorOpen && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setEditorOpen(false); }}><form className="modal" onSubmit={addNewNote} aria-label="Create a note"><div className="modal-top"><div><span className="eyebrow">PERSONAL ANNOTATION</span><h2>New note</h2></div><button type="button" className="icon-button" onClick={() => setEditorOpen(false)} aria-label="Close"><X size={18}/></button></div><label htmlFor="note-title">Title</label><input id="note-title" required maxLength={140} autoFocus placeholder="What did you discover?" value={noteTitle} onChange={e => setNoteTitle(e.target.value)} /><label htmlFor="note-detail">Details</label><textarea id="note-detail" rows={5} maxLength={10000} placeholder="Add context, observations or links..." value={noteDetail} onChange={e => setNoteDetail(e.target.value)} /><div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={() => setEditorOpen(false)}>Cancel</button><button type="submit" className="btn btn-primary"><Check size={15}/> Create note</button></div></form></div>}
    {toast && <div className="toast" role="status"><MessageCircle size={16}/><span>{toast}</span><button type="button" aria-label="Dismiss notification" onClick={() => setToast('')}><X size={14}/></button></div>}
  </div>;
}
