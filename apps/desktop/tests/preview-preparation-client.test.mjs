import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreparationClient} from '../preview-preparation-client.mjs';
function setup(){
  const workers=[],timers=new Map();let timer=0;
  const client=createPreparationClient({spawn(){const w={messages:[],terminate(){this.closed=true;},postMessage(m){this.messages.push(m);}};workers.push(w);return w;},schedule(fn){timers.set(++timer,fn);return timer;},unschedule(id){timers.delete(id);}});
  return {client,workers,timers};
}
test('reuse worker, preserve semantic failures, reject overlapping requests',async()=>{
  const {client,workers,timers}=setup();
  const a=client.prepare({documents:[]},true),w=workers[0];
  await assert.rejects(client.prepare({},true),/already busy/);
  w.onmessage({data:{type:'prepared',id:1,prepared:{}}});
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
  late({data:{type:'prepared',id:1}});
  workers[1].onmessage({data:{type:'prepared',id:2}});
  assert.equal((await b).id,2);
});
test('malformed response, worker failure and timeout close worker and permit retry',async()=>{
  const {client,workers,timers}=setup();
  const a=client.prepare({},true);workers[0].onmessage({data:{id:999,type:'prepared'}});
  await assert.rejects(a,/Invalid/);assert.ok(workers[0].closed);
  const b=client.prepare({},true);workers[1].onerror();
  await assert.rejects(b,/failed/);assert.ok(workers[1].closed);
  const c=client.prepare({},true);[...timers.values()][0]();
  await assert.rejects(c,/timed out/);assert.ok(workers[2].closed);
  const d=client.prepare({},true);workers[3].onmessage({data:{id:4,type:'prepared'}});
  assert.equal((await d).id,4);assert.equal(timers.size,0);
});
