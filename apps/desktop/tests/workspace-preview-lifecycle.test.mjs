import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspacePreviewLifecycle} from '../workspace-preview-lifecycle.mjs';
import {createLivePreviewDelay} from '../live-preview-delay.mjs';

test('invalidation advances editor generation and cancels work before UI reset',()=>{
  const calls=[];
  const lifecycle=createWorkspacePreviewLifecycle({
    editPreviewTracker:{reset(){calls.push(['tracker',lifecycle.generation.current]);}},
    liveDelay:{cancel(){calls.push(['delay',lifecycle.generation.current]);}},
    layoutScheduler:{invalidate(){calls.push(['scheduler',lifecycle.generation.current]);}}
  });
  lifecycle.pendingDiagnostic.current={range:{start:0,end:1}};
  lifecycle.pendingSource.current={id:'chapter'};
  lifecycle.invalidate();
  assert.deepEqual(calls,[['tracker',0],['delay',1],['scheduler',1]]);
  assert.equal(lifecycle.pendingDiagnostic.current,null);
  assert.equal(lifecycle.pendingSource.current,null);
  lifecycle.invalidate();
  assert.equal(lifecycle.generation.current,2);
});
test('real scheduler invalidates active and queued work; cancelled delayed callback cannot run',async()=>{
  let delayed,release,ran=false,activeId;
  const hold=new Promise(resolve=>{release=resolve;});
  const lifecycle=createWorkspacePreviewLifecycle({
    liveDelay:createLivePreviewDelay({schedule:fn=>{delayed=fn;return 1;},unschedule:()=>{}})
  });
  const active=lifecycle.layoutScheduler.submit(async id=>{activeId=id;await hold;});
  const queued=lifecycle.layoutScheduler.submit(()=>{ran=true;});
  lifecycle.liveDelay.request(()=>{ran=true;});
  assert.equal(lifecycle.generation.current,0);
  lifecycle.invalidate();
  delayed();
  assert.equal(lifecycle.layoutScheduler.isCurrent(activeId),false);
  await queued;release();await active;
  assert.equal(ran,false);
  assert.equal(await lifecycle.layoutScheduler.submit(()=>42),42);
  assert.equal(lifecycle.generation.current,1);
});
test('workspace lifecycles do not share editor generations or controller instances',()=>{
  const a=createWorkspacePreviewLifecycle(),b=createWorkspacePreviewLifecycle();
  a.pendingSource.current={id:'a'};
  b.pendingSource.current={id:'b'};
  a.invalidate();
  assert.equal(b.generation.current,0);
  assert.deepEqual(b.pendingSource.current,{id:'b'});
  for(const key of ['layoutScheduler','liveDelay','paperDisplay','cancelledPreviewLog','editPreviewTracker'])assert.notEqual(a[key],b[key]);
});
