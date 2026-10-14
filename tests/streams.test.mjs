import test from 'node:test';
import assert from 'node:assert/strict';
import { createStreamingObservers, createStreamMetadataParser } from '../sdk/stream-observers.mjs';
import { createTraceClient } from '../sdk/client.mjs';
import { createCollector } from '../server/collector.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const encoder = new TextEncoder();
const response = (parts, code = 200) => new Response(new ReadableStream({
  start(controller) {
    for (const part of parts) controller.enqueue(encoder.encode(part));
    controller.close();
  },
}), { status: code, headers: { 'content-type': 'text/event-stream' } });

function client() {
  const batches = [];
  return {
    batches,
    sdk: {
      node: params => ({ type: 'node', node: params }),
      edge: params => ({ type: 'edge', edge: params }),
      send: async events => { batches.push(events); return { ok: true }; },
    },
  };
}
const all = batches => JSON.stringify(batches.flat());

test('OpenAI streaming transparently passes raw SSE and records only safe counts', async () => {
  const { batches, sdk } = client();
  const payload = [
    'event: response.output_item.added\ndata: {"type":"response.output_item.added","item":{"type":"function_call","name":"PRIVATE_TOOL"}}\n\n',
    'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"SECRET_MODEL_ANSWER"}\n\n',
    'event: response.completed\ndata: {"type":"response.completed","response":{"id":"SECRET_RESPONSE_ID","usage":{"input_tokens":31,"output_tokens":14}}}\n\n',
  ].join('');
  const expected = encoder.encode(payload);
  let calls = 0;
  const observer = createStreamingObservers({ traceClient: sdk, fetcher: async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(init.headers.authorization, 'Bearer SECRET_API_KEY');
    assert.equal(JSON.parse(init.body).stream, true);
    assert.match(init.body, /SECRET_PROMPT/);
    return response([payload.slice(0, 19), payload.slice(19, 137), payload.slice(137)]);
  } });
  const { response: result, traceDone } = await observer.openaiResponsesStream({
    apiKey: 'SECRET_API_KEY', body: { model: 'gpt-stream-demo', input: 'SECRET_PROMPT' },
  });
  const body = new Uint8Array(await result.arrayBuffer());
  assert.deepEqual(body, expected);
  await traceDone;
  assert.equal(calls, 1);
  assert.equal(batches.length, 3); // request, first chunk, finish
  assert.match(all(batches), /입력 31 tokens/);
  assert.match(all(batches), /출력 14 tokens/);
  assert.match(all(batches), /도구 호출 요청 1건/);
  assert.equal(batches.flat().filter(x => x.node).length, 4);
  for (const secret of ['SECRET_API_KEY','SECRET_PROMPT','SECRET_MODEL_ANSWER','SECRET_RESPONSE_ID','PRIVATE_TOOL']) {
    assert.equal(all(batches).includes(secret), false, secret + ' leaked to collector');
  }
});

test('Anthropic SSE usage is cumulative and content/delta is not stored', async () => {
  const { batches, sdk } = client();
  const stream = [
    'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":120},"content":[]}}\n\n',
    'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","name":"SECRET_TOOL"}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"thinking":"PRIVATE_THINKING"}}\n\n',
    'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":6}}\n\n',
    'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":12}}\n\n',
    'event: message_stop\ndata: {"type":"message_stop"}\n\n',
  ].join('');
  const obs = createStreamingObservers({ traceClient: sdk, fetcher: async (url, init) => {
    assert.equal(url, 'https://api.anthropic.com/v1/messages');
    assert.equal(init.headers['x-api-key'], 'PRIVATE_KEY');
    assert.equal(init.headers['anthropic-version'], '2023-06-01');
    return response([stream]);
  } });
  const { response: streamRes, traceDone } = await obs.anthropicMessagesStream({
    apiKey: 'PRIVATE_KEY', body: { model: 'claude-test', max_tokens: 64, messages: [{role:'user',content:'secret'}] },
  });
  assert.equal(await streamRes.text(), stream);
  await traceDone;
  const log = all(batches);
  assert.match(log, /입력 120 tokens/);
  assert.match(log, /출력 12 tokens/);
  assert.match(log, /도구 호출 요청 1건/);
  for (const secret of ['PRIVATE_THINKING','PRIVATE_KEY','SECRET_TOOL']) assert.ok(!log.includes(secret));
});

