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
