import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createManuscriptStore} from '../manuscript-store.mjs';
import {createLivePreviewDelay} from '../live-preview-delay.mjs';
import {reserveLivePreview} from '../live-preview-reservation.mjs';
function setup(){
  const store=createManuscriptStore(),generation={current:0},tasks=[],calls=[];
  store.dispatch({type:'install',file:{id:'a',text:'原稿',editable:true,revision:'r1'}});
  const delay=createLivePreviewDelay({schedule:(run,wait)=>{tasks.push({run,wait});return tasks.length;},unschedule:()=>{}});
  const policy={enabled:true,mode:'writing',paperVisible:true,hasBook:true,hasPage:true,blocked:false,measuring:false,phase:'stale',scope:'manuscript'};
  let blocked=false;
  const reserve=(patch={})=>reserveLivePreview({store,snapshot:store.getPreviewInput(),delay,generation,policy,retained:true,warmRetained:()=>true,isBlocked:()=>blocked,onRender:(whole,snapshot)=>calls.push([whole,snapshot.text]),...patch});
  return {store,generation,tasks,calls,policy,reserve,block:()=>{blocked=true;}};
}
test('warm manuscript reservation coalesces edits and publishes only the newest snapshot',()=>{
  const s=setup(),cancel=s.reserve();
  assert.equal(s.tasks[0].wait,16);
  s.store.dispatch({type:'edit',value:'新しい原稿'});
  cancel();s.reserve();
  s.tasks[0].run();s.tasks[1].run();
  assert.deepEqual(s.calls,[[false,'新しい原稿']]);
});
test('stale source, operation generation, current block and cleanup prevent a queued render',()=>{
  for(const invalidate of [s=>s.store.dispatch({type:'edit',value:'new'}),s=>s.generation.current++,s=>s.block(),(s,cancel)=>cancel()]){
    const s=setup(),cancel=s.reserve();invalidate(s,cancel);s.tasks[0].run();
    assert.deepEqual(s.calls,[]);
  }
});
test('book scope stays conservative, hidden or blocked previews do not reserve',()=>{
  const s=setup();
  s.reserve({policy:{...s.policy,mode:'layout'}});
  assert.equal(s.tasks[0].wait,100);
  s.tasks[0].run();assert.deepEqual(s.calls,[[true,'原稿']]);
  for(const patch of [{paperVisible:false},{blocked:true},{phase:'running'},{phase:'failed'}])s.reserve({policy:{...s.policy,...patch}});
  assert.equal(s.tasks.length,1);
});
test('preview input observes text and revision, not history-only changes',()=>{
  const s=setup();let notifications=0;const stop=s.store.subscribePreviewInput(()=>notifications++);
  const f=s.store.getPreviewInput().file;
  s.store.dispatch({type:'edit',value:'B',history:{fileId:'a',current:'B',past:['原稿'],future:[]}});
  const snapshot=s.store.getPreviewInput();
  s.store.dispatch({type:'clear-history'});
  assert.equal(s.store.getPreviewInput(),snapshot);assert.equal(notifications,1);
  s.store.dispatch({type:'saved',file:f,value:'B',revision:'r2'});
  assert.equal(notifications,2);stop();
});

test('short-window reservation retains latest-only and IME/block safety',()=>{
  const s=setup(),cancel=s.reserve({shortWarmWindow:true});
  assert.equal(s.tasks[0].wait,8);
  s.store.dispatch({type:'edit',value:'新'});cancel();s.reserve({shortWarmWindow:true});
  s.tasks[0].run();s.tasks[1].run();assert.deepEqual(s.calls,[[false,'新']]);
  s.reserve({shortWarmWindow:true,warmRetained:()=>false});assert.equal(s.tasks[2].wait,100);
  s.block();s.tasks[2].run();assert.deepEqual(s.calls,[[false,'新']]);
});
