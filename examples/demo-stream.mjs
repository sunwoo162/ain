import { createTraceClient } from '../sdk/client.mjs';
import { createStreamingObservers } from '../sdk/stream-observers.mjs';

const token = process.env.MINDTRACE_TOKEN;
if (!token) throw new Error('MINDTRACE_TOKEN 환경 변수를 설정하고 수집기를 먼저 실행해 주세요.');

const client = createTraceClient({ token, source: 'synthetic-stream-example' });
const observer = createStreamingObservers({
  traceClient: client,
  fetcher: async (_url, options) => {
    // Entirely synthetic; no provider or external network call.
    if (JSON.parse(options.body).stream !== true) throw new Error('Expected streaming request.');
    const events = [
      'event: response.created\ndata: {"type":"response.created","response":{"status":"in_progress"}}\n\n',
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"synthetic test output"}\n\n',
      'event: response.completed\ndata: {"type":"response.completed","response":{"usage":{"input_tokens":11,"output_tokens":5}}}\n\n',
      'data: [DONE]\n\n',
    ];
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      start(controller) {
        for (const event of events) controller.enqueue(encoder.encode(event));
        controller.close();
      },
    }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  },
});
const { response, traceDone } = await observer.openaiResponsesStream({
  apiKey: 'synthetic-example-key-not-real',
  body: { model: 'example-model', input: 'synthetic-example' },
});
await response.arrayBuffer();
await traceDone;
console.log('가상의 스트리밍 이벤트를 로컬 수집기로 전송했습니다.');
