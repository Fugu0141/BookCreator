import {planStructuredCommit,planStructuredHistoryMove} from './manuscript-state.mjs';

// Structured commands use source ranges rather than the hidden textarea.
// Capture the active draft too, including an explicit null if no draft is open.
export function captureStructuredCommand({store,drafts,generation},source,draft=drafts.getSnapshot()){
  const snapshot=store.getSnapshot();
  if(!snapshot.file?.editable||snapshot.text!==source||drafts.getSnapshot()!==draft)return null;
  return {file:snapshot.file,text:snapshot.text,draft,job:generation.current};
}
export function isStructuredCommandCurrent({store,drafts,generation},command){
  if(!command)return false;
  const {file,text}=store.getSnapshot();
  return file===command.file&&text===command.text&&drafts.getSnapshot()===command.draft&&generation.current===command.job;
}
export function assertStructuredCommandCurrent(deps,command){
  if(!isStructuredCommandCurrent(deps,command))throw Error('原稿または構造編集の状態が変更されました。');
}
export function commitStructuredCommand(deps,command,next,edit){
  assertStructuredCommandCurrent(deps,command);
  const history=planStructuredCommit(deps.store.getSnapshot(),next);
  if(!history)return false;
  edit(next,history);
  return true;
}
export function moveStructuredHistory(store,action,edit){
  const state=store.getSnapshot();
  if(!state.file?.editable)return false;
  const history=planStructuredHistoryMove(state,action);
  if(!history)return false;
  edit(history.current,history);
  return true;
}
