import {invalidateLayoutState,emptyIfNeeded} from './layout-invalidation-state.mjs';

// UI-only projection. Scheduler authority and DOM ownership remain outside.
export function createLayoutViewState(){
  return {layoutState:{phase:'idle',scope:null,pages:0},layoutDiagnostics:[],showDiagnostics:false,layoutPages:[],activePage:1,pageJump:'1',measuring:false};
}
function change(previous,patch){
  return Object.keys(patch).every(key=>Object.is(previous[key],patch[key]))?previous:{...previous,...patch};
}
function resetFields(state,retained){
  return {
    layoutDiagnostics:emptyIfNeeded(state.layoutDiagnostics),showDiagnostics:false,
    ...(!retained?{layoutPages:emptyIfNeeded(state.layoutPages),activePage:1,pageJump:'1'}:{})
  };
}
export function reduceLayoutViewState(state,action){
  switch(action.type){
    case 'invalidate':return change(state,{...resetFields(state,action.retained&&!action.clear),measuring:false,layoutState:invalidateLayoutState(state.layoutState,action.clear)});
    case 'begin':return change(state,{...resetFields(state,action.retained),measuring:true,layoutState:{phase:'running',scope:action.scope,pages:0}});
    case 'publish':return change(state,{layoutPages:action.pages,activePage:action.pageNumber,pageJump:String(action.pageNumber),layoutState:{phase:'ready',scope:action.scope,pages:action.total}});
    case 'fail':return change(state,{layoutState:{phase:'failed',scope:action.scope,pages:0},layoutDiagnostics:action.diagnostics});
    case 'finish':return change(state,{measuring:false});
    case 'page':return change(state,{activePage:action.number,pageJump:String(action.number)});
    case 'page-jump':return change(state,{pageJump:action.value});
    case 'close-diagnostics':return change(state,{showDiagnostics:false});
    case 'toggle-diagnostics':return change(state,{showDiagnostics:!state.showDiagnostics});
    default:throw Error('Unknown layout view action: '+action.type);
  }
}
