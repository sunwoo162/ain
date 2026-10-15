# ChatGPT 웹 화면 관측 + EEEE 플러그인 준비

이 기능은 ChatGPT **웹 화면에 공개된 답변과 외부 링크**만, 사용자가 명시적으로 켠 뒤 **로컬**에 기록합니다. 내부 검색 로그·비공개 출처·숨겨진 추론은 수집할 수 없습니다. 인용된 링크가 곧 정답의 증거는 아닙니다.

## 설치 및 시작 (Windows PowerShell)

1. 먼저 `chrome://extensions` → **개발자 모드** → **압축해제된 확장 프로그램 로드**를 선택하고 이 저장소의 `extension` 폴더를 지정합니다.
2. 확장 프로그램 카드의 **ID**를 복사합니다. 업데이트가 있으면 확장 프로그램 카드에서 새로고침합니다.
3. 터미널 A를 열어 아래 명령을 실행합니다.

```powershell
cd "$HOME\Documents\uisim-rc1"
$env:MINDTRACE_TOKEN = node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('hex'))"
$env:MINDTRACE_PORT = "4319"
$extensionId = Read-Host "Chrome 확장 프로그램 ID"
$env:MINDTRACE_ORIGINS = "http://127.0.0.1:5173,http://localhost:5173,chrome-extension://$extensionId"
Write-Host "연결 토큰: $env:MINDTRACE_TOKEN"
npm run collector
```

기존 프로그램이 `4318`을 사용하고 있어 **확장 기본 포트는 4319**로 설정했습니다. 필요하면 사용자 PC 환경에 따라 빈 포트를 선택하고, 확장 프로그램 팝업 포트와 반드시 동일하게 맞춥니다.

4. 터미널 B에서 다음을 실행합니다.

```powershell
cd "$HOME\Documents\uisim-rc1"
npm run dev
```

5. [의심암귀 웹](http://127.0.0.1:5173) **Live connect**에서 URL `http://127.0.0.1:4319`, 터미널 A에 출력된 토큰을 넣습니다.
6. Chrome의 **의심암귀 확장 아이콘** 클릭 → 수집기 포트 `4319`, 동일한 토큰 입력 → **관측 시작**.
7. ChatGPT 웹에서 **새 답변**을 받으면 답변과 웹 화면에 표시된 외부 링크가 실행 그래프에 나타나도록 구성했습니다.

## 관측 범위와 보안

- 확장은 **기본 OFF**이며, 사용자가 켜기 전의 이전 채팅은 소급 수집하지 않도록 설계했습니다.
- ChatGPT 페이지가 바뀌거나 스크롤·갱신·페이지 이동·스트리밍 상태가 달라지면 일부 데이터를 놓치거나 중복 기록할 수 있습니다.
- 메시지 DOM에서 보이는 `a[href]` 외부 링크를 추출합니다. Sources 패널 뒤에 있는 자료나 내부 검색 내역을 모두 수집하지는 못합니다.
- 본문 **최대 3,000자**, 공개 외부 링크 **최대 16개**만 기록합니다. 원문 전체를 무손실로 저장하는 기능은 아닙니다.
- 토큰은 Chrome `storage.session`에만 두고, 재시작 후 다시 입력하도록 했습니다. 로컬 collector가 저장한 JSON은 **암호화 저장이 아닙니다**. 민감한 대화는 관측을 끄세요.
- 원문은 사용자 허가를 받아 수집합니다. 로컬 collector는 루프백 주소에만 바인딩되며, 허용된 확장 ID의 Origin과 Bearer 토큰을 요구합니다.
- 출처 URL의 쿼리 파라미터·해시를 제거해 저장합니다. 이로 인해 특정 페이지 내 위치나 일부 URL은 정확히 복원되지 않을 수 있습니다.
- 3초 동안 텍스트가 바뀌지 않고 화면에 중지 버튼이 없을 때 수집을 시도하며, 모델의 실제 내부 완료 이벤트를 의미하지는 않습니다.

## 그래프 출처 표기

- `answer` 노드의 `observed`: **브라우저 화면에서 읽은 문자열**. 모델의 내부 추론 관측이 아닙니다.
- `document` 노드의 `reported`: **ChatGPT가 웹 화면에 표시한 외부 링크**.
- `cited` 관계의 `reported`: **화면에 나타난 답변의 출처 링크**. 근거의 타당성이 독립 검증되었다는 의미는 아닙니다.

**ClaimLatch 자동 사실 검증은 아직 연동되지 않았습니다.**

## EEEE가 추후 호출하는 방법

`sdk/eeee-plugin.mjs`는 **Node.js 함수 어댑터**입니다. EEEE 전용 정식 플러그인 또는 MCP 서버로 등록된 상태는 아닙니다.

```js
import { createEeeePlugin } from './sdk/eeee-plugin.mjs';

const plugin = createEeeePlugin({
  baseUrl: 'http://127.0.0.1:4319',
  token: process.env.MINDTRACE_TOKEN,
});
const recent = await plugin.getRecentResearch({ limit: 5 });
const trace = await plugin.getExecutionTrace({ traceId: recent[0].traceId });
```

- `getRecentResearch({limit})`: 수집된 답변 요약과 공개 출처 목록 조회.
- `getExecutionTrace({traceId})`: 명시적 trace ID에 속하는 관측 노드/관계 조회.
- `reviewAnswer`, `getReviewReport`, `compareReviews`: **현재 미구현**. 추후 검증 엔진 통합 과제.

단일 사용자 로컬 토큰 기반으로 구현되어 있으므로 멀티유저 서비스·원격 서버에는 그대로 공개하지 마세요.

## 검증 상태

```bash
npm run test
npm run typecheck
npm run build
npx playwright test tests/browser/extension.spec.ts
```

GitHub CI 전체 테스트는 통과했으며, 연결 PC에서 Chromium으로 **확장 ON → 합성 ChatGPT 형태 DOM → 실제 인증 로컬 collector → 그래프 저장 → OFF 후 차단**을 재검증했습니다.

**실제 ChatGPT 웹사이트에 설치한 상태의 화면 호환성은 아직 검증하지 않았습니다.** 이 기능은 해당 웹 UI 구조 변경으로 영향을 받을 수 있습니다.
