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

test('records queue waiting and execution time separately including cancelled work',async()=>{
  let time=0;const rows=[],hold=deferred();
  const lane=createMeasurementLane({now:()=>time,report:row=>rows.push(row)});
  const a=lane.run(async()=>{await hold.promise;return 'a';},{category:'book'});
  time=10;
  const b=lane.run(()=>{time=80;return 'b';},{category:'catalog'});
  time=20;let current=true;
  const c=lane.run(()=>assert.fail('obsolete work must not run'),{category:'component',current:()=>current});
  time=50;current=false;hold.resolve();
  await Promise.all([a,b,c]);
  assert.deepEqual(rows,[{stage:'measurement',category:'book',outcome:'success',waitMs:0,runMs:50},{stage:'measurement',category:'component',outcome:'cancelled',waitMs:30,runMs:0},{stage:'measurement',category:'catalog',outcome:'success',waitMs:40,runMs:30}]);
});
