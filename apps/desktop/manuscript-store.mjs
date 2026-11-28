import {createManuscriptState,reduceManuscriptState,manuscriptDirty,activeStructuredHistory} from './manuscript-state.mjs';

function projection(previous,next){
  return previous&&Object.keys(next).every(key=>Object.is(previous[key],next[key]))?previous:next;
}
const sourceOf=state=>({fileId:state.file?.id??null,hasFile:!!state.file,editable:!!state.file?.editable,value:state.text});
function metadataOf(state){
  const history=activeStructuredHistory(state);
  return {file:state.file,dirty:manuscriptDirty(state),undo:!!history?.past.length,redo:!!history?.future.length};
}
// Single workspace writer; all projections are committed before notifying
// subscribers. The full-state subscriber is a compatibility bridge while
// recovery, layout scheduling and navigation are migrated independently.
export function createManuscriptStore(){
  let state=createManuscriptState(),source=sourceOf(state),metadata=metadataOf(state);
  const listeners=new Set(),sourceListeners=new Set(),metadataListeners=new Set();
  const subscribe=set=>listener=>{set.add(listener);return ()=>set.delete(listener);};
  function dispatch(action){
    const next=reduceManuscriptState(state,action);
    if(next===state)return;
    const nextSource=projection(source,sourceOf(next)),nextMetadata=projection(metadata,metadataOf(next));
    const sourceChanged=nextSource!==source,metadataChanged=nextMetadata!==metadata;
    state=next;source=nextSource;metadata=nextMetadata;
    for(const listener of [...listeners])listener();
    if(sourceChanged)for(const listener of [...sourceListeners])listener();
    if(metadataChanged)for(const listener of [...metadataListeners])listener();
  }
  return {dispatch,getSnapshot:()=>state,subscribe:subscribe(listeners),getSource:()=>source,subscribeSource:subscribe(sourceListeners),getMetadata:()=>metadata,subscribeMetadata:subscribe(metadataListeners)};
}
