import { chromium } from 'playwright';
import { performance } from 'node:perf_hooks';

const total=10_000, connections=30_000;
const timestamp='2026-10-14T12:00:00.000Z';
const nodes=Array.from({length:total},(_,i)=>({
  id:'bench_n_'+i,kind:i%7===0?'model':i%7===1?'answer':'tool',
  label:'합성 벤치마크 이벤트 '+i,detail:'인덱스 그래프 검사 '+(i%301),
  createdAt:timestamp,source:'synthetic-benchmark',evidence:'observed',
}));
const edges=Array.from({length:connections},(_,i)=>({
  id:'bench_e_'+i,source:'bench_n_'+(i%total),
  target:'bench_n_'+((i*137+97)%total),
  kind:'related',createdAt:timestamp,evidence:'observed',
}));
const workspace={schemaVersion:1,id:'synthetic-browser-bench',
  name:'브라우저 합성 부하',description:'임시 테스트',isDemo:false,nodes,edges};

let browser;
try {
  browser=await chromium.launch({
    headless:true,
    args:['--enable-precise-memory-info'],
  });
  const context=await browser.newContext({
    viewport:{width:1440,height:900},
    reducedMotion:'reduce',
  });
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    localStorage.setItem('uisim.quickstart.dismissed.v1','yes');
  });
  await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});
  await page.locator('.graph-canvas').waitFor({state:'visible'});
  await page.waitForTimeout(700);

  // Use the real application's IndexedDB save/load functions in a fresh
  // isolated browser profile (not the user's everyday browser storage).
  const saved=await page.evaluate(async data=>{
    const storage=await import('/src/lib/storage.ts');
    await storage.saveWorkspace(data);
    const reloaded=await storage.loadStoredWorkspace();
    return {nodes:reloaded.nodes.length,edges:reloaded.edges.length};
  },workspace);
  if(saved.nodes!==total || saved.edges!==connections){
    throw new Error('Large workspace failed a real save/load round-trip.');
  }
  const started=performance.now();
  await page.reload({waitUntil:'domcontentloaded',timeout:90_000});
  await page.locator('.graph-canvas').waitFor({state:'visible',timeout:90_000});
  await page.getByText('브라우저 합성 부하').first().waitFor({timeout:90_000});
  const canvasVisibleMs=performance.now()-started;
  await page.waitForTimeout(2000);

  const metrics=await page.evaluate(async()=>{
    const heap=performance.memory?.usedJSHeapSize ?? null;
    const sample=[];
    let previous=0;
    await new Promise(resolve=>{
      let count=0;
      function tick(now){
        if(previous)sample.push(now-previous);
        previous=now;
        if(++count<181)requestAnimationFrame(tick);
        else resolve(null);
      }
      requestAnimationFrame(tick);
    });
    sample.sort((a,b)=>a-b);
    const med=sample[Math.floor(sample.length/2)]||0;
    const p95=sample[Math.floor(sample.length*.95)]||0;
    return {
      usedHeapMiB:heap===null?null:+(heap/1048576).toFixed(1),
      medianFrameMs:+med.toFixed(2),p95FrameMs:+p95.toFixed(2),
      medianIdleFps:med?+(1000/med).toFixed(1):null,
      pageWidth:document.documentElement.scrollWidth,
      viewportWidth:innerWidth,
      budgetText:document.querySelector('.render-budget')?.textContent?.trim()||null,
      title:document.title,
    };
  });
  if(errors.length)throw new Error('Browser page errors: '+errors.slice(0,2).join(' / '));
  if(metrics.pageWidth>metrics.viewportWidth+2)throw new Error('Desktop horizontal overflow');
  const output={result:'PASS',dataset:'synthetic isolated Playwright profile',
    nodes:total,edges:connections,
    graphVisibleMs:+canvasVisibleMs.toFixed(1),
    ...metrics,errors:0,
    limitations:'Idle frame sampling is not interactive FPS; device-specific results, not a production SLA.'};
  console.log(JSON.stringify(output,null,2));
  await context.close();
}finally {
  await browser?.close();
}
