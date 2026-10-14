# 의심암귀 V0.5 — OpenAI·Claude·Ollama 메타데이터 어댑터

이 어댑터는 **사용자가 직접 연결한 자신의 AI API 호출**만 기록합니다. ChatGPT·Claude 웹사이트의 과거 대화, 숨겨진 추론, 도구 내부 실행에 접근하지 않습니다.

## 어떤 정보를 저장하나요?

| 정보 | 저장 여부 |
| --- | --- |
| 제공자 이름, 허용된 모델 ID | 저장 |
| HTTP 상태 코드, 소요 시간 | 저장 |
| 응답에 있는 입출력 토큰 수 | 저장 |
| 응답에 명시된 도구 호출 *요청* 건수 | 저장 (실제 실행 여부 확인 불가) |
| API 키 / 요청 헤더 | **저장하지 않음** |
| 사용자의 프롬프트 및 시스템 지침 | **저장하지 않음** |
| 답변 텍스트, 도구 이름·인자·결과 | **저장하지 않음** |
| 제공자 응답 ID 또는 호출 식별자 | **저장하지 않음** |
| 추론 토큰의 내용·숨겨진 사고 과정 | **접근하지 않음** |

*요청/응답 내용은 정상적인 API 호출을 위해 제공자에게 전달됩니다. 오직 로컬 의심암귀 수집기에 원문을 **복제하지 않는다**는 의미입니다.*

아래 기능은 수집기에 **요청 기록·모델 호출·응답 또는 에러·제공자가 보고한 도구 호출 요청**을 노드로 저장합니다. `observed`는 HTTP 응답 수신 사실이며, `reported`는 제공자가 도구 호출을 요청했다고 반환한 정보입니다. **실제로 도구를 실행했다거나 모델의 비공개 사고 흐름을 확인했다는 뜻이 아닙니다.**

## 사용법

Node.js **22.10 이상**, 로컬 실행 기준.

1. 첫 번째 PowerShell 터미널: 토큰 설정 및 수집기 실행
   ```powershell
   $env:MINDTRACE_TOKEN = node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('hex'))"
   npm run collector
   ```
2. 두 번째 터미널: 브라우저 실행
   ```powershell
   npm run dev
   ```
3. 의심암귀의 **Live connect**에서 `http://127.0.0.1:4318`과 첫 번째 터미널의 동일한 `MINDTRACE_TOKEN`을 입력
4. 세 번째 터미널: 동일한 수집기 토큰을 환경 변수로 설정하고, 아래에서 원하는 제공자를 선택

   ```powershell
   # OpenAI (실제 API 호출·요금 발생 가능)
   $env:OPENAI_API_KEY = "사용자가 직접 설정한 API 키"
   node examples/observe-providers.mjs openai

   # Claude / Anthropic (실제 API 호출·요금 발생 가능)
   $env:ANTHROPIC_API_KEY = "사용자가 직접 설정한 API 키"
   node examples/observe-providers.mjs anthropic

   # Ollama (해당 로컬 모델이 설치되어 있어야 함)
   $env:OLLAMA_MODEL = "llama3.2"
   node examples/observe-providers.mjs ollama
   ```

**주의:** 실제 키를 코드나 명령 기록에 복사하지 않는 운영이 안전합니다. 가능하다면 OS 자격 증명 저장소 또는 현재 세션의 비밀 변수로 주입하세요. 예제는 제공자가 실제로 요청에 응답해야 완료되며, API 사용 요금이 발생할 수 있습니다. 이 개발 단계에서는 **실제 API를 호출하여 확인하지 않고 모의 응답/수집기 통합 테스트를 수행했습니다.**

## 자기 에이전트에 통합

```js
import { createTraceClient } from './sdk/client.mjs';
import { createProviderObservers } from './sdk/provider-adapters.mjs';

const traceClient = createTraceClient({
  token: process.env.MINDTRACE_TOKEN,
  source: 'my-agent',
});
const ai = createProviderObservers({
  traceClient,
  onTraceError: message => console.warn(message),
});

const response = await ai.openaiResponses({
  apiKey: process.env.OPENAI_API_KEY,
  body: { model: 'gpt-4.1-mini', input: '안녕하세요. 한 문장으로 인사해 주세요.' },
});

// OpenAI의 정상 JSON 응답은 그대로 반환됩니다.
// 응답 텍스트와 입력 원문은 의심암귀로 저장되지 않습니다.
```

다른 제공자의 메서드:
- `ai.anthropicMessages({apiKey, body:{model, max_tokens, messages}})`
- `ai.ollamaChat({body:{model, messages}})`

## 제한 사항

- **비스트리밍 JSON 호출만** 지원: `stream:true`는 호출 전에 거부. SSE·NDJSON 처리 또는 구독 기능 없음.
- OpenAI: **Responses API** (`POST /v1/responses`)만 지원. Chat Completions는 아직 미지원.
- Anthropic: **Messages API** (`POST /v1/messages`)만 지원.
- Ollama: **로컬 Chat API** (`POST /api/chat`)만 지원. 루프백 주소만 허용.
- AI 제공자에게 전달되는 요청은 단순한 JSON 요청으로 작성되며, SDK 내부 재시도·자동 도구 실행·실행 시간 시각화 외의 tracing 기능은 없음.
- 브라우저에서 웹사이트의 모든 AI 활동이 자동으로 보이는 것은 아닙니다. 이 어댑터를 사용하도록 **직접 수정한 프로그램의 호출만** 기록됩니다.
- 저장 파일은 암호화되지 않습니다. 프롬프트 본문은 기본 기록되지 않지만, 모델명·시간·사용량도 민감할 수 있습니다. 공유 PC에서는 주의하세요.
- 사용자가 호출 종료 후 수집기 응답을 받지 못해도 **실제 AI API 응답은 그대로 반환**합니다. 따라서 네트워크/수집기 오류가 나면 기록 일부가 유실될 수 있습니다.
- HTTP 오류는 상태 코드만 기록하고 제공자 오류 응답 메시지/본문은 저장하지 않습니다.

## 출처

각 제공자에 대한 **공식 API 규격**을 확인한 후 구현했습니다. 응답 필드는 버전에 따라 달라질 수 있습니다.

- OpenAI Responses API: https://developers.openai.com/api/reference/resources/responses/methods/create
- Anthropic Messages API: https://platform.claude.com/docs/en/api/messages/create
- Ollama Chat API: https://github.com/ollama/ollama/blob/main/docs/api.md
- Ollama usage metrics: https://github.com/ollama/ollama/blob/main/docs/api/usage.mdx

## 검증

```bash
npm run test
npm run typecheck
npm run build
```

`tests/providers.test.mjs`는 OpenAI·Anthropic·Ollama 응답 모의 처리, 비밀 데이터 미전송, provider 오류, 수집기 다운 시 fail-open, 스트리밍 차단, 실제 로컬 수집기 연동을 확인합니다. 브라우저 실제 시각 품질과 실키 API 연동 테스트는 별도로 수행해야 합니다.
