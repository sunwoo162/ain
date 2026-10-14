import { useMemo } from 'react';
import { ArrowDown, ArrowUp, GitCompareArrows, History, Minus, Pencil } from 'lucide-react';
import type { Workspace } from '../domain/graph';
import { timelineFrames } from '../domain/graph';
import { compareTimelineFrames } from '../domain/trace-groups';

const label=(timestamp:string|null)=>timestamp?new Intl.DateTimeFormat('ko-KR',{
  month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',
}).format(new Date(timestamp)):'기록 시작 이전';

export function TimelineDiff({
  workspace,baseline,onBaseline,targetFrame,
}:{
  workspace:Workspace;
  baseline:number;
  onBaseline:(frame:number)=>void;
  targetFrame:number;
}) {
  const frames=useMemo(()=>timelineFrames(workspace),[workspace]);
  const result=useMemo(()=>compareTimelineFrames(workspace,baseline,targetFrame),
    [workspace,baseline,targetFrame]);
  const changes=[
    {label:'새 노드',icon:ArrowUp,n:result.addedNodes.length,kind:'positive'},
    {label:'사라진 노드',icon:ArrowDown,n:result.removedNodes.length,kind:'negative'},
    {label:'수정된 노드',icon:Pencil,n:result.changedNodes.length,kind:'neutral'},
    {label:'새 관계',icon:ArrowUp,n:result.addedEdges.length,kind:'positive'},
    {label:'사라진 관계',icon:ArrowDown,n:result.removedEdges.length,kind:'negative'},
    {label:'수정된 관계',icon:Pencil,n:result.changedEdges.length,kind:'neutral'},
  ];
  const any=changes.some(change=>change.n>0);
  return <section className="timeline-diff" aria-label="그래프 두 시점 비교">
    <div className="diff-heading"><div>
      <span className="eyebrow"><History size={13}/> TEMPORAL DIFFERENCE</span>
      <h2>시간 사이의 <em>변화</em></h2>
      <p>동일한 워크스페이스의 두 시점에 실제로 기록돼 있던 노드와 관계를 비교해요.</p>
    </div><GitCompareArrows size={24}/></div>
    <div className="diff-range">
      <label htmlFor="compare-baseline">기준 시점 <strong>{label(result.baseline)}</strong></label>
      <input id="compare-baseline" type="range" min={0} max={frames.length}
        step={1} value={baseline} onChange={e=>onBaseline(Number(e.target.value))}/>
      <div className="diff-arrow"><span>BASELINE</span><Minus size={16}/><span>TARGET</span></div>
      <div className="diff-target">비교 대상 <strong>{label(result.target)} {targetFrame===frames.length?'· 최신':''}</strong></div>
    </div>
    <div className="diff-stat-grid">
      {changes.map(change=><div key={change.label} className={`diff-stat ${change.kind}`}>
        <change.icon size={14}/><strong>{change.n.toLocaleString()}</strong><span>{change.label}</span>
      </div>)}
    </div>
    <p className="diff-disclaimer" role="status">{any
      ? '변경 내역은 저장된 실제 ID와 속성을 비교한 결과예요. 숨겨진 AI 사고나 누락된 실행은 추측하지 않아요.'
      : '두 시점 사이에 확인된 그래프 변경 사항이 없습니다.'}
    </p>
  </section>;
}
