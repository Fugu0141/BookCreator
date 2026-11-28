// Source commands capture a document, DOM selection and operation generation
// together. A planner must not apply a result to a superseding edit or read.
export function captureSourceCommand({store,textarea,generation,composing}){
  const {file,text}=store.getSnapshot(),node=textarea.current;
  if(!file?.editable||!node||composing.current)return null;
  if(node.value!==text)throw Error('原稿の編集状態が変わりました。再選択してください。');
  return {file,text,node,start:node.selectionStart,end:node.selectionEnd,job:generation.current};
}
export function isSourceCommandCurrent({store,textarea,generation,composing},command){
  const {file,text}=store.getSnapshot(),{node,start,end,job}=command;
  return file===command.file&&text===command.text&&textarea.current===node&&
    generation.current===job&&!composing.current&&node.value===text&&
    node.selectionStart===start&&node.selectionEnd===end;
}
export function applySourceCommand(deps,command,plan,applyPatches,commit){
  const assertCurrent=()=>{
    if(!isSourceCommandCurrent(deps,command))throw Error('原稿の編集状態が変わりました。再選択してください。');
  };
  assertCurrent();
  const planned=plan(command);
  const next=applyPatches(command.text,[planned.patch]);
  assertCurrent();
  commit(next);
  return {planned,next};
}

// Modal drafts own their original range, not the live textarea selection.
// The user can move focus into a formula field without invalidating that range.
export function captureDraftCommand(deps,draft){
  const {store,textarea,generation,composing}=deps;
  const {file,text}=store.getSnapshot(),node=textarea.current;
  if(!draft||!file?.editable||!node||composing.current||
     file.id!==draft.fileId||file.revision!==draft.revision||text!==draft.source||
     generation.current!==draft.job||node.value!==text||
     (draft.origin&&draft.origin.file!==file)||(draft.origin&&draft.origin.node!==node))return null;
  return {file,text,node,job:draft.job,start:draft.start,end:draft.end};
}
export function isDraftCommandCurrent({store,textarea,generation,composing},command){
  if(!command)return false;
  const {file,text}=store.getSnapshot();
  return file===command.file&&text===command.text&&textarea.current===command.node&&
    generation.current===command.job&&!composing.current&&command.node.value===text;
}
