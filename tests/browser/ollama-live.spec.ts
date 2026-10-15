import { test, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTraceClient } from '../../sdk/client.mjs';
import { createProviderObservers } from '../../sdk/provider-adapters.mjs';

// Opt-in only: connects to the user's installed local Ollama model.
// Never downloads models, accesses cloud AI, or persists prompts in fixtures.
test.skip(process.env.RUN_REAL_OLLAMA_E2E !== '1', 'Requires explicitly enabled local Ollama E2E');

async function freeLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No ephemeral local port');
  await new Promise<void>(resolve => server.close(() => resolve()));
  return address.port;
}

test('RC1: 실제 Ollama 모델 호출이 브라우저 그래프에 나타나고 원문은 저장되지 않음',
  async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const model = process.env.OLLAMA_MODEL || 'qwen2.5:1.5b';
    const token = randomBytes(24).toString('hex');
    const secret = 'RC1_PRIVATE_' + randomBytes(10).toString('hex');
    const dir = await mkdtemp(join(tmpdir(), 'uisim-real-browser-'));
    const port = await freeLoopbackPort();
    const url = 'http://127.0.0.1:' + port;
    const collector = spawn(process.execPath,
      ['--experimental-strip-types', 'server/collector.mjs'], {
        cwd: process.cwd(),
        stdio: 'ignore',
        env: {
          ...process.env, MINDTRACE_TOKEN: token,
          MINDTRACE_PORT: String(port),
          MINDTRACE_DATA_FILE: join(dir, 'traces.json'),
        },
      });
    try {
      await expect.poll(async () => {
        if (collector.exitCode !== null) return 'stopped';
        try {
          const resp = await fetch(url + '/v1/workspace', {
            headers: { authorization: 'Bearer ' + token },
            signal: AbortSignal.timeout(2000),
          });
          return resp.ok ? 'ready' : String(resp.status);
        } catch { return 'starting'; }
      }, { timeout: 20_000 }).toBe('ready');

      await page.goto('/');
      const intro = page.getByRole('region', { name: '처음 사용하는 의심암귀 안내' });
      if (await intro.isVisible()) await intro.getByRole('button', { name: /로컬 수집기 연결/ }).click();
      else await page.getByRole('button', { name: 'Live connect' }).click();

      const form = page.getByRole('form', { name: '로컬 AI 수집기 연결' });
      await form.locator('#collector-url').fill(url);
      await form.locator('#collector-token').fill(token);
      page.once('dialog', dialog => void dialog.accept());
      await form.getByRole('button', { name: '연결', exact: true }).click();
      await expect(form).toBeHidden();

      const observer = createProviderObservers({
        traceClient: createTraceClient({
          token, baseUrl: url, source: 'real-ollama-browser-smoke',
        }),
        fetcher: (endpoint, init) => fetch(endpoint, {
          ...init, signal: AbortSignal.timeout(90_000),
        }),
      });
      const actual = await observer.ollamaChat({
        body: {
          model, messages: [{ role: 'user',
            content: 'Say hello in one word. Never repeat: ' + secret,
          }],
        },
      });
      expect(typeof actual.message?.content).toBe('string');
      await expect.poll(() => page.locator('.heading-meta strong').first().textContent(),
        { timeout: 15_000 }).toBe('3');
      await expect(page.locator('.provider-telemetry')).toContainText('Ollama');
      await expect(page.locator('.provider-telemetry')).toContainText('RECORDED');
      const persisted = await readFile(join(dir, 'traces.json'), 'utf8');
      expect(persisted).not.toContain(secret);
      expect(persisted).not.toContain(token);
      expect(persisted).not.toContain(actual.message.content);
      await page.screenshot({
        path: testInfo.outputPath('rc1-actual-ollama-ui.png'),
        fullPage: true, animations: 'disabled',
      });
    } finally {
      collector.kill();
      await rm(dir, { recursive: true, force: true });
    }
  }
);
