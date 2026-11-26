import test from 'node:test';
import assert from 'node:assert/strict';
import {retryPreviewRead,unwrapIpc} from '../preview-read-retry.mjs';
import {createPreviewReadLane} from '../preview-read-lane.mjs';
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
