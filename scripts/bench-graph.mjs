import { performance } from 'node:perf_hooks';
import { getVisibleGraph, NODE_KINDS, isWorkspace } from '../src/domain/graph.ts';
import { createGraphSearchIndex, searchGraphIndex } from '../src/domain/search.ts';
import { findConnectedClusters } from '../src/domain/clusters.ts';
import { planGraphViewport, findRecordedPath } from '../src/domain/paths.ts';

const totalNodes=process.argv.includes('--quick')?2000:10000;
const totalEdges=process.argv.includes('--quick')?6000:30000;
const stamp='2026-10-14T08:00:00.000Z';
const nodes=Array.from({length:totalNodes},(_,i)=>({
  id:`bench_${i}`,kind:i%9===0?'model':i%9===1?'answer':'tool',
  label:`합성 실행 로그 검색 분석 이벤트 ${i}`,
  detail:`API latency SQL connection index synthetic ${i%247}`,
  createdAt:stamp,source:'benchmark synthetic only',evidence:'observed',
}));
const edges=Array.from({length:totalEdges},(_,i)=>({
  id:`link_${i}`,source:`bench_${i%totalNodes}`,
  target:`bench_${(i*137+97)%totalNodes}`,
  kind:'related',createdAt:stamp,evidence:'observed',
}));
const workspace={schemaVersion:1,id:'benchmark-synthetic',name:'Synthetic Benchmark',
  description:'Generated in memory only',isDemo:true,nodes,edges};
if(!isWorkspace(workspace))throw new Error('Invalid deterministic workload.');
const samples=(fn,count=12)=>{
  const times=[];
  for(let i=0;i<count;i++){
    const begin=performance.now();fn();times.push(performance.now()-begin);
  }
  times.sort((a,b)=>a-b);
  return {medianMs:+times[Math.floor(times.length*.5)].toFixed(2),
    p95Ms:+times[Math.min(times.length-1,Math.ceil(times.length*.95)-1)].toFixed(2)};
};
const buildStart=performance.now();
const search=createGraphSearchIndex(workspace);
const buildMs=performance.now()-buildStart;
const queries=['latency','kind:model','kind:answer index','검색 분석','trace:missing_run','source:benchmark'];
const indexed=samples(()=>queries.map(q=>searchGraphIndex(search,q)),16);
const querySet=searchGraphIndex(search,'SQL connection');
const visible=samples(()=>getVisibleGraph(workspace,{query:'SQL connection',kinds:[...NODE_KINDS]},querySet),12);
const all={nodes,edges};
const groups=samples(()=>findConnectedClusters(all),7);
const viewport=samples(()=>planGraphViewport(all),10);
const route=samples(()=>findRecordedPath(all,'bench_0','bench_500'),6);
const report={workload:{nodes:totalNodes,edges:totalEdges,queries:queries.length,synthetic:true},
  indexBuildMs:+buildMs.toFixed(2),indexedQueryBatch:indexed,visibleGraph:visible,
  connectedGrouping:groups,boundedViewport:viewport,recordedPath:route,
  viewportLimit:{nodes:600,edges:1800},
  heapUsedMiB:+(process.memoryUsage().heapUsed/1024/1024).toFixed(2),
  note:'Node.js synthetic CPU timings, not browser FPS or production SLA; numbers depend on runner hardware.'};
if(process.argv.includes('--json'))console.log(JSON.stringify(report,null,2));
else{
  console.log('\n의심암귀 합성 그래프 성능 벤치마크 (실제 사용자 데이터 없음)');
  console.log(`노드 ${totalNodes.toLocaleString()} · 연결 ${totalEdges.toLocaleString()} · 인덱스 구성 ${report.indexBuildMs}ms`);
  for(const [key,val] of Object.entries(report)){
    if(val && typeof val==='object' && 'p95Ms' in val)
      console.log(`${key.padEnd(22)} p50 ${val.medianMs}ms · p95 ${val.p95Ms}ms`);
  }
  console.log(`프로세스 힙 ${report.heapUsedMiB} MiB (측정 시점 기준)\n`);
}
