// Decide which visible preview needs work. No React, DOM, IPC or timers.
export function desiredLivePreviewScope({enabled,mode,paperVisible,hasBook,hasFile,hasPage,blocked,measuring,phase,scope,override}){
  if(!enabled||!hasBook||!hasPage||blocked||measuring)return null;
  if(mode!=='layout'&&(mode!=='writing'||!paperVisible||!hasFile))return null;
  const desired=override?.mode===mode?override.scope:mode==='layout'?'book':'manuscript';
  if(!['book','manuscript'].includes(desired)||desired==='manuscript'&&!hasFile)return null;
  // Do not loop on a failed input. Changing scope or editing the input permits
  // another attempt. The latest completed result can be reused across screens.
  if(phase==='running'||(phase==='ready'||phase==='failed')&&scope===desired)return null;
  return desired;
}
