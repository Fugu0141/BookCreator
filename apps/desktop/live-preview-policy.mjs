// Decide which visible preview needs work. No React, DOM, IPC or timers.
export function desiredLivePreviewScope({enabled,mode,paperVisible,hasBook,hasFile,hasPage,blocked,measuring,phase,scope,override}){
  if(!enabled||!hasBook||!hasPage||blocked||measuring)return null;
  if(mode==='writing'&&(!paperVisible||!hasFile))return null;
  if(['design','settings'].includes(mode)&&!paperVisible)return null;
  if(!['layout','writing','design','settings'].includes(mode))return null;
  const defaultScope=mode==='layout'||mode==='settings'||mode==='design'&&!hasFile?'book':'manuscript';
  const desired=override?.mode===mode?override.scope:defaultScope;
  if(!['book','manuscript'].includes(desired)||desired==='manuscript'&&!hasFile)return null;
  // Do not loop on a failed input. Changing scope or editing the input permits
  // another attempt. The latest completed result can be reused across screens.
  if(phase==='running'||(phase==='ready'||phase==='failed')&&scope===desired)return null;
  return desired;
}
