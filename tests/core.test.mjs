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

import {createEquationResolverFactory,createEquationResolver} from '../dist/manuscript-poc.js';
test('equation resolution indexes targets once per prepared snapshot, not per paragraph or slot',()=>{
  const items=[
    {kind:'math',text:'x',equationNumber:'1.1',origin:{persistentId:'first',documentId:'a'}},
    {kind:'study',origin:{documentId:'b'},componentEquations:[{id:'nested',equationNumber:'2.1',formula:'y'}]}
  ];
  let passes=0;
  Object.defineProperty(items,'flatMap',{value(fn){passes++;return Array.prototype.flatMap.call(this,fn);}});
  const calls=[];
  const deps={parseReference(token,doc,offset){assert.equal(this,deps);calls.push([doc,offset]);const [target,format]=token.split(':');return {reference:{target,format},diagnostics:[]};}};
  const resolve=createEquationResolverFactory(items,deps);
  for(let i=0;i<100;i++)assert.equal(resolve('a')('nested:number',i),'2.1');
  assert.equal(resolve('a'),resolve('a'));
  assert.notEqual(resolve('a'),resolve('b'));
  assert.equal(resolve('b')('first:label-number',7),'式 (1.1)');
  assert.equal(passes,1);
  assert.deepEqual(calls.at(-1),['b',7]);
  for(const token of ['missing:number','first:page'])assert.throws(()=>resolve('b')(token,0),/Unresolved equation reference/);
  items[0].equationNumber='1.2';
  assert.equal(resolve('b')('first:number',0),'1.1','existing index is a snapshot');
  assert.equal(createEquationResolverFactory(items,deps)('b')('first:number',0),'1.2','new preparation sees new numbering');
  assert.equal(createEquationResolver(items,deps,'a')('first:number',0),'1.2');
  assert.equal(passes,3);
  assert.equal(createEquationResolverFactory(items,{})('a'),undefined);
  assert.equal(passes,3,'no reference parser means no index');
});
