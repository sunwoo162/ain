import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCollector } from '../server/collector.mjs';
import { createTraceClient } from '../sdk/client.mjs';

const origin='http://127.0.0.1:5173';
test('RC1: explicit collector ingestion, persistence, auth and crash-safe retry',async()=>{
  const temp=await mkdtemp(join(tmpdir(),'uisim-rc1-smoke-'));
  const file=join(temp,'collector.json');
  const token=randomBytes(24).toString('hex');
  const {server,getWorkspace}=await createCollector({token,file});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=`http://127.0.0.1:${server.address().port}`;
  try{
    const api=createTraceClient({token,baseUrl:address,source:'rc1-synthetic-agent'});
    const traceId=randomUUID();
    const createdAt=new Date().toISOString();
    const events=[
      api.node({id:'rc1-node-01',kind:'prompt',label:'RC1 요청 관측',traceId,createdAt}),
      api.node({id:'rc1-node-02',kind:'answer',label:'RC1 응답 관측',traceId,createdAt}),
      api.edge({id:'rc1-link-01',source:'rc1-node-01',target:'rc1-node-02',kind:'produced',traceId,createdAt}),
    ];
    await api.send(events);
    await api.send(events);
    assert.equal(getWorkspace().nodes.length,2);
    assert.equal(getWorkspace().edges.length,1);
    const denied=await fetch(address+'/v1/workspace',{headers:{authorization:'Bearer wrong-token'}});
    assert.equal(denied.status,401);
    assert.ok(!(await denied.text()).includes(token));
    const badOrigin=await fetch(address+'/v1/workspace',{headers:{
      origin:'https://untrusted.example',authorization:`Bearer ${token}`,
    }});
    assert.equal(badOrigin.status,403);
    const tooLarge=await fetch(address+'/v1/events',{method:'POST',headers:{
      authorization:`Bearer ${token}`, 'content-type':'application/json',
    },body:'A'.repeat(257*1024)});
    assert.equal(tooLarge.status,413);
    assert.equal(getWorkspace().nodes.length,2);
    const response=await fetch(address+'/v1/workspace',{headers:{
      authorization:`Bearer ${token}`, origin,
    }});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('access-control-allow-origin'),origin);
    const saved=await readFile(file,'utf8');
    assert.ok(saved.includes(traceId));
    assert.ok(!saved.includes(token));
    if(process.platform!=='win32')assert.equal((await stat(file)).mode & 0o077,0);
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
  const restarted=await createCollector({token,file});
  assert.equal(restarted.getWorkspace().nodes.length,2);
  assert.equal(restarted.getWorkspace().edges.length,1);
  await rm(temp,{recursive:true,force:true});
});
