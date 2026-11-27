import test from 'node:test';
import assert from 'node:assert/strict';
import {invalidateLayoutState,emptyIfNeeded} from '../layout-invalidation-state.mjs';
test('first invalidation changes layout, repeated invalidation preserves identity',()=>{
  for(const phase of ['ready','running','failed']){
    const initial={phase,scope:'manuscript',pages:3};
    const stale=invalidateLayoutState(initial);
    assert.deepEqual(stale,{phase:'stale',scope:'manuscript',pages:0});
    assert.notEqual(stale,initial);
    for(let i=0;i<100;i++)assert.equal(invalidateLayoutState(stale),stale);
    const idle=invalidateLayoutState(stale,true);
    assert.deepEqual(idle,{phase:'idle',scope:null,pages:0});
    assert.equal(invalidateLayoutState(idle,true),idle);
    assert.equal(invalidateLayoutState(idle),idle);
  }
});
test('clearing metadata preserves empty array identity but removes existing data',()=>{
  const empty=[],full=[{page:1}];
  assert.equal(emptyIfNeeded(empty),empty);
  assert.deepEqual(emptyIfNeeded(full),[]);
  assert.equal(full.length,1);
});
