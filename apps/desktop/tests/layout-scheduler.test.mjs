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
