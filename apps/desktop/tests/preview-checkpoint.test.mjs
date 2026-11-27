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
