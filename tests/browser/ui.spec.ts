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


test('클러스터: 세 묶음을 탐색하고 원래 관계망으로 복귀', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const navigator = page.getByRole('region', { name: '연결된 실행 묶음 탐색' });
  await expect(navigator).toBeVisible();
  await expect(navigator.getByText('3', { exact: true }).first()).toBeVisible();
  const all = navigator.getByRole('button', { name: /모든 흔적 탐색/ });
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  const group = navigator.getByRole('button', { name: /연결 묶음 1:/ });
  await expect(group).toBeVisible();
  await group.click();
  await expect(group).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.constellation-active')).toContainText('집중 탐색 중');
  await expect(page.locator('.result-count')).toContainText('8 / 25');
  await page.screenshot({
    path: testInfo.outputPath('uisim-constellation-focused-desktop.png'),
    fullPage: true, animations: 'disabled',
  });
  await navigator.getByRole('button', { name: /전체로 돌아가기/ }).click();
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.result-count')).toContainText('25 / 25');
  expect(errors).toEqual([]);
});

test('시맨틱 줌: 축소·확대 단계에서 표시 상태가 변경되고 데이터는 유지됨', async ({ page }, testInfo) => {
  await page.goto('/');
  const hud = page.getByRole('status', { name: '그래프 확대 단계' });
  await expect(hud).toBeVisible();
  const surface = page.locator('.graph-surface');
  const zoomOut = surface.getByRole('button', { name: 'Zoom out' });
  const zoomIn = surface.getByRole('button', { name: 'Zoom in' });
  for (let i = 0; i < 8; i++) await zoomOut.click();
  await expect(hud).toContainText('은하 조망');
  await expect(page.locator('.result-count')).toContainText('25 / 25');
  for (let i = 0; i < 13; i++) await zoomIn.click();
  await expect(hud).toContainText('세부 분석');
  await expect(page.locator('.result-count')).toContainText('25 / 25');
  await page.screenshot({
    path: testInfo.outputPath('uisim-semantic-zoom-desktop.png'),
    fullPage: true, animations: 'disabled',
  });
});

test('모바일: 클러스터 선택과 복귀가 가능하고 페이지 가로 넘침이 없음', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const navigator = page.getByRole('region', { name: '연결된 실행 묶음 탐색' });
  await expect(navigator).toBeVisible();
  await navigator.getByRole('button', { name: /연결 묶음 1:/ }).click();
  await expect(page.locator('.constellation-active')).toBeVisible();
  await expect(page.locator('.result-count')).toContainText('8 / 25');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
  expect(overflow).toBe(false);
  await page.screenshot({
    path: testInfo.outputPath('uisim-constellation-mobile.png'),
    fullPage: true, animations: 'disabled',
  });
});


test('V0.8: 미니맵으로 실제 그래프 카메라 이동, 묶음 기준 전환', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const minimap=page.locator('.graph-minimap canvas');
  await expect(minimap).toBeVisible();
  await expect(minimap).toHaveAttribute('role','button');
  const navigator=page.getByRole('region',{name:'연결된 실행 묶음 탐색'});
  const mode=navigator.getByRole('group',{name:'기록 묶음 기준'});
  await mode.getByRole('button',{name:'실행 ID 기준'}).click();
  await expect(mode.getByRole('button',{name:'실행 ID 기준'})).toHaveAttribute('aria-pressed','true');
  await expect(navigator.getByText('ID 미지정').first()).toBeVisible();
  await mode.getByRole('button',{name:'연결 기준'}).click();
  await expect(navigator.getByRole('button',{name:/연결 묶음 1:/})).toBeVisible();
  await minimap.click({position:{x:26,y:29}});
  await minimap.focus();
  await page.keyboard.press('ArrowRight');
  await page.screenshot({path:testInfo.outputPath('uisim-minimap-desktop.png'),
    fullPage:true,animations:'disabled'});
  expect(errors).toEqual([]);
});

test('V0.8: 기록 타임라인 두 시점 비교는 실제 추가 이벤트를 집계', async ({page},testInfo) => {
  await page.goto('/');
  await page.getByRole('button',{name:'시간 기록'}).click();
  const diff=page.getByRole('region',{name:'그래프 두 시점 비교'});
  await expect(diff).toBeVisible();
  await expect(diff.locator('.diff-stat').first()).toContainText('25');
  await expect(diff.locator('.diff-stat').nth(3)).toContainText('28');
  const baseline=diff.getByRole('slider',{name:/기준 시점/});
  await baseline.fill(String(await baseline.getAttribute('max')));
  await expect(diff.locator('.diff-stat').first()).toContainText('0');
  await page.screenshot({path:testInfo.outputPath('uisim-timeline-diff-desktop.png'),
    fullPage:true,animations:'disabled'});
});

test('V0.8 모바일: 미니맵과 비교 패널 가로 넘침 없이 표시',async ({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await expect(page.locator('.graph-minimap canvas')).toBeVisible();
  await page.getByRole('button',{name:'시간 기록'}).click();
  await expect(page.getByRole('region',{name:'그래프 두 시점 비교'})).toBeVisible();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
  expect(overflow).toBe(false);
  await page.screenshot({path:testInfo.outputPath('uisim-timeline-diff-mobile.png'),
    fullPage:true,animations:'disabled'});
});
