import { Activity, AlertTriangle, Clock3, Database, GitBranch, ShieldCheck } from 'lucide-react';
import type { Workspace } from '../domain/graph';
import { summarizeTrace } from '../domain/insights';

const shortTime=(value:string)=>new Intl.DateTimeFormat('ko-KR',{
  hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,
}).format(new Date(value));

export function TraceInsights({workspace,traceId,onSelect}:{
  workspace:Workspace;
  traceId:string;
  onSelect:(id:string)=>void;
}) {
  const info=summarizeTrace(workspace,traceId);
  if(!info)return null;
  const metrics=[
    {label:'기록된 이벤트',value:info.nodeCount,icon:Activity},
    {label:'연결 관계',value:info.edgeCount,icon:GitBranch},
    {label:'관측됨',value:info.observed,icon:ShieldCheck},
    {label:'오류 이벤트',value:info.failures,icon:AlertTriangle},
  ];
  return <section className="trace-insights" aria-label="명시적 실행 기록 분석">
    <div className="trace-insights-head">
      <div><span className="eyebrow"><Database size={12}/> OBSERVED RUN REPORT</span>
        <h2>실행의 <em>실제 흔적</em></h2>
        <p>앱이 부여한 동일 trace ID의 기록만 모았어요.</p></div>
      <span className="trace-insights-id" title={info.traceId}>{info.traceId.slice(0,12)}…</span>
    </div>
    <div className="trace-insights-metrics">
      {metrics.map(({label,value,icon:Icon})=><div key={label} className="trace-insight-metric">
        <Icon size={15}/><strong>{value.toLocaleString()}</strong><small>{label}</small>
      </div>)}
    </div>
    <div className="trace-insights-duration">
      <Clock3 size={15}/><strong>{info.durationMs.toLocaleString()}ms</strong>
      <span>첫 기록부터 마지막 기록까지 · 모델 응답 시간은 아님</span>
    </div>
    <div className="trace-insights-events">
      {info.nodes.slice(0,12).map(node=><button type="button" key={node.id}
        onClick={()=>onSelect(node.id)} aria-label={`실행 기록 탐색: ${node.label}`}>
        <span className={`trace-event-dot ${node.evidence}`}/>
        <span><strong>{node.label}</strong><small>{shortTime(node.createdAt)} · {node.evidence}</small></span>
      </button>)}
    </div>
    {info.nodes.length>12&&<small className="trace-insights-more">가장 이른 12개 이벤트만 표시해요. 전체는 타임라인에서 탐색하세요.</small>}
    <p className="trace-insights-note">기록된 연결과 호출 시각만 보여줘요. 모델의 비공개 사고·실행하지 않은 도구 작업은 추론하지 않습니다.</p>
  </section>;
}