test('Ollama NDJSON streams preserve bytes and record only final usage numbers', async () => {
  const { batches, sdk } = client();
  const raw = [
    '{"message":{"content":"PRIVATE_FIRST"},"done":false}\n',
    '{"message":{"content":"PRIVATE_SECOND"},"done":false}\n',
    '{"done":true,"prompt_eval_count":8,"eval_count":22,"total_duration":1230000000}\n',
  ].join('');
  const obs = createStreamingObservers({ traceClient: sdk, fetcher: async (url, init) => {
    assert.equal(url, 'http://127.0.0.1:11434/api/chat');
    assert.equal(JSON.parse(init.body).stream, true);
    return response([raw]);
  } });
  const { response: streamed, traceDone } = await obs.ollamaChatStream({
    body: { model: 'llama3.2', messages: [{role:'user',content:'PRIVATE_INPUT'}] },
  });
  assert.equal(await streamed.text(), raw);
  await traceDone;
  assert.match(all(batches), /입력 8 tokens/);
  assert.match(all(batches), /출력 22 tokens/);
  assert.ok(!all(batches).includes('PRIVATE_FIRST'));
  assert.ok(!all(batches).includes('PRIVATE_INPUT'));
});

test('malformed and oversized SSE frames are ignored without parsing secrets', () => {
  const parser = createStreamMetadataParser('openai');
  parser.push(encoder.encode('data: not JSON\n\ndata: ' + 'PRIVATE_DATA'.repeat(16000) + '\n\n'));
  parser.push(encoder.encode('data: {"type":"response.completed","response":{"usage":{"input_tokens":5,"output_tokens":3}}}\n\n'));
  const result = parser.finish();
  assert.equal(result.input, 5);
  assert.equal(result.output, 3);
});

test('HTTP failure records generic error and propagates provider status, never raw body', async () => {
  const { batches, sdk } = client();
  const obs = createStreamingObservers({ traceClient: sdk, fetcher: async () =>
    new Response('SECRET_PROVIDER_FAILURE', {status:429}) });
  await assert.rejects(obs.openaiResponsesStream({ apiKey:'SECRET',body:{model:'gpt-demo',input:'PRIVATE'}}),
    err => err.status === 429);
  await new Promise(resolve => setImmediate(resolve));
  const log = all(batches);
  assert.match(log, /HTTP 429/);
  assert.ok(!log.includes('SECRET_PROVIDER_FAILURE'));
});

test('cancelling stream reports incomplete trace and does not fabricate a completed answer', async () => {
  const { batches, sdk } = client();
  const obs = createStreamingObservers({ traceClient: sdk, fetcher: async () =>
    response(['data: {"type":"response.output_text.delta","delta":"SECRET"}\n\n']) });
  const { response: stream, traceDone } = await obs.openaiResponsesStream({
    apiKey:'key', body:{ model:'gpt-demo', input:'private' },
  });
  const reader = stream.body.getReader();
  await reader.read();
  await reader.cancel();
  await traceDone;
  assert.ok(batches.flat().some(x=>x.node?.kind==='error'));
  assert.ok(!batches.flat().some(x=>x.node?.label?.endsWith('스트림 완료')));
});

test('invalid non-loopback Ollama URL and stream:false are rejected without request', async () => {
  const { sdk } = client();
  let called=0;
  const fetcher=async () => { called++; return response(['{}\n']); };
  assert.throws(() => createStreamingObservers({traceClient:sdk,ollamaUrl:'http://evil.local/api/chat',fetcher}), /loopback/);
  const obs=createStreamingObservers({traceClient:sdk,fetcher});
  await assert.rejects(obs.ollamaChatStream({body:{model:'llama3.2',stream:false}}), /non-streaming/);
  assert.equal(called,0);
});

test('collector integration persists first-byte and finished events without user messages', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'uisim-stream-'));
  const file = join(temp, 'trace.json');
  const token = 'stream-local-private-token-001';
  const { server, getWorkspace } = await createCollector({ token, file });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  try {
    const sdk=createTraceClient({token,baseUrl:'http://127.0.0.1:'+server.address().port,source:'stream-test'});
    const obs=createStreamingObservers({traceClient:sdk,fetcher:async () => response([
      'data: {"type":"response.completed","response":{"usage":{"input_tokens":10,"output_tokens":5},"output":[{"content":[{"text":"SECRET_REPLY"}]}]}}\n\n',
    ])});
    const {response:res,traceDone}=await obs.openaiResponsesStream({
      apiKey:'SECRET_KEY',body:{model:'test-model',input:'SECRET_PROMPT'},
    });
    await res.text();
    await traceDone;
    const ws=getWorkspace();
    assert.equal(ws.nodes.length,4);
    assert.equal(ws.edges.length,3);
    const raw=JSON.stringify(ws);
    for (const secret of ['SECRET_REPLY','SECRET_PROMPT','SECRET_KEY']) assert.ok(!raw.includes(secret));
    assert.match(raw,/첫 스트림 청크/);
    assert.match(raw,/입력 10 tokens/);
  } finally {
    await new Promise(resolve=>server.close(resolve));
    await rm(temp,{recursive:true,force:true});
  }
});
