const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('bookcreator',Object.freeze({
  onCloseRequested:callback=>{
    const listener=(_event,token)=>callback(token);
    ipcRenderer.on('bookcreator:close-requested',listener);
    return ()=>ipcRenderer.removeListener('bookcreator:close-requested',listener);
  },
  completeClose:(token,decision)=>ipcRenderer.invoke('bookcreator:complete-close',token,decision),
  open:()=>ipcRenderer.invoke('bookcreator:open'),
  listProjects:()=>ipcRenderer.invoke('bookcreator:listProjects'),
  openRegisteredProject:id=>ipcRenderer.invoke('bookcreator:openRegisteredProject',id),
  favoriteProject:(id,value)=>ipcRenderer.invoke('bookcreator:favoriteProject',id,value),
  forgetProject:id=>ipcRenderer.invoke('bookcreator:forgetProject',id),
  create:options=>ipcRenderer.invoke('bookcreator:create',options),
  readImage:id=>ipcRenderer.invoke('bookcreator:readImage',id),
  listImages:()=>ipcRenderer.invoke('bookcreator:listImages'),
  importImage:allowed=>ipcRenderer.invoke('bookcreator:importImage',allowed),
  importFont:rights=>ipcRenderer.invoke('bookcreator:importFont',rights),
  changeComponentLibrary:(revision,action)=>ipcRenderer.invoke('bookcreator:changeComponentLibrary',revision,action),
  saveStudyDesign:(revision,design,kind)=>ipcRenderer.invoke('bookcreator:saveStudyDesign',revision,design,kind),
  saveParagraphDesign:(revision,design)=>ipcRenderer.invoke('bookcreator:saveParagraphDesign',revision,design),
  saveHeadingDesign:(revision,design,level)=>ipcRenderer.invoke('bookcreator:saveHeadingDesign',revision,design,level),
  saveTypography:(revision,roles)=>ipcRenderer.invoke('bookcreator:saveTypography',revision,roles),
  readBook:()=>ipcRenderer.invoke('bookcreator:readBook'),
  saveBookSettings:(revision,settings)=>ipcRenderer.invoke('bookcreator:saveBookSettings',revision,settings),
  recovery:request=>ipcRenderer.invoke('bookcreator:recovery',request),
  read:id=>ipcRenderer.invoke('bookcreator:read',id),
  save:(id,revision,text)=>ipcRenderer.invoke('bookcreator:save',id,revision,text)
}));
