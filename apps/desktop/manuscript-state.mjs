// Source text, saved baseline and structured history share one state owner.
// No DOM, IPC, recovery timers or IME events belong in this pure model.
export function createManuscriptState(){return {file:null,text:'',history:null};}
export function manuscriptDirty(state){return !!state.file&&state.text!==state.file.text;}
export function activeStructuredHistory(state){
  const history=state.history;
  return history&&history.fileId===state.file?.id&&history.current===state.text?history:null;
}
function change(state,patch){
  return Object.keys(patch).every(key=>Object.is(state[key],patch[key]))?state:{...state,...patch};
}
export function reduceManuscriptState(state,action){
  switch(action.type){
    case 'clear':return change(state,createManuscriptState());
    case 'install':return change(state,{file:action.file,text:action.file.text,history:null});
    case 'edit':return change(state,{text:action.value,history:action.history??null});
    case 'editable':return !state.file||state.file.editable===action.editable?state:change(state,{file:{...state.file,editable:action.editable}});
    case 'saved':
      // A completion belongs to the exact file snapshot passed to IPC.
      // Do not overwrite a newer draft; only its saved baseline advances.
      return state.file!==action.file?state:change(state,{file:{...state.file,text:action.value,revision:action.revision}});
    case 'clear-history':return change(state,{history:null});
    default:throw Error('Unknown manuscript action: '+action.type);
  }
}
export function planStructuredCommit(state,next){
  if(!state.file||next===state.text)return null;
  const past=[...(activeStructuredHistory(state)?.past??[]),state.text].slice(-20);
  let size=past.reduce((sum,s)=>sum+s.length,0);
  while(size>1000000&&past.length)size-=past.shift().length;
  return {fileId:state.file.id,current:next,past,future:[]};
}
export function planStructuredHistoryMove(state,action){
  const history=activeStructuredHistory(state);
  if(!history||!['undo','redo'].includes(action))return null;
  const {past,future}=history;
  const next=action==='undo'?past.at(-1):future[0];
  if(next===undefined)return null;
  return {fileId:state.file.id,current:next,past:action==='undo'?past.slice(0,-1):[...past,state.text],future:action==='undo'?[state.text,...future]:future.slice(1)};
}
