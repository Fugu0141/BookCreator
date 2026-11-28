import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreparationClient} from '../preview-preparation-client.mjs';
import {createLayoutScheduler} from '../layout-scheduler.mjs';
function prepared(id,overrides={}){
  return {type:'prepared',id,prepared:{diagnostics:[]},preparationMs:1,
    work:{scan:{hits:0,misses:0},inline:{hits:0,misses:0,bypasses:0}},...overrides};
}
function setup(){
  const workers=[],timers=new Map();let timer=0;
  const client=createPreparationClient({spawn(){const w={messages:[],terminate(){this.closed=true;},postMessage(m){this.messages.push(m);}};workers.push(w);return w;},schedule(fn){timers.set(++timer,fn);return timer;},unschedule(id){timers.delete(id);}});
  return {client,workers,timers};
}
test('reuse worker, preserve semantic failures, reject overlapping requests',async()=>{
  const {client,workers,timers}=setup();
  const a=client.prepare({documents:[]},true),w=workers[0];
  await assert.rejects(client.prepare({},true),/already busy/);
  w.onmessage({data:prepared(1)});
  assert.equal((await a).id,1);
  const b=client.prepare({},true);
  w.onmessage({data:{type:'error',id:2,error:{message:'invalid manuscript'}}});
  assert.equal((await b).type,'error');
  assert.equal(workers.length,1);
  assert.equal(timers.size,0);
  client.reset();assert.equal(w.closed,true);
});
test('reset invalidates old worker and resolves cancelled request',async()=>{
  const {client,workers}=setup();
  const a=client.prepare({},true),old=workers[0],late=old.onmessage;
  client.reset();assert.equal(await a,undefined);
  const b=client.prepare({},true);
  late({data:prepared(1)});
  workers[1].onmessage({data:prepared(2)});
  assert.equal((await b).id,2);
});
test('malformed response, worker failure and timeout close worker and permit retry',async()=>{
  const {client,workers,timers}=setup();
  const a=client.prepare({},true);workers[0].onmessage({data:prepared(999)});
  await assert.rejects(a,/Invalid/);assert.ok(workers[0].closed);
  const b=client.prepare({},true);workers[1].onerror();
  await assert.rejects(b,/failed/);assert.ok(workers[1].closed);
  const c=client.prepare({},true);[...timers.values()][0]();
  await assert.rejects(c,/timed out/);assert.ok(workers[2].closed);
  const d=client.prepare({},true);workers[3].onmessage({data:prepared(4)});
  assert.equal((await d).id,4);assert.equal(timers.size,0);
});

test('invalid matching-ID payloads trigger transport failure, not semantic failure',async()=>{
  const {client,workers,timers}=setup();
  const bad=[
    id=>({type:'error',id,error:null}),
    id=>prepared(id,{prepared:undefined}),
    id=>prepared(id,{preparationMs:-1}),
    id=>prepared(id,{work:{scan:{hits:0,misses:0},inline:{hits:0,misses:0,bypasses:-1}}}),
    id=>prepared(id,{prepared:{diagnostics:[],options:{revision:'old',fingerprint:'f',sections:[]}}}),
    id=>prepared(id,{prepared:{diagnostics:[],options:{revision:'r',fingerprint:'old',sections:[]}}})
  ];
  const payload={input:{rev:'r',fingerprint:'f'}};
  for(let i=0;i<bad.length;i++){
    const result=client.prepare(payload,true);
    workers[i].onmessage({data:bad[i](i+1)});
    await assert.rejects(result,/Invalid preparation worker response/);
    assert.ok(workers[i].closed);assert.equal(timers.size,0);
  }
  const result=client.prepare(payload,true);
  workers[bad.length].onmessage({data:prepared(bad.length+1,{prepared:{diagnostics:[],options:{revision:'r',fingerprint:'f',sections:[]}}})});
  assert.equal((await result).type,'prepared');
});
test('diagnostic-only and non-retained replies remain valid',async()=>{
  const {client,workers}=setup();
  const a=client.prepare({},true);
  workers[0].onmessage({data:prepared(1,{prepared:{diagnostics:[{message:'invalid manuscript'}]}})});
  assert.equal((await a).prepared.diagnostics.length,1);
  const b=client.prepare({},false);
  workers[0].onmessage({data:prepared(2,{work:null})});
  assert.equal((await b).work,null);
});

test('aborting pending preparation releases timeout and ignores stale messages',async()=>{
  const {client,workers,timers}=setup(),controller=new AbortController();
  const first=client.prepare({},true,controller.signal),old=workers[0],late=old.onmessage;
  controller.abort();assert.equal(await first,undefined);assert.equal(old.closed,true);assert.equal(timers.size,0);
  assert.equal(await client.prepare({},true,controller.signal),undefined);assert.equal(workers.length,1);
  const latest=client.prepare({},true);late({data:prepared(1)});workers[1].onmessage({data:prepared(2)});
  assert.equal((await latest).id,2);assert.equal(timers.size,0);
});
test('completed preparation detaches cancellation and preserves idle worker cache',async()=>{
  const {client,workers}=setup(),controller=new AbortController();
  const first=client.prepare({},true,controller.signal);workers[0].onmessage({data:prepared(1)});await first;
  const next=client.prepare({},true);controller.abort();assert.notEqual(workers[0].closed,true);
  workers[0].onmessage({data:prepared(2)});assert.equal((await next).id,2);assert.equal(workers.length,1);
});
test('latest scheduler request can start without waiting for obsolete worker response',async()=>{
  const {client,workers,timers}=setup(),tasks=[],scheduler=createLayoutScheduler({scheduleHandoff:fn=>tasks.push(fn)});
  const first=scheduler.submit((id,signal)=>client.prepare({},true,signal));
  const stale=workers[0].onmessage;
  const latest=scheduler.submit((id,signal)=>client.prepare({},true,signal));
  assert.equal(await first,undefined);assert.equal(workers[0].closed,true);assert.equal(tasks.length,1);
  tasks.shift()();stale({data:prepared(1)});workers[1].onmessage({data:prepared(2)});
  assert.equal((await latest).id,2);assert.equal(timers.size,0);
});
