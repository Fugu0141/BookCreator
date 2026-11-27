// Only confirmed source changes are recorded. A superseded snapshot must
// not write to a controller installed for a different manuscript.
export function syncConfirmedRecovery(store,snapshot,controller,{candidate,isComposing,structuredComposing}){
  if(store.getRecovery()!==snapshot||!snapshot.file?.editable||candidate||isComposing||structuredComposing||!controller)return false;
  controller.update(snapshot.text);
  return true;
}
