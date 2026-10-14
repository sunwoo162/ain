import { test, expect } from '@playwright/test';

test('데스크톱: 초기 그래프, 노드 탐색, 렌즈, 몰입 모드, 타임라인', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /모든 답변에는/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /관계망 탐색/ })).toBeVisible();
  await expect(page.locator('.graph-canvas')).toBeVisible();
  await expect(page.locator('.provider-telemetry')).toBeVisible();
  await expect(page.getByText('NO TRACES YET').first()).toBeVisible();

  await page.getByRole('button', { name: '노드 라이브러리' }).click();
  const rows = page.locator('.library-row');
  await expect(rows).toHaveCount(25);
  await rows.first().click();
  await expect(page.getByRole('button', { name: '선택 노드에서 1단계 관계 표시' })).toBeHidden();
  await page.getByRole('button', { name: /관계망 탐색/ }).click();
  const oneHop = page.getByRole('button', { name: '선택 노드에서 1단계 관계 표시' });
  await expect(oneHop).toBeEnabled();
  await oneHop.click();
  await expect(oneHop).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Immersive' }).click();
  await expect(page.getByRole('button', { name: 'Exit focus' })).toBeVisible();
  await expect(page.locator('.sidebar')).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('uisim-immersive-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(page.locator('.sidebar')).toBeVisible();

  await page.getByRole('button', { name: '시간 기록' }).click();
  const chronicle = page.getByRole('region', { name: 'AI 실행 이벤트 시간 흐름' });
  await expect(chronicle).toBeVisible();
  await expect(chronicle.locator('.chronicle-entry')).toHaveCount(25);
  const first = chronicle.locator('.chronicle-event').first();
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: testInfo.outputPath('uisim-timeline-desktop.png'), fullPage: true, animations: 'disabled' });
  expect(errors).toEqual([]);
});

test('모바일: 탐색 메뉴 접근, 시간 기록, 가로 넘침 없음', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const nav = page.getByRole('button', { name: '시간 기록' });
  await expect(nav).toBeVisible();
  await nav.click();
  await expect(page.getByRole('region', { name: 'AI 실행 이벤트 시간 흐름' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /흔적을 따라/ })).toBeVisible();
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > window.innerWidth + 2);
  expect(overflow).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('uisim-timeline-mobile.png'), fullPage: true, animations: 'disabled' });
});
