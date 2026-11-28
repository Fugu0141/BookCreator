import test from 'node:test';
import assert from 'node:assert/strict';
import {createMeasurementLane} from '../measurement-lane.mjs';
import {createLayoutScheduler} from '../layout-scheduler.mjs';
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
  const b=lane.run(()=>{time=80;return 'b';},{category:'catalog',priority:'catalog'});
  time=20;let current=true;
  const c=lane.run(()=>assert.fail('obsolete work must not run'),{category:'component',current:()=>current});
  time=50;current=false;hold.resolve();
  await Promise.all([a,b,c]);
  assert.deepEqual(rows,[{stage:'measurement',category:'book',outcome:'success',waitMs:0,runMs:50},{stage:'measurement',category:'component',outcome:'cancelled',waitMs:30,runMs:0},{stage:'measurement',category:'catalog',outcome:'success',waitMs:40,runMs:30}]);
});

test('queued abort releases the layout scheduler before the physical lane is free',async()=>{
  const tasks=[],hold=deferred(),rows=[],lane=createMeasurementLane({report:row=>rows.push(row)});
  const scheduler=createLayoutScheduler({scheduleHandoff:fn=>tasks.push(fn)});
  const blocker=lane.run(()=>hold.promise,{priority:'catalog'});
  const old=scheduler.submit((id,signal)=>lane.run(()=>assert.fail('obsolete measurement ran'),{signal,category:'manuscript'}));
  const latest=scheduler.submit((id,signal)=>lane.run(()=>42,{signal,category:'manuscript'}));
  assert.equal(await old,undefined);
  assert.equal(tasks.length,1);
  assert.equal(rows.length,1);
  assert.equal(rows[0].outcome,'cancelled');assert.equal(rows[0].runMs,0);
  tasks.shift()();
  assert.equal(rows.length,1);
  hold.resolve();await blocker;
  assert.equal(await latest,42);
  assert.deepEqual(rows.map(r=>r.outcome),['cancelled','success','success']);
});
test('aborting an active measurement does not release physical exclusivity early',async()=>{
  const lane=createMeasurementLane(),hold=deferred(),controller=new AbortController();let started=false;
  const old=lane.run(async()=>{await hold.promise;return 'old';},{signal:controller.signal});
  const next=lane.run(()=>{started=true;return 'new';});
  controller.abort();
  await Promise.resolve();assert.equal(started,false);
  hold.resolve();
  assert.equal(await old,undefined);assert.equal(await next,'new');
});
test('pre-aborted signals never execute and report cancellation once',async()=>{
  const rows=[],lane=createMeasurementLane({report:row=>rows.push(row)}),controller=new AbortController();
  controller.abort();
  assert.equal(await lane.run(()=>assert.fail('aborted measurement ran'),{signal:controller.signal}),undefined);
  assert.equal(rows.length,1);assert.equal(rows[0].outcome,'cancelled');assert.equal(rows[0].runMs,0);
  assert.equal(await lane.run(()=>42),42);
});
test('abort after completion has no effect on later work or metrics',async()=>{
  const rows=[],lane=createMeasurementLane({report:row=>rows.push(row)}),controller=new AbortController(),hold=deferred();
  assert.equal(await lane.run(()=>1,{signal:controller.signal}),1);
  const next=lane.run(()=>hold.promise);
  controller.abort();assert.equal(rows.length,1);
  hold.resolve(2);assert.equal(await next,2);
  assert.deepEqual(rows.map(r=>r.outcome),['success','success']);
});
