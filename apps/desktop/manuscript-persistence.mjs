import {manuscriptDirty} from './manuscript-state.mjs';

// The workspace owns the I/O lock and UI policy. This transaction owns the
// exact document and revision submitted to IPC, and the matching recovery session.
export async function persistManuscript({store,getController,save,onRecoveryError=()=>{}}){
  const snapshot=store.getSnapshot();
  if(!manuscriptDirty(snapshot))return null;
  const {file,text}=snapshot;
  if(!file.editable)throw Error('読み取り専用の原稿は保存できません。');
  const controller=getController();
  let activeFile=file;
  const owns=()=>store.getSnapshot().file===activeFile&&getController()===controller;
  try{
    await controller?.pause();
    if(!owns())throw Error('保存対象の原稿が切り替わりました。');
    const saved=await save(file.id,file.revision,text);
    if(!owns())throw Error('原稿は保存されましたが、現在の原稿が切り替わりました。');
    store.dispatch({type:'saved',file,value:text,revision:saved.revision});
    activeFile=store.getSnapshot().file;
    try{await controller?.saved(saved.revision,text);}
    catch(error){if(owns())onRecoveryError(error);}
    return saved;
  }finally{
    // A new draft may have arrived while saving. Never reset its recovery
    // text to the submitted snapshot, or resume another document's session.
    if(owns())controller?.resume(store.getSnapshot().text);
  }
}
