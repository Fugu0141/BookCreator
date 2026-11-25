const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('bookcreator',Object.freeze({
  open:()=>ipcRenderer.invoke('bookcreator:open'),
  create:options=>ipcRenderer.invoke('bookcreator:create',options),
  readImage:id=>ipcRenderer.invoke('bookcreator:readImage',id),
  listImages:()=>ipcRenderer.invoke('bookcreator:listImages'),
  importImage:allowed=>ipcRenderer.invoke('bookcreator:importImage',allowed),
  importFont:rights=>ipcRenderer.invoke('bookcreator:importFont',rights),
  changeComponentLibrary:(revision,action)=>ipcRenderer.invoke('bookcreator:changeComponentLibrary',revision,action),
  saveHeadingDesign:(revision,design,level)=>ipcRenderer.invoke('bookcreator:saveHeadingDesign',revision,design,level),
  saveTypography:(revision,roles)=>ipcRenderer.invoke('bookcreator:saveTypography',revision,roles),
  readBook:()=>ipcRenderer.invoke('bookcreator:readBook'),
  saveBookSettings:(revision,settings)=>ipcRenderer.invoke('bookcreator:saveBookSettings',revision,settings),
  read:id=>ipcRenderer.invoke('bookcreator:read',id),
  save:(id,revision,text)=>ipcRenderer.invoke('bookcreator:save',id,revision,text)
}));
