import type { EvidenceLevel, GraphEdge, GraphNode, NodeKind, Workspace } from '../domain/graph';

const base = Date.parse('2026-10-14T08:00:00.000Z');
const at = (minute: number) => new Date(base + minute * 60000).toISOString();
const node = (id: string, kind: NodeKind, label: string, detail: string, minute: number, source: string, evidence: EvidenceLevel = 'observed'): GraphNode =>
  ({ id, kind, label, detail, createdAt: at(minute), source, evidence });
const edge = (id: string, source: string, target: string, kind: GraphEdge['kind'], minute: number, evidence: EvidenceLevel = 'observed'): GraphEdge =>
  ({ id, source, target, kind, createdAt: at(minute), evidence });

/** Explicitly synthetic data: not a trace from an actual model. */
export const demoWorkspace: Workspace = {
  schemaVersion: 1,
  id: 'mindtrace-demo',
  name: '의심암귀 · 데모 우주',
  description: '서로 다른 3개의 가상 AI 실행 시나리오로 구성된 예시 관계망입니다.',
  isDemo: true,
  nodes: [
    node('q1', 'prompt', 'API 응답이 느린 이유는?', 'A developer asked why an API endpoint has high latency.', 0, 'Demo request'),
    node('model1', 'model', '모델 실행 · 성능 분석', 'Illustrative model request. The provider did not expose internal reasoning.', 1, 'Synthetic AI runtime'),
    node('doc1', 'document', '데이터베이스 쿼리 로그', 'Example trace excerpt: repeated SELECT statements for one request.', 2, 'Synthetic document'),
    node('tool1', 'tool', 'SQL 실행 기록 분석', 'Illustrative tool event: read query counts and timings from a log sample.', 3, 'Synthetic tool'),
    node('doc2', 'document', '인덱스 사용 문서', 'An example retrieval result describing an index and query plan.', 4, 'Synthetic search'),
    node('memory1', 'memory', '과거 성능 개선 기록', 'An example memory item describing a past optimization.', 5, 'Synthetic memory'),
    node('summary1', 'reasoning-summary', '성능 근거 요약', 'Sample explanation: repeated database reads may be an important contributor. This is an authored summary, not hidden chain-of-thought.', 6, 'Illustrative summary', 'reported'),
    node('answer1', 'answer', '반복 쿼리 점검 제안', 'Suggested actions: measure query counts, inspect query plans, verify indexing, and benchmark changes.', 7, 'Synthetic AI response'),
    node('note1', 'note', '다음 실험: 기준 성능 측정', 'A manually curated example note. Validate latency before and after any changes.', 8, 'Demo annotation', 'manual'),
    // 추가 시나리오 1: 동시 인증 실패 추적 (모두 합성 이벤트)
    node('q2', 'prompt', '동시 401 오류가 발생하면?', '여러 요청이 동시에 만료된 토큰을 만나는 상황을 가정합니다.', 10, '가상 질문'),
    node('model2', 'model', '모델 실행 · 인증 흐름', '인증 오류를 재현한 가상의 모델 실행 기록입니다.', 11, '합성 AI 실행'),
    node('tool2', 'tool', '인증 요청 추적', '가상 네트워크 로그에서 요청 경로와 대기 큐를 살핍니다.', 12, '가상 분석 도구'),
    node('doc3', 'document', '401 응답 타임라인', '동시에 실패한 HTTP 요청 기록의 합성 예시입니다.', 13, '가상 로그'),
    node('doc4', 'document', '재발급 큐 설계', '실패한 요청을 재시도하는 설계 메모의 합성 예시입니다.', 14, '가상 설계 문서'),
    node('memory2', 'memory', '이전 인증 구현 기록', '직전에 비슷한 문제가 있었던 것으로 가정한 기억 노드입니다.', 15, '가상 메모리'),
    node('summary2', 'reasoning-summary', '실패 시 큐 비움 필요', '재발급 실패 후 모든 대기 요청을 종료해야 한다는 예시 설명입니다.', 16, '작성된 설명', 'reported'),
    node('answer2', 'answer', '대기 요청 일괄 reject', '실패한 갱신 요청에 매달린 Promise를 정리하도록 권고합니다.', 17, '합성 응답', 'reported'),
    // 추가 시나리오 2: 문서 기반 답변의 출처 관리
    node('q3', 'prompt', '근거 있는 답변을 만들려면?', '문서 검색 기반 AI 응답의 출처를 확인하는 가상 질문입니다.', 19, '가상 질문'),
    node('model3', 'model', '모델 실행 · 출처 검증', '합성 모델 이벤트입니다. 내부 추론을 표현하지 않습니다.', 20, '합성 AI 실행'),
    node('tool3', 'tool', '문서 검색 호출', '검색 도구를 호출해 두 개의 가상 문서를 찾습니다.', 21, '가상 검색 도구'),
    node('doc5', 'document', '기술 설계 문서', '가상의 기술 설계 문서에서 인용 후보를 가져왔습니다.', 22, '합성 검색 결과'),
    node('doc6', 'document', 'API 명세 문서', '가상의 API 명세에서 실제 지원 범위를 확인하는 예시입니다.', 23, '합성 검색 결과'),
    node('memory3', 'memory', '이전 대화 맥락', '선택적으로 조회된 가상 이전 대화 기억입니다.', 24, '가상 메모리'),
    node('summary3', 'reasoning-summary', '문서 간 주장 교차 검증', '검색된 문서 내용을 대조한 것으로 가정한 예시 설명입니다.', 25, '작성된 설명', 'reported'),
    node('answer3', 'answer', '출처와 제한 사항 명시', '확인된 근거와 미확인 항목을 구분해서 제시하는 예시 답변입니다.', 26, '합성 응답', 'reported'),
  ],
  edges: [
    edge('e1', 'q1', 'model1', 'input-to', 1),
    edge('e2', 'model1', 'tool1', 'invoked', 3),
    edge('e3', 'tool1', 'doc1', 'retrieved', 3),
    edge('e4', 'model1', 'doc2', 'retrieved', 4),
    edge('e5', 'model1', 'memory1', 'retrieved', 5),
    edge('e6', 'doc1', 'summary1', 'related', 6, 'reported'),
    edge('e7', 'doc2', 'summary1', 'related', 6, 'reported'),
    edge('e8', 'summary1', 'answer1', 'produced', 7, 'reported'),
    edge('e9', 'model1', 'answer1', 'produced', 7),
    edge('e10', 'answer1', 'note1', 'annotated', 8, 'manual'),
    edge('s1', 'q2', 'model2', 'input-to', 11),
    edge('s2', 'model2', 'tool2', 'invoked', 12),
    edge('s3', 'tool2', 'doc3', 'retrieved', 13),
    edge('s4', 'model2', 'doc4', 'retrieved', 14),
    edge('s5', 'model2', 'memory2', 'retrieved', 15),
    edge('s6', 'doc3', 'summary2', 'related', 16, 'reported'),
    edge('s7', 'doc4', 'summary2', 'related', 16, 'reported'),
    edge('s8', 'summary2', 'answer2', 'produced', 17, 'reported'),
    edge('s9', 'model2', 'answer2', 'produced', 17),
    edge('t1', 'q3', 'model3', 'input-to', 20),
    edge('t2', 'model3', 'tool3', 'invoked', 21),
    edge('t3', 'tool3', 'doc5', 'retrieved', 22),
    edge('t4', 'tool3', 'doc6', 'retrieved', 23),
    edge('t5', 'model3', 'memory3', 'retrieved', 24),
    edge('t6', 'doc5', 'summary3', 'related', 25, 'reported'),
    edge('t7', 'doc6', 'summary3', 'related', 25, 'reported'),
    edge('t8', 'summary3', 'answer3', 'produced', 26, 'reported'),
    edge('t9', 'model3', 'answer3', 'produced', 26),
  ],
};
