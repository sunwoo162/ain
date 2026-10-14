# 의심암귀 (疑心暗鬼) — Evidence Universe

**믿기 전에, 근거를 추적하라.**

의심암귀(UISIM, 코드명 MindTrace)는 개발자가 **직접 연결한 AI API 실행 이벤트**를 로컬 그래프에 기록하고, 관계·출처·시간 흐름을 탐색하는 오픈소스 도구입니다.

> **현재 상태: V1.0.0 RC1 (정식 출시 전).** 자동화된 검증은 통과했으나 실제 AI 모델·실기기 성능 검증과 리뷰가 남아 있습니다. [RC1 릴리스 검증 문서](docs/release-rc1.md)

**지원 범위:** 사용자가 자신의 Node.js 프로그램에 연동한 OpenAI Responses, Anthropic Messages, 로컬 Ollama Chat 호출 및 수동으로 전송한 SDK 이벤트. ChatGPT·Claude 웹사이트 내부의 기존 대화나 AI 모델의 숨겨진 사고 과정은 읽을 수 없습니다.

## 1분 체험 — API 키 없이 시작하기

Node.js **22.10 이상**이 필요합니다.

```bash
git clone https://github.com/sunwoo162/ain.git
cd ain
git switch release/v1.0.0-rc1
npm install
npm run dev
```

콘솔에 표시되는 Vite 주소(`http://127.0.0.1:5173`)를 브라우저에서 엽니다. 첫 실행 안내에서 **그래프 탐험하기**를 누르면 합성 데모를 볼 수 있습니다. 이 기록은 **실제 사용자의 AI 실행 기록이 아닙니다.**

UI 데이터는 브라우저의 `localStorage`에 저장됩니다. 불러오기/내보내기를 통해 JSON으로 백업할 수 있으며, 초기화하거나 수집기에 처음 연결할 때는 먼저 **Export**로 데이터를 보관하세요.

## 실제 로컬 실행 연결

수집기는 계정이나 클라우드 서버 없이 **127.0.0.1:4318**에서 동작합니다. 기본적으로 Bearer 인증 토큰이 필요합니다.

**터미널 A — Windows PowerShell**

```powershell
$env:MINDTRACE_TOKEN = node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('hex'))"
npm run collector
```

**터미널 B — UI**

```powershell
npm run dev
```

상단 **Live connect**에서 `http://127.0.0.1:4318`과 터미널 A에서 생성한 토큰을 입력합니다. 연결 전에 로컬 그래프를 내보내는 것을 권장합니다.

**터미널 C — 합성 실행 이벤트 보내기**

```powershell
$env:MINDTRACE_TOKEN = "터미널 A에서 생성된 동일한 비밀 토큰"
npm run demo:trace
npm run demo:stream
```

`demo:trace`는 샘플 노드/엣지, `demo:stream`은 실제 제공자에 요청하지 않는 합성 스트림을 전송합니다. 실제 모델에 비용이 발생하지 않습니다. 첫 데이터 동기화 후에는 약 2초마다 새 기록을 확인합니다.

**실제 AI와 연동하려면** 자신의 앱 코드에 어댑터를 연결해야 합니다.

- [로컬 collector·Node SDK 사용법](docs/collector.md)
- [OpenAI / Claude / Ollama API 연동](docs/providers.md)
- [SSE·NDJSON 스트리밍 관측](docs/streaming.md)

실제 OpenAI·Claude API 호출에는 별도 키와 사용 요금이 필요할 수 있고, 로컬 Ollama는 프로그램과 모델이 설치되어 있어야 합니다. 제공자 실제 API 연결 E2E는 아직 릴리스 확인 항목입니다.

## 주요 기능

