import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { chromium } from 'playwright';
import { createCollector } from '../server/collector.mjs';
import { createTraceClient } from '../sdk/client.mjs';
import { createProviderObservers } from '../sdk/provider-adapters.mjs';

const model = process.env.OLLAMA_MODEL || 'qwen2.5:1.5b';
const interactive = process.argv.includes('--interactive');
if (!/^[a-zA-Z0-9_.:/-]{1,64}$/.test(model)) throw new Error('Unsafe model name.');
const tags = await fetch('http://127.0.0.1:11434/api/tags', {
  signal: AbortSignal.timeout(5_000),
}).then(response => {
  if (!response.ok) throw new Error('Local Ollama not responding');
  return response.json();
});
if (!tags.models?.some(entry => entry.name === model)) {
  throw new Error('Local Ollama does not have model ' + model);
}
const dir = resolve('.mindtrace');
await mkdir(dir, { recursive: true });
const file = resolve(dir, 'real-chat-traces.json');
const profile = resolve(dir, 'real-chat-chrome-profile');
const token = randomBytes(24).toString('hex');
const { server, getWorkspace } = await createCollector({ token, file });
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const collectorUrl = 'http://127.0.0.1:' + server.address().port;
const sdk = createTraceClient({ token, baseUrl: collectorUrl, source: 'real-ollama-multiturn' });
let traceErrors = [];
const observer = createProviderObservers({
  traceClient: sdk,
  fetcher: (url, options) => fetch(url, {
    ...options, signal: AbortSignal.timeout(120_000),
  }),
  onTraceError: message => traceErrors.push(message),
});
let context;
try {
  // A dedicated Chrome profile: the user's regular Chrome history, cookies,
  // and existing MindTrace workspace are never modified.
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chrome', headless: false,
    viewport: { width: 1440, height: 940 },
    args: ['--no-default-browser-check', '--no-first-run'],
  });
  const page = context.pages()[0] || await context.newPage();
  page.on('dialog', dialog => void dialog.accept());
  await page.goto('http://127.0.0.1:5173/', {
    waitUntil: 'domcontentloaded', timeout: 30_000,
  });
  const intro = page.getByRole('region', {
    name: '처음 사용하는 의심암귀 안내',
  });
  if (await intro.isVisible()) {
    await intro.getByRole('button', { name: /로컬 수집기 연결/ }).click();
  } else {
    await page.getByRole('button', { name: 'Live connect' }).click();
  }
  const form = page.getByRole('form', {
    name: '로컬 AI 수집기 연결',
  });
  await form.locator('#collector-url').fill(collectorUrl);
  await form.locator('#collector-token').fill(token);
  await form.getByRole('button', { name: '연결', exact: true }).click();
  await form.waitFor({ state: 'hidden', timeout: 15_000 });

  const questions = [
    "JavaScript에서 let과 const의 차이를 핵심만 한 문장으로 설명해줘.",
    "바로 앞에서 말한 재할당의 의미를 실제 JavaScript 코드 예시 하나로 보여줘.",
    "지금까지 답변을 참고해서 초보 개발자가 기억할 핵심 규칙을 한 문장으로 요약해줘.",
  ];
  const messages = [
    { role: 'system', content: [
      "너는 한국어 JavaScript 학습을 돕는 개발 멘토다.",
      "사용자가 앞에서 질문한 맥락을 이어서 대답한다.",
      "매 턴 1~3개의 짧은 문장으로 정확하게 답한다.",
      "불필요한 내부 분석 단계, 의료 주제, 존재하지 않는 기능을 언급하지 않는다."
    ].join(' ') },
  ];
  const before = getWorkspace();
  const beforeCount = { nodes: before.nodes.length, edges: before.edges.length };
  let previousAnswerId = null;
  let completed = 0;
  const asked = [];
  const input = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : null;

  console.log('REAL_CHAT_START model=' + model + ' previous_nodes=' + beforeCount.nodes);
  if (interactive) console.log('질문을 입력해. /exit 로 채팅을 끝낼 수 있어. (모델 응답 원문은 터미널에만 표시)');
  for (let i = 0; i < (interactive ? 30 : questions.length); i++) {
    const question = (interactive ? await input.question('질문> ') : questions[i]).trim();
    if (!question || question === '/exit') break;
    asked.push(question);
    const originalIds = new Set(getWorkspace().nodes.map(node => node.id));
    messages.push({ role: 'user', content: question });
    const result = await observer.ollamaChat({
      body: {
        model,
        messages,
        think: false,
        options: { temperature: 0.2, num_predict: 240 },
      },
    });
    const reply = result.message?.content?.trim();
    if (!reply || typeof reply !== 'string') {
      throw new Error('Ollama returned no chat text at turn ' + (i + 1));
    }
    messages.push({ role: 'assistant', content: reply });

    const added = getWorkspace().nodes.filter(node => !originalIds.has(node.id));
    const requestNode = added.find(node => node.kind === 'prompt');
    const answerNode = added.find(node => node.kind === 'answer');
    if (added.length !== 3 || !requestNode || !answerNode) {
      throw new Error('Missing genuine trace events at turn ' + (i + 1));
    }
    if (previousAnswerId) {
      await sdk.send([sdk.edge({
        id: 'conversation-next-' + randomUUID(),
        source: previousAnswerId, target: requestNode.id,
        kind: 'related', evidence: 'observed',
      })]);
    }
    previousAnswerId = answerNode.id;
    completed += 1;
    console.log('\n[진짜 채팅 ' + completed + (interactive ? '' : '/3') + ']');
    console.log('질문: ' + question);
    console.log('실제 Ollama 답변: ' + reply.slice(0, 800));
    console.log('관측된 호출: ' + added.map(n => n.kind).join(' → ') +
      '; 응답 토큰=' + (result.eval_count ?? '미제공'));
  }
  input?.close();
  if (traceErrors.length) throw new Error('Collector reported errors: ' + traceErrors.length);
  const workspace = getWorkspace();
  const expectedNodes = beforeCount.nodes + completed * 3;
  const expectedEdges = beforeCount.edges + (completed ? completed * 3 - 1 : 0);
  if (workspace.nodes.length !== expectedNodes ||
      workspace.edges.length !== expectedEdges) {
    throw new Error('Unexpected node/edge count after actual multi-turn calls.');
  }
  const saved = await readFile(file, 'utf8');
  if (asked.some(text => text.length > 12 && saved.includes(text)) ||
      messages.filter(m => m.role === 'assistant')
        .some(m => m.content.length > 12 && saved.includes(m.content))) {
    throw new Error('Raw chat messages were persisted in the evidence graph.');
  }
  await page.waitForFunction(expected => {
    const text = document.querySelector('.heading-meta strong')?.textContent || '';
    return Number(text.replace(/,/g,'')) === expected;
  }, workspace.nodes.length, { timeout: 20_000 });

  const visible = await page.locator('.provider-telemetry').innerText();
  if (!visible.includes('Ollama')) throw new Error('Ollama provider not visible in UI.');
  await page.screenshot({
    path: resolve(dir, 'real-chat-evidence.png'),
    fullPage: true, animations: 'disabled',
  });
  console.log('\nREAL_CHAT_OK ' + JSON.stringify({
    actualProvider: 'Ollama', model, realConversationTurns: completed,
    recordedNodesAdded: completed * 3, recordedEdgesAdded: completed ? completed * 3 - 1 : 0,
    totalNodes: workspace.nodes.length, totalEdges: workspace.edges.length,
    rawChatSaved: false,
    collector: collectorUrl, ui: 'http://127.0.0.1:5173/',
    screenshot: resolve(dir, 'real-chat-evidence.png'),
  }));
  console.log('실제 실행 그래프 창을 그대로 열어뒀어. 창을 닫으면 전용 collector도 종료돼.');
  await new Promise(resolve => {
    context.once('close', resolve);
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
} finally {
  await context?.close().catch(() => {});
  await new Promise(resolve => server.close(resolve));
}
