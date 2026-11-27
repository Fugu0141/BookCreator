import {test} from 'node:test';
import assert from 'node:assert/strict';
import {yieldCurrentPreview} from '../preview-task-boundary.mjs';
test('stale preview skips the task and current preview continues after it',async()=>{
  let calls=0;
  const yieldTask=async()=>{calls++;};
  assert.equal(await yieldCurrentPreview(()=>false,yieldTask),false);
  assert.equal(calls,0);
  assert.equal(await yieldCurrentPreview(()=>true,yieldTask),true);
  assert.equal(calls,1);
});
test('queued input invalidates a preview before it can enter measurement',async()=>{
  let current=true;
  setTimeout(()=>{current=false;},0);
  assert.equal(await yieldCurrentPreview(()=>current),false);
});
test('task failure propagates',async()=>{
  const reason=new Error('task failure');
  await assert.rejects(yieldCurrentPreview(()=>true,async()=>{throw reason;}),e=>e===reason);
});
