// Route decisions are evaluated when an action is requested, not from the
// last React render. Settings are still owned by the workspace.
export function navigationState(store,{themeDirty=false,settingsDirty=false}={}){
  const {file,dirty}=store.getMetadata();
  return {file,dirty,unsaved:[dirty&&'原稿',themeDirty&&'テーマ',settingsDirty&&'書籍設定'].filter(Boolean)};
}
export function confirmNavigationDiscard(store,confirm,{project=false,themeDirty=false,settingsDirty=false}={}){
  const state=navigationState(store,{themeDirty,settingsDirty});
  if(project)return !state.unsaved.length||confirm('未保存の原稿・テーマ・書籍設定を破棄しますか？');
  return !state.dirty||confirm('未保存の変更を破棄しますか？');
}
export function manuscriptNavigationBlocked({routeBlocked,working,composing,drafts}){
  return !!(routeBlocked.current||working.current||composing.current||drafts.getActive());
}
export function canSaveBeforeClose(store,{themeDirty,themeEditable,settingsDirty,settingsValid}){
  const {file,dirty}=store.getMetadata();
  return (!dirty||!!file?.editable)&&(!themeDirty||!!themeEditable)&&(!settingsDirty||!!settingsValid);
}
// The read token belongs to the current main-process session. Do not change
// the ordering of discard and IPC; preserve recovery on cancelled/failed
// routes by resuming only the controller that still owns the workspace.
export async function withManuscriptDiscard({store,getController,candidate},run){
  const controller=getController();
  if(!controller||candidate)return run();
  const snapshot=store.getPreviewInput();
  const assertCurrent=()=>{if(getController()!==controller||store.getPreviewInput()!==snapshot)throw Error('原稿の復旧状態が変更されました。');};
  try{
    await controller.pause();
    assertCurrent();
    await controller.discard();
    assertCurrent();
    return await run();
  }finally{
    if(getController()===controller)controller.resume(store.getSnapshot().text);
  }
}
