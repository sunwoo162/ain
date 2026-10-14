import { useMemo, type CSSProperties } from 'react';
import { ArrowUpRight, Clock3, Layers3, Radio } from 'lucide-react';
import type { GraphNode, NodeKind } from '../domain/graph';
import { latestTimelineNodes } from '../domain/timeline';

const COLORS: Record<NodeKind, string> = {
  prompt: '#a2a9ff', model: '#9485fa', document: '#5dc8be',
  memory: '#e4ae6d', tool: '#76abff', 'reasoning-summary': '#cc9aff',
  answer: '#71d4a4', note: '#e7bd7a', error: '#ef8a91',
};
const KIND_LABEL: Record<NodeKind, string> = {
  prompt: '요청', model: '모델', document: '문서',
  memory: '메모리', tool: '도구·청크', 'reasoning-summary': '근거 요약',
  answer: '응답', note: '내 메모', error: '실패·중단',
};
const fmtTime = (value: string) => new Intl.DateTimeFormat('ko-KR', {
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
}).format(new Date(value));
const fmtDate = (value: string) => new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric', month: 'short', day: 'numeric',
}).format(new Date(value));

export function EventChronicle({
  nodes, selected, onSelect, isLive,
}: {
  nodes: GraphNode[];
  selected: string | null;
  onSelect: (node: GraphNode) => void;
  isLive: boolean;
}) {
  const events = useMemo(() => latestTimelineNodes(nodes, 48), [nodes]);
  return <section className="chronicle" aria-label="AI 실행 이벤트 시간 흐름">
    <header className="chronicle-header">
      <div><span className="eyebrow"><Clock3 size={13}/> THE EVENT CHRONICLE</span>
        <h2>흔적의 시간</h2>
        <p>기록된 이벤트가 실제로 발생한 순서대로 이어집니다. 추론 과정의 재현은 아닙니다.</p>
      </div>
      <div className="chronicle-head-right">
        <span className={`chronicle-status ${isLive ? 'connected' : ''}`}><Radio size={12}/>
          {isLive ? '로컬 수집기 연결됨' : '로컬 기록 보기'}</span>
        <span className="chronicle-count">{nodes.length} EVENTS · LATEST {events.length}</span>
      </div>
    </header>
    {events.length ? <ol className="chronicle-list">
      {events.map((node, index) => <li key={node.id} className="chronicle-entry">
        <button type="button"
          aria-pressed={selected === node.id}
          className={`chronicle-event ${selected === node.id ? 'active' : ''}`}
          onClick={() => onSelect(node)}>
          <span className="chronicle-rail" aria-hidden="true">
            <i style={{ '--trace-color': COLORS[node.kind] } as CSSProperties}/>
          </span>
          <span className="chronicle-time"><strong>{fmtTime(node.createdAt)}</strong>
            <small>{fmtDate(node.createdAt)}</small></span>
          <span className="chronicle-event-text">
            <span className="chronicle-type" style={{ color: COLORS[node.kind] }}>
              {index === 0 && <span className="chronicle-newest"/>}{KIND_LABEL[node.kind]}
            </span>
            <strong>{node.label}</strong>
            <small>{node.detail || '추가 설명 없음'}</small>
          </span>
          <ArrowUpRight size={16} aria-hidden="true" className="chronicle-arrow"/>
        </button>
      </li>)}
    </ol> : <div className="chronicle-empty"><Layers3 size={24}/>
      <strong>표시할 이벤트가 없어요</strong><span>검색과 유형 필터를 확인하거나 로컬 수집기를 연결해 보세요.</span>
    </div>}
    {nodes.length > events.length && <p className="chronicle-limited">
      최근 {events.length}개만 표시하고 있어요. 검색 필터를 사용하면 이전 기록을 탐색할 수 있어요.
    </p>}
  </section>;
}
