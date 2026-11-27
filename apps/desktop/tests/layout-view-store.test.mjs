import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLayoutViewStore} from '../layout-view-store.mjs';
test('page jump draft only notifies toolbar subscribers, never the overview',()=>{
  const store=createLayoutViewStore(),before=store.getOverview(),toolbar=store.getToolbar();
  let overviewCalls=0,toolbarCalls=0;
  store.subscribeOverview(()=>overviewCalls++);
  const unsubscribe=store.subscribeToolbar(()=>toolbarCalls++);
  for(const value of ['','1','12','12'])store.dispatch({type:'page-jump',value});
  assert.equal(overviewCalls,0);
  assert.equal(toolbarCalls,3);
  assert.equal(store.getOverview(),before);
  assert.notEqual(store.getToolbar(),toolbar);
  assert.equal(store.getToolbar().pageJump,'12');
  unsubscribe();store.dispatch({type:'page-jump',value:'2'});
  assert.equal(toolbarCalls,3);
});
test('publication and selection expose coherent snapshots before any notification',()=>{
  const store=createLayoutViewStore(),seen=[];
  store.subscribeOverview(()=>seen.push([store.getOverview().activePage,store.getToolbar().pageJump,store.getSnapshot().layoutState.phase]));
  store.dispatch({type:'begin',scope:'book',retained:false});
  store.dispatch({type:'publish',scope:'book',pages:[{},{}],pageNumber:2,total:2});
  store.dispatch({type:'page',number:1});
  assert.deepEqual(seen,[[1,'1','running'],[2,'2','ready'],[1,'1','ready']]);
});
test('diagnostic visibility is overview-only; unchanged actions and separate stores are isolated',()=>{
  const a=createLayoutViewStore(),b=createLayoutViewStore(),before=a.getToolbar();
  let overview=0,toolbar=0;
  a.subscribeOverview(()=>overview++);a.subscribeToolbar(()=>toolbar++);
  a.dispatch({type:'toggle-diagnostics'});
  a.dispatch({type:'close-diagnostics'});
  a.dispatch({type:'close-diagnostics'});
  assert.equal(overview,2);assert.equal(toolbar,0);
  assert.equal(a.getToolbar(),before);
  assert.equal(b.getOverview().showDiagnostics,false);
  assert.notEqual(a.getSnapshot(),b.getSnapshot());
});
