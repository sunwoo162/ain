# ChatGPT 웹 화면 관측 + EEEE 플러그인 준비

이 기능은 **ChatGPT가 공개적으로 표시한 답변과 인용 링크**를 사용자가 허용한 뒤 **로컬**에 기록합니다.
모델의 내부 검색 로그, 읽었지만 공개하지 않은 페이지, 숨겨진 추론 과정은 제공하지 않습니다.
또한 링크가 표시된 사실은 그 주장이 진실이라는 증거가 아닙니다.

## 1. 설치하기 (Chrome 개발자 모드, 수동 설치)

1. 저장소의 \`feat/chatgpt-evidence-extension\` 브랜치 체크아웃 후 \`npm ci\` 실행
2. \`chrome://extensions\` → **개발자 모드** 켜기 → **압축해제된 확장 프로그램 로드** → \`extension/\` 폴더 지정
3. 확장 프로그램 카드에 보이는 확장 **ID**를 복사합니다.
4. 로컬 collector 실행 전에 **정확한 확장 ID만 CORS에 추가**합니다.

Windows PowerShell 예시:

\`\`\`powershell
$env:MINDTRACE_TOKEN = node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('hex'))"
$env:MINDTRACE_ORIGINS = 'http://127.0.0.1:5173,http://localhost:5173,chrome-extension://여기에_확장_ID'
npm run collector
\`\`\`

다른 터미널에서 \`npm run dev\` 실행 → 의심암귀 상단 **Live connect**에서 URL \`http://127.0.0.1:4318\` 및 위 토큰으로 연결합니다.

5. 확장 아이콘 클릭 → **동일한 토큰** 입력 → **관측 시작**.
6. ChatGPT 웹(https://chatgpt.com/)에서 **새 답변**을 받으면 의심암귀 그래프에 답변 노드와 화면에 실제 표시된 외부 링크 노드가 추가됩니다.

- 확장을 설치하는 것만으로는 답변을 읽거나 저장하지 않습니다. 기본값 OFF.
- ON 이후 새로 나타난 답변만 감지하도록 했습니다. 새로고침, 페이지 이동, 실시간 스트리밍 등에서는 ChatGPT UI 변경에 따라 놓치거나 중복 감지할 수 있습니다.
- 3초 동안 답변 텍스트 변화가 없고 ChatGPT 중지 버튼이 없을 때 전송을 시도합니다. **모델 내부 응답 완료를 확정하는 방식은 아닙니다.**
- DOM에서 접근 가능한 \`a[href]\` 외부 링크만 추출합니다. Sources 패널만 열어야 표시되는 자료나 숨겨진 자료는 자동 추출을 보장하지 않습니다.
- 본문은 최대 3,000자, 출처는 최대 16개까지만 기록합니다. **전체 답변의 무손실 수집이 아닙니다.**
- 수집기가 꺼져 있거나 토큰/CORS가 잘못되면 저장 실패합니다. 로컬 수집기 주소/포트는 확장 코드에 고정되어 있습니다.
- **토큰은 확장 \`storage.session\`에만 저장**되어 종료 후 다시 입력해야 합니다. 로컬에서 원문을 저장하는 것은 암호화가 아니므로 민감한 채팅은 관측을 끄세요.
- 확장 프로그램이 ChatGPT 웹사이트에 주입되므로 브라우저 확장 사용·서비스 약관·조직의 보안 정책에 따라 직접 확인하고 사용해야 합니다.

## 2. 그래프의 출처 표기

- \`answer\` 노드: \`observed\` — 브라우저 DOM에 보인 텍스트를 기록함을 의미하며, AI 내부 동작을 관찰했다는 뜻이 **아님**
- \`document\` 노드: \`reported\` — ChatGPT 화면이 공개한 인용/링크
- \`cited\` 관계: \`reported\` — 화면 표시된 인용, 독립 검증 결과가 아님

**ClaimLatch 자동 사실 검증 기능은 아직 연결되지 않았습니다.** 해당 기능은 별도의 신뢰성 검증과 보안 설계가 필요합니다.

## 3. EEEE에서 플러그인으로 사용하기

\`sdk/eeee-plugin.mjs\`는 EEEE 본체나 특정 플러그인 프로토콜에 종속되지 않는 **Node.js 함수 어댑터**입니다. EEEE용 공식 플러그인 패키지나 MCP 서버가 아직 만들어진 것은 아닙니다.

\`\`\`js
import { createEeeePlugin } from './sdk/eeee-plugin.mjs';

const plugin = createEeeePlugin({
  token: process.env.MINDTRACE_TOKEN,
  baseUrl: 'http://127.0.0.1:4318',
});

console.log(plugin.describe());
const recent = await plugin.getRecentResearch({ limit: 5 });
const trace = await plugin.getExecutionTrace({ traceId: recent[0].traceId });
\`\`\`

지원하는 동작:
- \`getRecentResearch({limit})\` — 실제 기록된 답변 일부와 화면에서 공개된 출처 목록 조회
- \`getExecutionTrace({traceId})\` — 해당 trace ID로 명시적으로 기록된 노드와 관계 조회

향후 인터페이스로 설계할 \`reviewAnswer\`, \`getReviewReport\`, \`compareReviews\`는 **아직 구현되지 않았습니다**. 독립 ClaimLatch 검증과 플러그인 호스트 연결이 완성될 때까지 \`describe().notImplemented\`에 표시합니다.

보안 조건: EEEE가 사용자를 대신해서 호출하는 경우 저장된 대화의 소유권 확인/사용자별 분리/실행 권한 검사가 필요합니다. 현재 collector는 **단일 사용자 로컬 토큰 모델**이므로 원격 공유 서버로 직접 노출해서는 안 됩니다.

## 4. 현재 검증 범위

\`\`\`bash
npm run test
npm run typecheck
npm run build
\`\`\`

Node 테스트는 수집 데이터 정규화, 출처/메시지 관계, 로컬 수집기에서 EEEE 어댑터 조회를 검증합니다.
연결 PC가 오프라인인 상태에서 코드를 작성했으므로 **실제 Chrome 확장 로드 / ChatGPT DOM 호환성 / EEEE 앱 자체의 연동은 별도로 확인해야 합니다**.
