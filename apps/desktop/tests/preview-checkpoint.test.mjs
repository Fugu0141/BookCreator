import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPreviewCheckpoint} from '../preview-checkpoint.mjs';

test('checkpoint yields only after budget and resets clock after task',async()=>{
  let time=0,yields=0;
  const checkpoint=createPreviewCheckpoint({current:()=>true,now:()=>time,yieldTask:async()=>{yields++;time+=20;}});
  time=7;assert.equal(checkpoint(),undefined);
  time=8;await checkpoint();assert.equal(yields,1);
  time=35;assert.equal(checkpoint(),undefined);
  time=36;await checkpoint();assert.equal(yields,2);
});

test('superseded preview is rejected even before the budget expires',()=>{
  let current=true;
  const checkpoint=createPreviewCheckpoint({current:()=>current,now:()=>0});
  checkpoint();current=false;
  assert.throws(()=>checkpoint(),/superseded/);
});

test('new input during a real task prevents obsolete preview from continuing',async()=>{
  let current=true,time=0;
  const checkpoint=createPreviewCheckpoint({current:()=>current,now:()=>time});
  setTimeout(()=>{current=false;},0);
  time=8;
  await assert.rejects(checkpoint(),/superseded/);
});

test('task errors are not hidden and invalid budgets are rejected',async()=>{
  let time=0;
  const failure=new Error('task failure');
  const checkpoint=createPreviewCheckpoint({current:()=>true,now:()=>time,yieldTask:async()=>{throw failure;}});
  time=8;await assert.rejects(checkpoint(),e=>e===failure);
  assert.throws(()=>createPreviewCheckpoint({current:()=>true,budgetMs:0}),TypeError);
});

test('stage gaps and provisional task budget reset exclude explicit task wait',async()=>{
  let time=0,yields=0;
  const checkpoint=createPreviewCheckpoint({current:()=>true,now:()=>time,yieldTask:async()=>{yields++;time+=50;}});
  time=3;checkpoint('validated');
  time=7;checkpoint('render-page');
  time=9;checkpoint.beforeExternalTask();
  time=109;checkpoint.resumeAfterTask();
  time=112;assert.equal(checkpoint('render-page'),undefined);
  time=118;await checkpoint('complete');
  const stats=checkpoint.snapshot();
  assert.equal(yields,1);assert.equal(stats.yields,1);
  assert.equal(stats.maxSliceMs,9);
  assert.deepEqual(stats.byStage['render-page'],{count:2,maxGapMs:4});
  assert.deepEqual(stats.byStage.provisional,{count:1,maxGapMs:2});
  assert.deepEqual(stats.byStage.complete,{count:1,maxGapMs:6});
  stats.byStage.complete.count=999;
  assert.equal(checkpoint.snapshot().byStage.complete.count,1);
});
test('diagnostics count superseded checkpoints without storing arbitrary stage names',()=>{
  let current=true,time=0;
  const checkpoint=createPreviewCheckpoint({current:()=>current,now:()=>time});
  time=2;checkpoint('unrecognized');
  current=false;time=3;assert.throws(()=>checkpoint('measure-block'),/superseded/);
  const stats=checkpoint.snapshot();
  assert.equal(stats.cancelled,1);assert.equal(stats.byStage.other.count,1);
  assert.equal(stats.byStage['measure-block'].count,1);
  assert.equal(Object.hasOwn(stats.byStage,'unrecognized'),false);
});
