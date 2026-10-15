import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProviderObservers, ProviderHttpError } from '../sdk/provider-adapters.mjs';
import { createTraceClient } from '../sdk/client.mjs';
import { createCollector } from '../server/collector.mjs';

const makeCollector = () => {
  const batches = [];
  return {
    batches,
    client: {
      node: node => ({ type: 'node', node }),
      edge: edge => ({ type: 'edge', edge }),
      send: async events => { batches.push(events); return { ok: true }; },
    },
  };
};
const body = { model: 'model-test', messages: [{ role: 'user', content: 'TOP_SECRET_PROMPT_24680' }] };
const jsonResponse = (result, status = 200) =>
  new Response(JSON.stringify(result), { status, headers: { 'content-type': 'application/json' } });
const flattened = batches => JSON.stringify(batches);

test('OpenAI adapter records token usage, provider tool-call requests, and no private data', async () => {
  const { batches, client } = makeCollector();
  const calls = [];
  const observers = createProviderObservers({ traceClient: client, fetcher: async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({
      id: 'SECRET_PROVIDER_RESPONSE_ID',
      model: 'gpt-demo',
      status: 'completed',
      output: [
        { type: 'message', content: [{ text: 'SECRET_AI_ANSWER_999' }] },
        { type: 'function_call', name: 'secret_tool_name', arguments: '{"secret":"SECRET_ARGUMENTS"}' },
      ],
      usage: { input_tokens: 15, output_tokens: 9 },
    });
  } });
  const response = await observers.openaiResponses({ apiKey: 'SECRET_OPENAI_API_KEY', body: {
    model: 'gpt-demo', input: 'TOP_SECRET_PROMPT_24680', stream: false,
  } });
  assert.equal(response.id, 'SECRET_PROVIDER_RESPONSE_ID');
  assert.equal(calls[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(calls[0].init.headers.authorization, 'Bearer SECRET_OPENAI_API_KEY');
  assert.match(calls[0].init.body, /TOP_SECRET_PROMPT_24680/);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].filter(e => e.type === 'node').length, 4);
  assert.ok(batches[0].some(e => e.node?.detail?.includes('입력 15 tokens')));
  assert.ok(batches[0].some(e => e.node?.evidence === 'reported' && e.node.kind === 'tool'));
  for (const secret of ['SECRET_OPENAI_API_KEY', 'TOP_SECRET_PROMPT_24680',
    'SECRET_AI_ANSWER_999', 'SECRET_PROVIDER_RESPONSE_ID', 'SECRET_ARGUMENTS', 'secret_tool_name']) {
    assert.equal(flattened(batches).includes(secret), false, 'no ' + secret);
  }
});

test('Anthropic adapter sends correct request headers and records reported tool requests', async () => {
  const { batches, client } = makeCollector();
  const observers = createProviderObservers({ traceClient: client, fetcher: async (url, init) => {
    assert.equal(url, 'https://api.anthropic.com/v1/messages');
    assert.equal(init.headers['x-api-key'], 'PRIVATE_CLAUDE_KEY');
    assert.equal(init.headers['anthropic-version'], '2023-06-01');
    return jsonResponse({
      model: 'claude-demo', stop_reason: 'tool_use',
      content: [{ type: 'tool_use', name: 'internal_lookup', input: { secret: 'private' } }],
      usage: { input_tokens: 13, output_tokens: 4 },
    });
  } });
  const result = await observers.anthropicMessages({ apiKey: 'PRIVATE_CLAUDE_KEY', body: {
    model: 'claude-demo', max_tokens: 64, messages: body.messages,
  } });
  assert.equal(result.stop_reason, 'tool_use');
  assert.ok(batches[0].some(x => x.node?.detail?.includes('입력 13 tokens')));
  assert.equal(flattened(batches).includes('PRIVATE_CLAUDE_KEY'), false);
  assert.equal(flattened(batches).includes('internal_lookup'), false);
  assert.equal(flattened(batches).includes('TOP_SECRET_PROMPT_24680'), false);
});

