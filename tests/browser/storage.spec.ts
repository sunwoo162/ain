import { test, expect } from '@playwright/test';

test('RC1: 기존 localStorage 기록을 IndexedDB로 안전하게 이전하고 새로고침 후 유지', async ({page}) => {
  const workspace = {
    schemaVersion: 1, id: 'legacy-migration-test', name: '이전 버전 그래프',
    description: '마이그레이션 검증', isDemo: false,
    nodes: [
      { id: 'legacy-q', kind: 'prompt', label: '이전 요청', detail: '',
        createdAt: '2026-10-15T10:00:00.000Z', source: 'local', evidence: 'manual' },
      { id: 'legacy-a', kind: 'answer', label: '이전 응답', detail: '',
        createdAt: '2026-10-15T10:01:00.000Z', source: 'local', evidence: 'manual' },
    ],
    edges: [{ id: 'legacy-link', source: 'legacy-q', target: 'legacy-a',
      kind: 'related', evidence: 'manual', createdAt: '2026-10-15T10:01:00.000Z' }],
  };
  await page.addInitScript(data => {
    localStorage.setItem('mindtrace.workspace.v1', JSON.stringify(data));
    localStorage.setItem('uisim.quickstart.dismissed.v1', 'yes');
  }, workspace);
  await page.goto('/');
  await expect(page.locator('.heading-meta strong').first()).toHaveText('2');

  async function storedCount() {
    return await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('uisim.workspace.v1', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise<number>((resolve, reject) => {
          const request = db.transaction('records', 'readonly')
            .objectStore('records').get('current');
          request.onsuccess = () => resolve(request.result?.nodes?.length ?? -1);
          request.onerror = () => reject(request.error);
        });
      } finally { db.close(); }
    });
  }
  await expect.poll(storedCount, {timeout: 10_000}).toBe(2);
  await page.reload();
  await expect(page.locator('.heading-meta strong').first()).toHaveText('2');
  await expect.poll(storedCount, {timeout: 10_000}).toBe(2);
});
