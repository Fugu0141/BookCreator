import test from 'node:test';
import assert from 'node:assert/strict';
import {createLayoutRequestGate} from '../layout-request-gate.mjs';

test('new render supersedes older result regardless of completion order',async()=>{
  const gate=createLayoutRequestGate(),applied=[];
  let resolveOld,resolveNew;
  const old=new Promise(resolve=>{resolveOld=resolve;});
  const latest=new Promise(resolve=>{resolveNew=resolve;});
  const commit=async(request,result)=>{const value=await result;if(gate.isCurrent(request))applied.push(value);};
  const first=commit(gate.begin(),old);
  const second=commit(gate.begin(),latest);
  resolveNew('new');await second;
  resolveOld('old');await first;
  assert.deepEqual(applied,['new']);
});

test('edit or target invalidation rejects pending results and old paper callbacks',()=>{
  const gate=createLayoutRequestGate(),first=gate.begin();
  assert.equal(gate.isCurrent(first),true);
  gate.invalidate();
  assert.equal(gate.isCurrent(first),false);
  const next=gate.begin();
  assert.equal(gate.isCurrent(first),false);
  assert.equal(gate.isCurrent(next),true);
});

test('independent workspaces do not supersede each other',()=>{
  const a=createLayoutRequestGate(),b=createLayoutRequestGate();
  const request=a.begin();
  b.begin();b.invalidate();
  assert.equal(a.isCurrent(request),true);
});
