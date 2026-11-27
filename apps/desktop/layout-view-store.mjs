import {createLayoutViewState,reduceLayoutViewState} from './layout-view-state.mjs';
const overviewKeys=['layoutState','layoutDiagnostics','showDiagnostics','layoutPages','activePage','measuring'];
const toolbarKeys=['layoutState','layoutPages','activePage','pageJump'];
function project(state,keys,previous){
  if(previous&&keys.every(key=>Object.is(previous[key],state[key])))return previous;
  return Object.fromEntries(keys.map(key=>[key,state[key]]));
}
// The reducer remains the single writer. A projection has a stable snapshot
// and an independent subscription; notify only after all snapshots are updated.
export function createLayoutViewStore(){
  let state=createLayoutViewState(),overview=project(state,overviewKeys),toolbar=project(state,toolbarKeys);
  const overviewListeners=new Set(),toolbarListeners=new Set();
  const subscribe=listeners=>listener=>{listeners.add(listener);return ()=>listeners.delete(listener);};
  function dispatch(action){
    const next=reduceLayoutViewState(state,action);
    if(next===state)return;
    const nextOverview=project(next,overviewKeys,overview),nextToolbar=project(next,toolbarKeys,toolbar);
    const overviewChanged=nextOverview!==overview,toolbarChanged=nextToolbar!==toolbar;
    state=next;overview=nextOverview;toolbar=nextToolbar;
    if(overviewChanged)for(const listener of [...overviewListeners])listener();
    if(toolbarChanged)for(const listener of [...toolbarListeners])listener();
  }
  return {dispatch,getSnapshot:()=>state,getOverview:()=>overview,getToolbar:()=>toolbar,subscribeOverview:subscribe(overviewListeners),subscribeToolbar:subscribe(toolbarListeners)};
}
