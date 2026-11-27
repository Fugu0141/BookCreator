import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEditPreviewMetrics,createEditPreviewTracker,summarizeEditPreviewMetrics} from '../edit-preview-metrics.mjs';

function fixture(){
  const metrics=createEditPreviewMetrics(),frames=new Map();
  let time=0,id=0,current=true,visible=true;
  const tracker=createEditPreviewTracker({metrics,now:()=>time,schedule:cb=>{frames.set(++id,cb);return id;},cancel:id=>frames.delete(id)});
  return {metrics,tracker,frames,time:t=>{time=t;},current:v=>{current=v;},visible:v=>{visible=v;},
    publish:()=>tracker.publish({scope:'manuscript',mode:'retained',current:()=>current,visible:()=>visible}),
    tick(t){time=t;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(cb=>cb());}};
}
test('latest edit includes debounce and DOM time; records after two frames',()=>{
  const f=fixture();f.tracker.mark();f.time(30);f.tracker.mark();
  f.time(170);f.publish();f.tick(180);assert.deepEqual(f.metrics.snapshot(),[]);
  f.tick(196);assert.deepEqual(f.metrics.snapshot(),[{scope:'manuscript',mode:'retained',domMs:140,frameMs:166}]);
  f.publish();f.tick(220);f.tick(240);assert.equal(f.metrics.snapshot().length,1);
});
test('superseded frame cannot record and new edit gets its own sample',()=>{
  const f=fixture();f.tracker.mark();f.time(100);f.publish();f.tick(110);
  f.tracker.mark();assert.equal(f.frames.size,0);
  f.tick(120);assert.deepEqual(f.metrics.snapshot(),[]);
  f.time(150);f.publish();f.tick(160);f.tick(176);
  assert.equal(f.metrics.snapshot()[0].domMs,40);
});
test('hidden, stale, and cleared samples are discarded',()=>{
  for(const invalidate of [f=>f.visible(false),f=>f.current(false),f=>f.metrics.clear(),f=>f.tracker.reset()]){
    const f=fixture();f.tracker.mark();f.time(100);f.publish();f.tick(110);
    invalidate(f);f.tick(126);assert.deepEqual(f.metrics.snapshot(),[]);
  }
  const f=fixture();f.tracker.mark();f.metrics.clear();f.time(100);f.publish();assert.equal(f.frames.size,0);
});
test('bounded numeric records are isolated and grouped by scope and mode',()=>{
  const m=createEditPreviewMetrics(3),record=(scope,mode,domMs,frameMs)=>m.record({scope,mode,domMs,frameMs,source:'not stored'},m.epoch());
  assert.equal(record('book','full',10,9),false);
  assert.equal(record('book','unknown',10,20),false);
  record('book','full',1,2);record('manuscript','retained',30,40);record('manuscript','retained',10,20);record('book','fallback',50,60);
  const rows=m.snapshot();assert.deepEqual(Object.keys(rows[0]),['scope','mode','domMs','frameMs']);
  rows[0].domMs=999;assert.equal(m.snapshot()[0].domMs,30);
  assert.deepEqual(summarizeEditPreviewMetrics(m.snapshot())[0],{scope:'manuscript',mode:'retained',count:2,dom:{median:20,p95:30},frame:{median:30,p95:40}});
  m.clear();assert.deepEqual(m.snapshot(),[]);
});
