import test from 'node:test';
import assert from 'node:assert/strict';
import {retryPreviewRead,unwrapIpc} from '../preview-read-retry.mjs';
import {createPreviewReadLane} from '../preview-read-lane.mjs';
import {createLayoutScheduler} from '../layout-scheduler.mjs';
const conflict=()=>Object.assign(Error('busy'),{code:'PREVIEW_RETRY'});
test('transient conflict retries and returns newest successful read',async()=>{
  let count=0;const delays=[];
  const result=await retryPreviewRead(async()=>{if(++count<3)throw conflict();return 'latest';},{sleep:async ms=>{delays.push(ms);}});
  assert.equal(result,'latest');assert.equal(count,3);assert.deepEqual(delays,[100,200]);
});
test('retry budget is bounded and permanent error is not retried',async()=>{
  let count=0;
  await assert.rejects(retryPreviewRead(()=>{count++;throw conflict();},{sleep:async()=>{}}),{code:'PREVIEW_RETRY'});
  assert.equal(count,5);
  count=0;
  await assert.rejects(retryPreviewRead(()=>{count++;throw Error('disk corrupted');},{sleep:async()=>assert.fail('must not wait')}),/disk corrupted/);
  assert.equal(count,1);
});
test('superseded request cancels during wait without another IPC',async()=>{
  let current=true,count=0;
  await assert.rejects(retryPreviewRead(()=>{count++;throw conflict();},{current:()=>current,sleep:async()=>{current=false;}}),{code:'PREVIEW_CANCELLED'});
  assert.equal(count,1);
});
test('successful but superseded read cannot be accepted',async()=>{
  let current=true;
  await assert.rejects(retryPreviewRead(async()=>{current=false;return 'old';},{current:()=>current}),{code:'PREVIEW_CANCELLED'});
});
test('IPC code is retained without parsing human-readable error messages',async()=>{
  await assert.rejects(unwrapIpc(Promise.resolve({ok:false,error:{code:'PREVIEW_RETRY',message:'競合'}})),{code:'PREVIEW_RETRY'});
  assert.equal(await unwrapIpc(Promise.resolve({ok:true,value:42})),42);
});
test('real read lane recovers after foreground operation releases lock',async()=>{
  const lane=createPreviewReadLane();let busy=true,loads=0;
  const read=()=>lane.read('session',()=>!busy,()=>++loads);
  assert.equal(await retryPreviewRead(read,{sleep:async()=>{busy=false;}}),1);
  assert.equal(loads,1);
});

test('abort interrupts a long retry backoff and allows the latest scheduled read',{timeout:2000},async()=>{
  const tasks=[],scheduler=createLayoutScheduler({scheduleHandoff:fn=>tasks.push(fn)});
  let count=0;
  const old=scheduler.submit((id,signal)=>retryPreviewRead(()=>{count++;throw conflict();},{signal,delays:[60000]}));
  const rejected=assert.rejects(old,{code:'PREVIEW_CANCELLED'});
  const latest=scheduler.submit((id,signal)=>retryPreviewRead(()=>42,{signal}));
  await rejected;
  assert.equal(count,1);assert.equal(tasks.length,1);
  tasks.shift()();assert.equal(await latest,42);
});
test('pre-aborted read never invokes IPC',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(retryPreviewRead(()=>assert.fail('aborted read ran'),{signal:controller.signal}),{code:'PREVIEW_CANCELLED'});
});
test('abort does not release an already dispatched read before it settles',async()=>{
  const controller=new AbortController();let release,settled=false,count=0;
  const pending=new Promise(resolve=>{release=resolve;});
  const read=retryPreviewRead(()=>{count++;return pending;},{signal:controller.signal});
  const checked=assert.rejects(read,{code:'PREVIEW_CANCELLED'}).then(()=>{settled=true;});
  controller.abort();await Promise.resolve();await Promise.resolve();
  assert.equal(settled,false);assert.equal(count,1);
  release('obsolete');await checked;
});
test('abort after a completed retry does not affect another request',async()=>{
  const controller=new AbortController();let count=0;
  assert.equal(await retryPreviewRead(()=>{if(++count===1)throw conflict();return 'first';},{signal:controller.signal,delays:[0]}),'first');
  controller.abort();
  assert.equal(await retryPreviewRead(()=> 'second'),'second');
  assert.equal(count,2);
});
