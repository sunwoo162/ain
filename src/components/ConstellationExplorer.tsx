import { ArrowRight, CircleDot, GitBranch, Layers3, Radar } from 'lucide-react';
import type { ConnectedCluster } from '../domain/clusters';

const prettyTime = (iso: string) => new Intl.DateTimeFormat('ko-KR', {
  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date(iso));

export function ConstellationExplorer({
  clusters, activeId, onPick, totalNodes, groupMode, onGroupModeChange,
}: {
  clusters: ConnectedCluster[];
  activeId: string | null;
  onPick: (clusterId: string | null) => void;
  totalNodes: number;
  groupMode: 'connected' | 'trace';
  onGroupModeChange: (mode: 'connected' | 'trace') => void;
}) {
  const selected = clusters.find(cluster => cluster.id === activeId) ?? null;
  return <section className="constellation-panel" aria-label="연결된 실행 묶음 탐색">
    <div className="constellation-heading">
      <div>
        <span className="eyebrow"><Radar size={13}/> CONSTELLATION NAVIGATOR</span>
        <h2>흔적을 <em>은하처럼.</em></h2>
        <p>{groupMode === 'trace'
          ? '앱에서 명시적으로 부여한 실행 ID로 묶습니다. ID가 없으면 미지정으로 표시해요.'
          : '실제로 연결된 기록을 묶습니다. 하나의 묶음이 반드시 하나의 AI 실행을 의미하지 않아요.'}</p>
      </div>
      <div className="constellation-total"><strong>{clusters.length.toLocaleString()}</strong>
        <span>연결 묶음</span></div>
    </div>
    <div className="constellation-modes" role="group" aria-label="기록 묶음 기준">
      <button type="button" aria-pressed={groupMode === 'connected'}
        onClick={() => onGroupModeChange('connected')}>연결 기준</button>
      <button type="button" aria-pressed={groupMode === 'trace'}
        onClick={() => onGroupModeChange('trace')}>실행 ID 기준</button>
      <small>{groupMode === 'trace' ? '미지정 기록은 기존 연결 묶음으로 구분됩니다.' : '기존 연결만 사용해 탐색합니다.'}</small>
    </div>
    <div className="constellation-grid">
      <button type="button" className={`constellation-card all ${selected ? '' : 'active'}`}
        aria-pressed={!selected} onClick={() => onPick(null)}>
        <span className="constellation-orb all-orb"><Radar size={21}/></span>
        <span className="constellation-card-text"><small>00 / 전체 관계망</small>
          <strong>모든 흔적 탐색</strong>
          <span>{totalNodes.toLocaleString()}개 노드 · 전체 연결 표시</span></span>
        <ArrowRight className="constellation-card-arrow" size={16}/>
      </button>
      {clusters.slice(0, 5).map((cluster, index) => <button
        key={cluster.id} type="button"
        aria-label={`연결 묶음 ${index + 1}: ${cluster.label}`}
        aria-pressed={selected?.id === cluster.id}
        className={`constellation-card ${selected?.id === cluster.id ? 'active' : ''}`}
        onClick={() => onPick(cluster.id)}>
        <span className="constellation-orb" aria-hidden="true">
          {cluster.nodeCount > 1 ? <GitBranch size={19}/> : <CircleDot size={19}/>}
        </span>
        <span className="constellation-card-text"><small>{String(index+1).padStart(2, '0')} / {cluster.traceId ? 'TRACE-ID' : 'CONNECTED GROUP'}</small>
          <strong title={cluster.label}>{cluster.label}</strong>
          <span><Layers3 size={11}/> {cluster.nodeCount} 노드 · {cluster.edgeCount} 관계</span>
          <span className="constellation-updated">{prettyTime(cluster.latestAt)}</span>
        </span>
        <ArrowRight className="constellation-card-arrow" size={16}/>
      </button>)}
    </div>
    {clusters.length > 5 && <p className="constellation-more">최근 활동 순으로 5개 묶음만 표시합니다. 검색과 유형 필터로 다른 묶음을 찾을 수 있어요. 숨긴 노드는 삭제되지 않습니다.</p>}
    {selected && <div className="constellation-active" role="status">
      <span className="constellation-signal"/><strong>집중 탐색 중</strong>
      <span>{selected.label}</span>
      <button type="button" onClick={() => onPick(null)}>전체로 돌아가기 <ArrowRight size={13}/></button>
    </div>}
    {clusters.length === 0 && <div className="constellation-empty">표시할 기록이 없습니다. 검색 또는 필터를 초기화해 보세요.</div>}
  </section>;
}
