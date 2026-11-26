import test from 'node:test';
import assert from 'node:assert/strict';
import {createMeasurementLane} from '../measurement-lane.mjs';
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
test('physical jobs serialize and foreground overtakes waiting catalog jobs',async()=>{
  const lane=createMeasurementLane(),hold=deferred(),started=[];
  const a=lane.run(async()=>{started.push('a');await hold.promise;},{priority:'catalog'});
  const b=lane.run(()=>started.push('b'),{priority:'catalog'});
  const c=lane.run(()=>started.push('c'));
  assert.deepEqual(started,['a']);
  hold.resolve();await Promise.all([a,b,c]);
  assert.deepEqual(started,['a','c','b']);
});
test('obsolete queued and running jobs cannot publish',async()=>{
  const lane=createMeasurementLane(),hold=deferred();let current=true,ran=false;
  const a=lane.run(async()=>{await hold.promise;return 'old';},{current:()=>current});
  const b=lane.run(()=>{ran=true;},{current:()=>current});
  current=false;
  const c=lane.run(()=> 'new');
  hold.resolve();
  assert.equal(await a,undefined);assert.equal(await b,undefined);
  assert.equal(ran,false);assert.equal(await c,'new');
});
test('error does not block subsequent jobs',async()=>{
  const lane=createMeasurementLane();
  await assert.rejects(lane.run(()=>{throw Error('failed');}),/failed/);
  assert.equal(await lane.run(()=>42),42);
});
