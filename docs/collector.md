# MindTrace v0.2 — 로컬 이벤트 수집기

MindTrace는 사용자가 **명시적으로 전달한 이벤트**만 기록합니다. ChatGPT·Claude 웹사이트의 숨겨진 추론이나 비공개 실행 기록을 읽지 않습니다.

## 실행 준비

Node.js 22.10 이상이 필요합니다. PowerShell에서:

```powershell
npm install
$env:MINDTRACE_TOKEN = node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('hex'))"
npm run collector
```

별도의 터미널을 열어 **같은 토큰**을 설정하고 예시 이벤트를 전송합니다.

```powershell
$env:MINDTRACE_TOKEN = "첫 번째 터미널에서 설정한 토큰 값"
npm run demo:trace
```

다른 터미널에서 `npm run dev`를 실행한 후 웹 화면에서 **Live connect**를 누르고, 주소 `http://127.0.0.1:4318`과 위 토큰을 입력합니다. 연결 후 약 2초 간격으로 수집된 그래프가 업데이트됩니다. 최신 기록을 다시 받고 싶다면 `npm run demo:trace`를 재실행할 수 있습니다.

토큰은 브라우저 메모리에만 보관하며 `localStorage`에 저장하지 않습니다. 단, 그래프 자체는 브라우저 로컬 저장소에 저장됩니다. 컴퓨터가 공유되는 환경에서 민감한 내용을 수집하지 마세요.

## 프로토콜

- `POST /v1/events`: `{"schemaVersion":1,"events":[...]}` 형태의 노드·엣지 이벤트 묶음(1~200개). `202` 응답
- `GET /v1/workspace`: 현재 수집된 Workspace JSON
- `Authorization: Bearer <토큰>` 필수. POST는 `Content-Type: application/json` 필수
- 수집기는 기본적으로 `127.0.0.1:4318`에만 바인딩됩니다.
- 요청 본문 상한 256 KiB, 그래프 상한 10,000 노드 / 30,000 엣지
- 수집 데이터는 `.mindtrace/collector.json`에 원자적으로 저장하고 Git에는 포함하지 않습니다.
- 노드는 같은 ID/내용의 재시도가 가능하지만, 동일 ID에 서로 다른 내용을 쓰면 오류입니다.
- 묶음의 순서와 무관하게 노드를 먼저 처리하므로 하나의 묶음 안에서 생성된 노드를 엣지가 참조할 수 있습니다.
- 브라우저 접속은 `http://localhost:5173` 또는 `http://127.0.0.1:5173`에서만 기본 허용. 커스텀 환경은 `MINDTRACE_ORIGINS`를 쉼표로 구분해 지정.

## SDK 사용 예시

```js
import { createTraceClient } from './sdk/client.mjs';
const sdk = createTraceClient({ token: process.env.MINDTRACE_TOKEN, source: 'my-agent' });
await sdk.send([
  sdk.node({ id: 'run-123:prompt', kind: 'prompt', label: '질문 접수' }),
  sdk.node({ id: 'run-123:answer', kind: 'answer', label: '요약 완료', evidence: 'reported' }),
  sdk.edge({ id: 'run-123:reply', source: 'run-123:prompt', target: 'run-123:answer', kind: 'produced' }),
]);
```

**주의:** SDK가 시스템 환경 변수, 프롬프트 원문, 모델 내부 추론을 자동으로 수집하지 않습니다. `label` 및 `detail`은 개발자가 작성한 명시적 로그이며, 필요하면 민감 정보를 직접 제거해야 합니다. `observed`는 이벤트가 기록되었다는 뜻이지 모델이 그 내용을 판단 근거로 사용했음을 입증하지 않습니다. 브라우저 Live 연결은 서버 푸시가 아니라 2초 폴링입니다.

## 환경 변수

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `MINDTRACE_TOKEN` | 없음 | 최소 12바이트의 필수 인증 토큰 |
| `MINDTRACE_PORT` | `4318` | 로컬 수집기 포트 |
| `MINDTRACE_DATA_FILE` | `.mindtrace/collector.json` | 저장 경로 |
| `MINDTRACE_ORIGINS` | Vite 기본 5173 주소 | 허용할 브라우저 Origin 목록 |

수집기와 브라우저가 동시에 실행되어 있어야 새 이벤트가 화면에 반영됩니다. 네트워크를 통한 공개 배포를 위한 서버가 아니며, LAN 접근이나 원격 수집은 지원하지 않습니다.
