import test from 'node:test';
import assert from 'node:assert/strict';
import {createLayoutScheduler} from '../layout-scheduler.mjs';

function deferred(){
  let resolve;
  const promise=new Promise(r=>{resolve=r;});
  return {promise,resolve};
}

test('one active job and only the latest pending job',async()=>{
  const scheduler=createLayoutScheduler(),hold=deferred(),started=[],applied=[];
  const run=name=>async id=>{
    started.push(name);
    if(name==='A')await hold.promise;
    if(scheduler.isCurrent(id))applied.push(name);
  };
  const a=scheduler.submit(run('A')),b=scheduler.submit(run('B')),c=scheduler.submit(run('C'));
  await b;
  assert.deepEqual(started,['A']);
  hold.resolve();
  await Promise.all([a,c]);
  assert.deepEqual(started,['A','C']);
  assert.deepEqual(applied,['C']);
});

test('invalidation drops queued work and invalidates the running callback',async()=>{
  const scheduler=createLayoutScheduler(),hold=deferred();
  let oldId,ran=false;
  const a=scheduler.submit(async id=>{oldId=id;await hold.promise;});
  const b=scheduler.submit(()=>{ran=true;});
  scheduler.invalidate();
  await b;
  assert.equal(scheduler.isCurrent(oldId),false);
  hold.resolve();await a;
  assert.equal(ran,false);
  await scheduler.submit(id=>assert.equal(scheduler.isCurrent(id),true));
});

test('failure releases the active slot and allows the newest request',async()=>{
  const scheduler=createLayoutScheduler(),hold=deferred();
  const first=scheduler.submit(async()=>{await hold.promise;throw Error('layout failure');});
  const rejected=assert.rejects(first,/layout failure/);
  const next=scheduler.submit(id=>scheduler.isCurrent(id));
  hold.resolve();await rejected;
  assert.equal(await next,true);
});

test('separate scheduler instances have independent lifetimes',async()=>{
  const a=createLayoutScheduler(),b=createLayoutScheduler(),hold=deferred();
  let id;
  const first=a.submit(async request=>{id=request;await hold.promise;});
  await b.submit(()=>{});
  b.invalidate();
  assert.equal(a.isCurrent(id),true);
  hold.resolve();await first;
});

test('first request starts immediately, pending successor waits at handoff and is replaceable',async()=>{
  const tasks=[],hold=deferred(),started=[];
  const scheduler=createLayoutScheduler({scheduleHandoff:fn=>tasks.push(fn)});
  const first=scheduler.submit(async()=>{started.push('first');await hold.promise;});
  const stale=scheduler.submit(()=>started.push('stale'));
  assert.deepEqual(started,['first']);
  hold.resolve();await first;
  assert.equal(tasks.length,1);
  const latest=scheduler.submit(()=>started.push('latest'));
  await stale;
  assert.deepEqual(started,['first']);
  tasks.shift()();
  await latest;
  assert.deepEqual(started,['first','latest']);
  assert.equal(tasks.length,0);
  const idle=scheduler.submit(()=>started.push('idle'));
  assert.deepEqual(started,['first','latest','idle']);
  await idle;
});
test('invalidation at a handoff prevents queued measurement without losing next request',async()=>{
  const tasks=[],hold=deferred(),started=[];
  const scheduler=createLayoutScheduler({scheduleHandoff:fn=>tasks.push(fn)});
  const first=scheduler.submit(()=>hold.promise);
  const obsolete=scheduler.submit(()=>started.push('obsolete'));
  hold.resolve();await first;
  scheduler.invalidate();await obsolete;
  tasks.shift()();
  assert.deepEqual(started,[]);
  await scheduler.submit(()=>started.push('new'));
  assert.deepEqual(started,['new']);
});
test('default handoff gives already queued input a real task boundary',async()=>{
  const scheduler=createLayoutScheduler(),hold=deferred(),started=[];
  const first=scheduler.submit(()=>hold.promise);
  const queued=scheduler.submit(()=>started.push('old'));
  let latest;
  const input=new Promise(resolve=>setTimeout(()=>{
    latest=scheduler.submit(()=>started.push('new'));
    resolve();
  },0));
  hold.resolve();await first;await input;await queued;await latest;
  assert.deepEqual(started,['new']);
});
