const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('bookcreator',Object.freeze({
  open:()=>ipcRenderer.invoke('bookcreator:open'),
  read:id=>ipcRenderer.invoke('bookcreator:read',id),
  save:(id,revision,text)=>ipcRenderer.invoke('bookcreator:save',id,revision,text)
}));
