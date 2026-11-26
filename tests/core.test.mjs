import test from 'node:test';
import assert from 'node:assert/strict';
import {requiredPreviewChecks,assessPreview} from '../dist/index.js';
test('unknown checks do not pass',()=>assert.equal(assessPreview({}).ready,false));
test('GUI and component editing are release gates',()=>{const c=Object.fromEntries(requiredPreviewChecks.map(k=>[k,'pass']));c['gui-editing']='not-run';c['component-editor']='fail';assert.deepEqual(assessPreview(c).missing,['gui-editing','component-editor']);});
test('all checks must pass',()=>assert.equal(assessPreview(Object.fromEntries(requiredPreviewChecks.map(k=>[k,'pass']))).ready,true));
import {editDocument,canAcceptLayout,canReviewLayout} from '../dist/index.js';
test('stale edit is rejected before adapter invocation',()=>{const s={documentId:'a',revision:2,source:'text'};assert.throws(()=>editDocument(s,1,[],()=>{assert.fail('adapter called')}));});
test('accepted edit creates new snapshot without modifying original',()=>{const s={documentId:'a',revision:2,source:'text'};const next=editDocument(s,2,[{start:0,end:4,expected:'text',replacement:'new'}],(source,edits)=>{assert.equal(source,'text');return edits[0].replacement;});assert.deepEqual(next,{documentId:'a',revision:3,source:'new'});assert.equal(s.source,'text');assert.equal(editDocument(s,2,[],x=>x),s);});
test('layout revision and fingerprint must match; partial not reviewable',()=>{const current={revision:'2',fingerprint:'a'};const partial={...current,completeness:'partial'};assert.equal(canAcceptLayout(current,partial),true);assert.equal(canReviewLayout(current,partial),false);assert.equal(canReviewLayout(current,{...partial,completeness:'full'}),false);assert.equal(canReviewLayout(current,{...partial,completeness:'full',publicationReady:false}),false);assert.equal(canReviewLayout(current,{...partial,completeness:'full',publicationReady:true}),true);assert.equal(canAcceptLayout(current,{...partial,fingerprint:'b'}),false);assert.equal(canAcceptLayout(current,{...partial,revision:'1'}),false);});


import {assertTrialPrintPlan,trialPrintStyles} from '../dist/index.js';
test('trial print validates revision, complete experimental plan, page order and paper',()=>{
  const current={revision:'2',fingerprint:'snapshot-a'},paper={width:148000,height:210000};
  const plan={...current,completeness:'full',publicationReady:false,pages:[{index:0},{index:1}],diagnostics:[]};
  assert.doesNotThrow(()=>assertTrialPrintPlan(current,plan,paper));
  assert.equal(canReviewLayout(current,plan),false);
  assert.equal(trialPrintStyles(paper),'@page{size:148mm 210mm;margin:0}html,body{margin:0;padding:0;background:white}');
  for(const bad of [{...plan,revision:'1'},{...plan,fingerprint:'other'},{...plan,completeness:'partial'},{...plan,publicationReady:true},{...plan,pages:[]},{...plan,pages:[{index:1}]},{...plan,pages:[{index:0},{index:0}]},{...plan,diagnostics:[{severity:'error'}]}])assert.throws(()=>assertTrialPrintPlan(current,bad,paper),RangeError);
  for(const bad of [{...paper,width:0},{...paper,height:300001},{...paper,width:148000.5},{...paper,width:'148mm'}]){
    assert.throws(()=>assertTrialPrintPlan(current,plan,bad),RangeError);
    assert.throws(()=>trialPrintStyles(bad),RangeError);
  }
  assert.doesNotThrow(()=>assertTrialPrintPlan(current,{...plan,diagnostics:[{severity:'warning'}]},paper));
});
