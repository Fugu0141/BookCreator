import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLayoutViewState,reduceLayoutViewState as reduce} from '../layout-view-state.mjs';
const ready=()=>{
  const started=reduce(createLayoutViewState(),{type:'begin',scope:'manuscript',retained:false});
  return reduce(reduce(started,{type:'publish',scope:'manuscript',pages:[{id:1},{id:2}],pageNumber:2,total:2}),{type:'finish'});
};
test('begin and publish update the visible projection in one action',()=>{
  const initial=createLayoutViewState(),running=reduce(initial,{type:'begin',scope:'book',retained:false});
  assert.deepEqual(running.layoutState,{phase:'running',scope:'book',pages:0});
  assert.equal(running.measuring,true);
  const pages=[{id:1}],published=reduce(running,{type:'publish',scope:'book',pages,pageNumber:1,total:1});
  assert.equal(published.layoutPages,pages);
  assert.deepEqual(published.layoutState,{phase:'ready',scope:'book',pages:1});
  assert.equal(reduce(published,{type:'finish'}).measuring,false);
});
test('retained invalidation preserves previous page identity and repeated edits are no-ops',()=>{
  const previous=ready(),action={type:'invalidate',retained:true,clear:false};
  const stale=reduce(previous,action);
  assert.equal(stale.layoutPages,previous.layoutPages);
  assert.equal(stale.activePage,2);
  assert.deepEqual(stale.layoutState,{phase:'stale',scope:'manuscript',pages:0});
  assert.equal(reduce(stale,action),stale);
  assert.equal(reduce(stale,{type:'finish'}),stale);
});
test('failure retains old paper metadata but clear removes it and closes diagnostics',()=>{
  const previous=ready(),running=reduce(previous,{type:'begin',scope:'manuscript',retained:true});
  const records=[{code:'PREVIEW_FAILED'}],failed=reduce(running,{type:'fail',scope:'manuscript',diagnostics:records});
  assert.equal(failed.layoutPages,previous.layoutPages);
  assert.equal(failed.layoutDiagnostics,records);
  const open=reduce(failed,{type:'toggle-diagnostics'});
  const cleared=reduce(open,{type:'invalidate',clear:true,retained:false});
  assert.deepEqual(cleared,createLayoutViewState());
});
test('page selection and jump draft are independent of phase, duplicate updates preserve identity',()=>{
  const previous=ready(),draft=reduce(previous,{type:'page-jump',value:''});
  assert.equal(draft.activePage,2);
  assert.equal(draft.pageJump,'');
  const selected=reduce(draft,{type:'page',number:1});
  assert.equal(selected.pageJump,'1');
  assert.equal(selected.layoutState,previous.layoutState);
  assert.equal(reduce(selected,{type:'page',number:1}),selected);
});
