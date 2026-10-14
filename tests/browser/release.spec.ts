import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createTraceClient } from '../../sdk/client.mjs';

async function unusedLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address=server.address();
  if (!address || typeof address === 'string') throw new Error('Invalid address');
  const port=address.port;
  await new Promise<void>(resolve=>server.close(()=>resolve()));
  return port;
}

test('RC1: 첫 사용자 안내는 닫힌 뒤 유지되고 도움말에서 다시 열림', async ({page},testInfo)=>{
  await page.goto('/');
  const intro=page.getByRole('region',{name:'처음 사용하는 의심암귀 안내'});
  await expect(intro).toBeVisible();
  await expect(intro).toContainText('합성 데모');
  await page.screenshot({
    path:testInfo.outputPath('rc1-first-run-desktop.png'),fullPage:true,animations:'disabled',
  });
  await intro.getByRole('button',{name:'시작 가이드 닫기'}).click();
  await expect(intro).toBeHidden();
  await page.reload();
  await expect(intro).toBeHidden();
  await page.getByRole('button',{name:'시작 가이드'}).click();
  await expect(intro).toBeVisible();
  await intro.getByRole('button',{name:/로컬 수집기 연결/}).click();
  await expect(page.getByRole('form',{name:'로컬 AI 수집기 연결'})).toBeVisible();
  await expect(intro).toBeHidden();
});

test('RC1: 실제 로컬 수집기에서 브라우저 그래프까지 이벤트가 전달됨', async ({page},testInfo)=>{
  const dir=await mkdtemp(join(tmpdir(),'uisim-rc1-browser-'));
  const token=randomBytes(24).toString('hex');
  const port=await unusedLoopbackPort();
  const url=`http://127.0.0.1:${port}`;
  const child:ChildProcess=spawn(process.execPath,[
    '--experimental-strip-types','server/collector.mjs',
  ],{cwd:process.cwd(),env:{
    ...process.env, MINDTRACE_TOKEN:token,MINDTRACE_PORT:String(port),
    MINDTRACE_DATA_FILE:join(dir,'collector.json'),
  },stdio:'ignore'});
  try {
    await expect.poll(async()=>{
      if(child.exitCode!==null)return 'stopped';
      try{
        const result=await fetch(url+'/v1/workspace',{
          headers:{authorization:`Bearer ${token}`},
          signal:AbortSignal.timeout(1500),
        });
        return result.status===200?'ready':String(result.status);
      }catch{return 'starting';}
    },{timeout:15_000}).toBe('ready');
    const client=createTraceClient({token,baseUrl:url,source:'rc1-integration'});
    await page.goto('/');
    const intro=page.getByRole('region',{name:'처음 사용하는 의심암귀 안내'});
    if(await intro.isVisible()){
      await intro.getByRole('button',{name:/로컬 수집기 연결/}).click();
    }else {
      await page.getByRole('button',{name:'Live connect'}).click();
    }
    const form=page.getByRole('form',{name:'로컬 AI 수집기 연결'});
    await expect(form).toBeVisible();
    await form.locator('#collector-url').fill(url);
    await form.locator('#collector-token').fill(token);
    page.once('dialog',dialog=>void dialog.accept());
    await form.getByRole('button',{name:'연결',exact:true}).click();
    await expect(form).toBeHidden();
    const traceId=randomUUID();
    const timestamp=new Date().toISOString();
    await client.send([
      client.node({id:'rc1-integration-request',kind:'prompt',label:'RC1 합성 요청',
        detail:'민감 정보 없는 회귀 테스트 이벤트',traceId,createdAt:timestamp}),
      client.node({id:'rc1-integration-answer',kind:'answer',label:'RC1 합성 응답',
        detail:'실제 모델 응답이 아닌 테스트 기록',traceId,createdAt:timestamp}),
      client.edge({id:'rc1-integration-link',source:'rc1-integration-request',
        target:'rc1-integration-answer',kind:'produced',traceId,createdAt:timestamp}),
    ]);
    await expect.poll(()=>page.locator('.heading-meta strong').first().textContent(),
      {timeout:14_000}).toBe('2');
    await expect(page.locator('.graph-canvas')).toBeVisible();
    await expect(page.getByRole('region',{name:'연결된 실행 묶음 탐색'})).toBeVisible();
    await page.screenshot({
      path:testInfo.outputPath('rc1-real-collector-desktop.png'),
      fullPage:true,animations:'disabled',
    });
    await page.reload();
    await expect(page.locator('.heading-meta strong').first()).toHaveText('2');
    const unauth=await fetch(url+'/v1/workspace');
    expect(unauth.status).toBe(401);
  }finally{
    child.kill();
    await rm(dir,{recursive:true,force:true});
  }
});

test('RC1: 모바일 첫 실행의 안내·그래프·레이아웃이 정상 표시됨',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const intro=page.getByRole('region',{name:'처음 사용하는 의심암귀 안내'});
  await expect(intro).toBeVisible();
  await expect(page.locator('.graph-canvas')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2)).toBe(false);
  await intro.getByRole('button',{name:/그래프 탐험하기/}).click();
  await expect(intro).toBeHidden();
  await expect(page.locator('.inspector-body h2')).toBeVisible();
  await page.screenshot({
    path:testInfo.outputPath('rc1-mobile-onboarding.png'),
    fullPage:true,animations:'disabled',
  });
});
