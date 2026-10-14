import { ArrowRight, CircleHelp, Compass, Radio, ShieldCheck, X } from 'lucide-react';

/** Compact, dismissible first-run guidance: no cloud account, no API key needed. */
export function QuickStart({isDemo,onDemo,onConnect,onGuide,onDismiss}:{
  isDemo:boolean;
  onDemo:()=>void;
  onConnect:()=>void;
  onGuide:()=>void;
  onDismiss:()=>void;
}) {
  return <section className="quickstart" aria-label="처음 사용하는 의심암귀 안내">
    <div className="quickstart-orbit" aria-hidden="true"/>
    <div className="quickstart-top">
      <span className="eyebrow"><Compass size={13}/> YOUR FIRST SIGNAL / RC1</span>
      <button type="button" className="quickstart-close" aria-label="시작 가이드 닫기"
        onClick={onDismiss}><X size={17}/></button>
    </div>
    <div className="quickstart-message">
      <h2>우주의 모든 흔적, <em>여기서 시작해.</em></h2>
      <p>{isDemo
        ? '지금 보이는 기록은 합성 데모야. 실제 AI 활동은 명시적으로 연결해야 나타나.'
        : '기존 로컬 데이터는 그대로 유지했어. 저장된 근거를 탐색하거나 새 실행을 연결해 봐.'}
      </p>
    </div>
    <div className="quickstart-actions">
      <button type="button" className="quickstart-action primary" onClick={onDemo}>
        <Compass size={17}/><span><strong>그래프 탐험하기</strong><small>예시 관계를 따라 탐색</small></span><ArrowRight size={16}/>
      </button>
      <button type="button" className="quickstart-action" onClick={onConnect}>
        <Radio size={17}/><span><strong>로컬 수집기 연결</strong><small>실제 실행 기록 가져오기</small></span><ArrowRight size={16}/>
      </button>
      <button type="button" className="quickstart-action" onClick={onGuide}>
        <CircleHelp size={17}/><span><strong>AI 연동 방법</strong><small>OpenAI · Claude · Ollama</small></span><ArrowRight size={16}/>
      </button>
    </div>
    <p className="quickstart-privacy"><ShieldCheck size={12}/>
      계정 불필요 · 로컬 우선 · 모델의 숨겨진 추론이나 원문을 자동 수집하지 않음
    </p>
  </section>;
}