test('Ollama local adapter extracts nanosecond duration, usage, and tool-call count', async () => {
  const { batches, client } = makeCollector();
  const observers = createProviderObservers({ traceClient: client,
    ollamaUrl: 'http://localhost:11434/api/chat',
    fetcher: async (url, init) => {
      assert.equal(url, 'http://localhost:11434/api/chat');
      assert.equal(JSON.parse(init.body).stream, false);
      return jsonResponse({
        model: 'llama-demo', done_reason: 'stop', total_duration: 1_250_000_000,
        prompt_eval_count: 23, eval_count: 11,
        message: { content: 'PRIVATE_REPLY', tool_calls: [{ function: { name: 'secret_tool', arguments: { token: 'PRIVATE_VALUE' } } }] },
      });
    },
  });
  const response = await observers.ollamaChat({ body });
  assert.equal(response.message.content, 'PRIVATE_REPLY');
  const details = batches[0].filter(e => e.node).map(e => e.node.detail).join(' ');
  assert.match(details, /입력 23 tokens/);
  assert.match(details, /출력 11 tokens/);
  assert.match(details, /Ollama 처리 1250ms/);
  for (const secret of ['PRIVATE_REPLY', 'PRIVATE_VALUE', 'secret_tool', 'TOP_SECRET_PROMPT_24680']) {
    assert.ok(!flattened(batches).includes(secret));
  }
});

test('a provider HTTP error is preserved and trace contains only generic failure information', async () => {
  const { batches, client } = makeCollector();
  const adapter = createProviderObservers({ traceClient: client,
    fetcher: async () => jsonResponse({ error: { message: 'DONT_LOG_SECRET_TOKEN' } }, 429),
  });
  await assert.rejects(adapter.openaiResponses({ apiKey: 'private', body: { model: 'gpt-demo', input: 'secret' } }),
    error => error instanceof ProviderHttpError && error.status === 429);
  assert.equal(batches[0].filter(event => event.node?.kind === 'error').length, 1);
  assert.equal(flattened(batches).includes('DONT_LOG_SECRET_TOKEN'), false);
  assert.match(flattened(batches), /HTTP 429/);
});

test('collector failure does not replace provider response; callback receives only generic text', async () => {
  const errors = [];
  const collector = makeCollector();
  collector.client.send = async () => { throw new Error('LEAK_ME_SECRET_COLLECTOR'); };
  const adapter = createProviderObservers({ traceClient: collector.client,
    fetcher: async () => jsonResponse({ model: 'gpt-demo', usage: {} }),
    onTraceError: text => errors.push(text),
  });
  const result = await adapter.openaiResponses({ apiKey: 'SECRET', body: { model: 'gpt-demo', input: 'hello' } });
  assert.equal(result.model, 'gpt-demo');
  assert.equal(errors.length, 1);
  assert.ok(!errors[0].includes('LEAK_ME_SECRET_COLLECTOR'));
});

test('streaming or unsafe local URL is rejected before a provider network request', async () => {
  const { client } = makeCollector();
  let calls = 0;
  const fetcher = async () => { calls++; return jsonResponse({}); };
  assert.throws(() => createProviderObservers({ traceClient: client,
    ollamaUrl: 'https://evil.example/api/chat', fetcher }), /loopback/);
  assert.throws(() => createProviderObservers({ traceClient: client,
    ollamaUrl: 'http://localhost:11434/unsafe', fetcher }), /loopback/);
  const adapter = createProviderObservers({ traceClient: client, fetcher });
  await assert.rejects(adapter.ollamaChat({ body: { ...body, stream: true } }), /Streaming/);
  await assert.rejects(adapter.openaiResponses({ apiKey: '', body }), /API key/);
  assert.equal(calls, 0);
});

test('integration: a real local collector accepts provider events with valid provenance', async () => {
  const token = 'unit-test-provider-secret-00001111';
  const dir = await mkdtemp(join(tmpdir(), 'uisim-providers-'));
  const file = join(dir, 'collector.json');
  const { server, getWorkspace } = await createCollector({ token, file });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = 'http://127.0.0.1:' + server.address().port;
    const client = createTraceClient({ token, baseUrl: url, source: 'provider-test' });
    const observer = createProviderObservers({ traceClient: client,
      fetcher: async () => jsonResponse({ model: 'test-model', usage: { input_tokens: 7, output_tokens: 3 } }),
    });
    await observer.openaiResponses({ apiKey: 'SECRET', body: { model: 'test-model', input: 'PRIVATE' } });
    assert.equal(getWorkspace().nodes.length, 3);
    assert.equal(getWorkspace().edges.length, 2);
    const raw = JSON.stringify(getWorkspace());
    assert.equal(raw.includes('PRIVATE'), false);
    assert.equal(raw.includes('SECRET'), false);
    assert.match(raw, /입력 7 tokens/);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