| 영역 | 기능 |
| --- | --- |
| 증거 그래프 | 실제로 기록된 노드/관계, 근거 출처 수준 표시, 노드 상세 패널 |
| 관계 탐색 | 1~3단계 렌즈, 실제 연결만 따라가는 경로 탐색, 몰입 보기 |
| 별자리 탐색 | 연결 요소 기준 묶음 또는 애플리케이션이 명시한 `traceId` 기준 실행 묶음 |
| 정보 밀도 | 줌 단계별 라벨/관계 강조, 현재 시야를 표시하는 미니맵 |
| 시간 기록 | 이벤트 최신순 탐색, 재생, 기록된 두 시점 사이의 추가·삭제·변경 |
| 검색 | 한글/영문 부분 검색과 `kind:`, `evidence:`, `source:`, `trace:` 조건 |
| 실행 분석 | 명시적 trace ID의 이벤트·관계·오류 수와 기록 시각 범위 |
| 로컬 데이터 | 합성 예제, JSON 내보내기/가져오기, 개인 메모·수동 연결 |
| 개발자 SDK | HTTP 루프백 collector, Node.js SDK, 3개 AI 제공자 관측 어댑터 |

기술 스택: **React 19 · TypeScript · Vite · Cytoscape · Node.js 22**.

## 검증

```bash
npm run test
npm run smoke:release
npm run typecheck
npm run build
npm run test:browser
npm run bench:graph
```

CI는 테스트·빌드·Chromium 브라우저 E2E(첫 실행, 노드 탐색, 모바일, **실제 로컬 collector 프로세스 연결**)를 실행합니다. 합성 CPU 벤치마크는 **1만 노드 / 3만 엣지**를 사용하지만, 이것만으로 운영 환경의 FPS나 메모리 성능을 보장하지 않습니다.

- [RC1 검증 체크리스트 및 남은 출시 조건](docs/release-rc1.md)
- [검색·대용량 CPU 벤치마크](docs/performance-search.md)
- [관계 경로 및 렌더링 예산](docs/recorded-paths.md)
- [명시적 trace ID와 시점 비교](docs/trace-navigation.md)
- [별자리 묶음과 시맨틱 줌](docs/constellations.md)
- [UI 디자인 시스템](docs/design-system.md)

## 관측과 추론의 구분

`observed`는 연동 코드가 이벤트/관계를 기록했다는 뜻이지 AI가 그 정보를 실제로 사고에 사용했다는 증명이 아닙니다. `reported`는 외부 제공자에 의해 보고된 사실, `inferred`는 추정, `manual`은 사용자가 작성한 메모/관계입니다.

`traceId`는 사용자가 연결한 애플리케이션의 **명시적 불투명 실행 식별자**이며, 제공자 응답 ID나 계정 ID를 자동으로 읽지 않습니다. 단순히 연결되어 있다는 이유로 같은 실행에 속한다고 추측하지 않습니다.

**보안:** 기본 수집기는 루프백에만 바인딩하고 인증 토큰/CORS Origin을 검증합니다. 프롬프트·답변 원문·API 키·숨겨진 추론을 자동으로 수집하지 않습니다. 그러나 직접 작성한 `label`, `detail`, `source`에 민감한 내용을 넣으면 저장될 수 있으므로 개발자가 직접 비식별화해야 합니다. 브라우저 `localStorage`와 수집기 JSON 파일은 **암호화 저장이 아닙니다**. 인터넷에 수집기를 공개하지 마세요.

## 배포 상태 및 기여

현재 기능은 `release/v1.0.0-rc1` 브랜치의 **Draft PR #14**에 통합되어 있으며, `main`에 정식 배포하지 않았습니다. 이전 #1~#13의 스택형 PR들은 기능별 개발 이력을 보존합니다. 테스트 통과만으로 정식 출시 완료를 선언하지 않습니다.

버그 제보, 기능 제안, 코드 리뷰는 [GitHub Issues](https://github.com/sunwoo162/ain/issues)로 남길 수 있습니다. 기여 시 Node 테스트·타입 검사·빌드 및 영향을 받는 브라우저 테스트를 실행하세요.

**License:** MIT — [LICENSE](LICENSE).
