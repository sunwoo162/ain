# 의심암귀 V0.6 — 스트리밍 실행 관측과 이벤트 타임라인

OpenAI Responses / Anthropic Messages의 **SSE**, 로컬 Ollama Chat의 **NDJSON** 스트림을 읽는 동안 **원래 응답 바이트는 변경하지 않고** 사용자 프로그램에 돌려줍니다. 의심암귀 로컬 수집기에는 요청 시작, 첫 청크 수신, 스트림 완료·중단·오류의 **이벤트 시점**과 사용량만 남습니다.

## 준비

Node.js 22.10 이상. 첫 번째 터미널에서 `MINDTRACE_TOKEN`을 설정하고 `npm run collector`를 실행합니다. 두 번째 터미널에서 `npm run dev`를 실행하고 UI의 **Live connect**로 연결합니다. 세 번째 터미널에서는 동일한 토큰을 설정합니다.

실제 제공자에 과금되지 않는 모의 스트림을 보내려면:

```powershell
node examples/demo-stream.mjs
```

### OpenAI 사용 예시

```js
import { createTraceClient } from './sdk/client.mjs';
import { createStreamingObservers } from './sdk/stream-observers.mjs';

const trace = createTraceClient({ token: process.env.MINDTRACE_TOKEN, source: 'my-agent' });
const ai = createStreamingObservers({ traceClient: trace });
const { response, traceDone } = await ai.openaiResponsesStream({
  apiKey: process.env.OPENAI_API_KEY,
  body: { model: 'gpt-4.1-mini', input: '안녕', stream: true },
});
for await (const bytes of response.body) {
  // 앱에서 응답을 소비합니다. 원래 SSE 스트림 바이트가 그대로 전달됩니다.
  process.stdout.write(Buffer.from(bytes));
}
await traceDone;
```

Anthropic: `ai.anthropicMessagesStream({apiKey, body:{model,max_tokens,messages}})`.

Ollama: `ai.ollamaChatStream({body:{model,messages}})`.

**주의:** 실제 제공자 API 요청은 서비스 정책에 따라 요금이 발생할 수 있습니다. 웹사이트 안의 기존 ChatGPT/Claude 대화를 무단 읽지 않으며, 사용자가 자신의 코드에 직접 연결한 API 요청만 관측합니다.

## 저장하는 데이터

- 허용된 모델 ID와 제공자 이름, HTTP 상태
- 요청 시작 · **첫 스트림 청크** · 응답 완료/중단의 시각
- 전체 소요 시간 및 첫 청크까지 걸린 시간
- 제공자가 보고한 입력/출력 토큰 수 (없는 응답은 미표시)
- 제공자가 보고한 도구 호출 **요청** 수. 실제 도구 실행을 의미하지 않음

**저장하지 않는 데이터:** 사용자 입력, 모델의 실제 응답 텍스트, SSE/NDJSON 원문, API 키, 요청 헤더, 제공자 응답 ID, 도구 이름/인자, 숨겨진 추론. 이 데이터는 정상적인 제공자 API 호출에서는 일시적으로 전달·처리되지만 **의심암귀 수집기로 전송하지 않습니다.**

스트림은 사용자가 읽거나 취소할 때 이벤트가 완성됩니다. 즉 **응답을 소비하지 않고 방치하면 완료 기록도 생성되지 않습니다.** `response`는 표준 Fetch Response로 제공되고 `traceDone`은 수집 완료 대기를 위한 Promise입니다.

### 정확도와 한계

- "첫 청크"는 첫 바이트가 로컬 프로그램에 도착한 시점이지 반드시 첫 토큰 발생 시점이 아닙니다.
- 스트림 최종 메타데이터가 오지 않으면 토큰 사용량을 기록하지 않습니다.
- SSE 프레임은 최대 128 KiB만 임시 파싱합니다. 비정상적으로 큰 프레임은 안전하게 건너뛰며 그 안의 사용량은 놓칠 수 있습니다.
- 스트림 응답 바이트는 원형대로 전달하지만, 스트림 도중 네트워크 오류가 나면 원래 스트림도 실패합니다.
- 수집기 오류는 사용자 API 호출을 실패시키지 않고, 해당 실행 기록만 누락될 수 있습니다.
- 이벤트 타임라인은 기록된 시각을 **최신순**으로 보여주며 노드를 클릭하면 그래프의 같은 기록을 선택합니다. 최대 48개를 표시합니다.
- 원본 노드/엣지는 삭제하지 않으며 실제 모델 사고 과정이나 인과성을 보여준다는 주장을 하지 않습니다.

## 자동 검증

```bash
npm run test
npm run typecheck
npm run build
```

스트리밍 시나리오는 제공자에 **실제 요청을 보내지 않는 모의 응답**과 로컬 수집기 통합 테스트로 검증합니다. 브라우저에서의 UI 기본 기능은 별도 자동 브라우저 테스트를 통해 확인하며, 수동 UX 검증은 그와 별개입니다.

## 참고한 공식 규격

- OpenAI Responses 스트리밍: https://developers.openai.com/api/docs/guides/streaming-responses
- Anthropic Messages 스트리밍: https://platform.claude.com/docs/en/build-with-claude/streaming
- Ollama REST API: https://github.com/ollama/ollama/blob/main/docs/api.md
