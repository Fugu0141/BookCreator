import {test} from 'node:test';
import assert from 'node:assert/strict';
import {editorBurstSize,editorSubscriptionPlan,summarizeEditorSubscription} from '../benchmark-editor-subscription.mjs';
test('subscription comparison uses equal workloads and reverses arm order',()=>{
  const plan=editorSubscriptionPlan();
  assert.equal(editorBurstSize,20);
  assert.deepEqual(plan,[{pair:1,order:['full','metadata']},{pair:2,order:['metadata','full']}]);
});
test('editor report pools samples per mode without mixing commit counts or timing',()=>{
  const row=(mode,workspace,inputMs)=>({mode,edits:inputMs.length,counts:{workspace,source:inputMs.length,structured:0},inputMs});
  const result=summarizeEditorSubscription([row('full',3,[1,4]),row('metadata',1,[2,3]),row('metadata',0,[2,4]),row('full',2,[5,6])]);
  assert.deepEqual(result.full,{runs:2,edits:4,workspaceCommits:5,sourceCommits:4,input:{count:4,median:4.5,p95:6}});
  assert.deepEqual(result.metadata,{runs:2,edits:4,workspaceCommits:1,sourceCommits:4,input:{count:4,median:2.5,p95:4}});
});
