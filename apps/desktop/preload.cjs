const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('bookcreator',Object.freeze({
  open:()=>ipcRenderer.invoke('bookcreator:open'),
  create:options=>ipcRenderer.invoke('bookcreator:create',options),
  importFont:rights=>ipcRenderer.invoke('bookcreator:importFont',rights),
  saveTypography:(revision,roles)=>ipcRenderer.invoke('bookcreator:saveTypography',revision,roles),
  read:id=>ipcRenderer.invoke('bookcreator:read',id),
  save:(id,revision,text)=>ipcRenderer.invoke('bookcreator:save',id,revision,text)
}));
