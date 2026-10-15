import { test, expect, chromium } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

// Synthetic ChatGPT-shaped DOM: validates the entire extension -> collector path
// without claiming compatibility with the current live ChatGPT site.
test('extension: opt-in DOM evidence reaches authenticated loopback collector', async () => {
  test.setTimeout(85_000);
  const dir = await mkdtemp(join(tmpdir(), 'uisim-extension-e2e-'));
  const userDataDir = join(dir, 'profile');
  const collectorFile = join(dir, 'events.json');
  const extensionPath = resolve('extension');
  const token = randomBytes(24).toString('hex');
  const port = 4318; // Manifest V3 host permission intentionally limits the collector to this port.
  let context;
  let collector;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: true,
      args: [
        '--disable-extensions-except=' + extensionPath,
        '--load-extension=' + extensionPath,
      ],
    });
    const worker = context.serviceWorkers()[0] ||
      await context.waitForEvent('serviceworker', { timeout: 15000 });
    const extensionId = new URL(worker.url()).host;
    expect(extensionId.length).toBeGreaterThan(15);

    collector = spawn(process.execPath,
      ['--disable-warning=ExperimentalWarning', '--experimental-strip-types', 'server/collector.mjs'], {
        cwd: process.cwd(),
        stdio: 'ignore',
        env: {
          ...process.env,
          MINDTRACE_TOKEN: token, MINDTRACE_PORT: String(port),
          MINDTRACE_DATA_FILE: collectorFile,
          MINDTRACE_ORIGINS: 'chrome-extension://' + extensionId,
        },
      });
    await expect.poll(async () => {
      try {
        const res = await fetch('http://127.0.0.1:' + port + '/v1/workspace', {
          headers: { authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(1000),
        });
        return res.status;
      } catch { return 0; }
    }, { timeout: 15000 }).toBe(200);

    const page = await context.newPage();
    await page.route('https://chatgpt.com/**', route => route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html><body><main id="chat"><div data-message-author-role="user">PRIVATE_USER_PROMPT_SHOULD_NOT_BE_CAPTURED</div></main></body></html>',
    }));
    await page.goto('https://chatgpt.com/c/extension-test');
    await expect(page.locator('#chat')).toBeVisible();

    // An existing answer is not backfilled when consent is enabled.
    await page.evaluate(() => {
      const old = document.createElement('article');
      old.setAttribute('data-message-author-role', 'assistant');
      old.innerHTML = '<div class="markdown">OLD_PRIVATE_CHAT_NOT_TO_BACKFILL</div>';
      document.querySelector('#chat')?.appendChild(old);
    });
    await worker.evaluate(async tokenValue => {
      await chrome.storage.session.set({ token: tokenValue });
      await chrome.storage.local.set({ enabled: true });
    }, token);

    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const answer = document.createElement('article');
      answer.setAttribute('data-message-author-role', 'assistant');
      answer.innerHTML = '<div class="markdown">This response explains JavaScript const. ' +
        '<a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/const?track=private">MDN const</a></div>';
      document.querySelector('#chat')?.appendChild(answer);
    });

    let actual;
    await expect.poll(async () => {
      try {
        const response = await fetch('http://127.0.0.1:' + port + '/v1/workspace', {
          headers: { authorization: 'Bearer ' + token },
        });
        actual = await response.json();
        return actual.nodes.length;
      } catch { return -1; }
    }, { timeout: 20000 }).toBe(2);
    expect(actual.edges.length).toBe(1);
    expect(actual.nodes.map(node => node.kind).sort()).toEqual(['answer', 'document']);
    expect(actual.edges[0].kind).toBe('cited');
    expect(actual.edges[0].evidence).toBe('reported');
    expect(actual.nodes.find(node => node.kind === 'answer').detail).toContain('JavaScript const');
    const disk = await readFile(collectorFile, 'utf8');
    expect(disk).not.toContain('PRIVATE_USER_PROMPT');
    expect(disk).not.toContain('OLD_PRIVATE_CHAT');
    expect(disk).not.toContain('track=private');
    expect(disk).not.toContain(token);
    expect(disk).toContain('developer.mozilla.org');
    // Disabling capture prevents further ingestion.
    await worker.evaluate(async () => {
      await chrome.storage.local.set({ enabled: false });
      await chrome.storage.session.remove('token');
    });
    await page.evaluate(() => {
      const newAnswer = document.createElement('article');
      newAnswer.setAttribute('data-message-author-role', 'assistant');
      newAnswer.innerHTML = '<div class="markdown">DO_NOT_CAPTURE_AFTER_DISABLED</div>';
      document.querySelector('#chat')?.appendChild(newAnswer);
    });
    await page.waitForTimeout(3500);
    const persisted = await readFile(collectorFile, 'utf8');
    expect(persisted).not.toContain('DO_NOT_CAPTURE_AFTER_DISABLED');
  } finally {
    await context?.close().catch(() => {});
    collector?.kill();
    await rm(dir, { recursive: true, force: true });
  }
});
