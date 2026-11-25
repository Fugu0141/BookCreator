import {app,BrowserWindow,dialog,ipcMain,protocol,session} from 'electron';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {openWorkspace,createProject} from './workspace.mjs';
const SMOKE=process.argv.includes('--smoke');
const smokeRoot=SMOKE?mkdtempSync(join(tmpdir(),'bc-electron-')):undefined;
if(smokeRoot)app.setPath('userData',smokeRoot);
protocol.registerSchemesAsPrivileged([{scheme:'bookcreator',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
const PAGE='bookcreator://app/index.html';
const ASSETS=new Map([['/index.html',['index.html','text/html; charset=utf-8']],['/renderer.js',['build/renderer.js','text/javascript; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']]]);
let win,workspace,closing=false,busy=false;
const CSP="default-src 'none'; font-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'none'; connect-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
function sender(event){
  if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||event.senderFrame.url!==PAGE)throw Error('Untrusted IPC sender');
}
function handle(name,fn){
  ipcMain.handle('bookcreator:'+name,async(event,...args)=>{
    try{sender(event);if(busy)throw Error('Workspace operation in progress');busy=true;
      try{return {ok:true,value:await fn(...args)};}finally{busy=false;}
    }catch(e){return {ok:false,error:{code:e.code??'ERROR',message:String(e.message??e)}};}
  });
}
function requireWorkspace(){if(!workspace)throw Error('Open a project first');return workspace;}
function checkArgs(args,count){if(args.length!==count)throw Error('Invalid arguments');}
async function run(){
  await app.whenReady();
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('bookcreator://app/')}));
  const fontManifest=JSON.parse(await readFile(new URL('./build/fonts-manifest.json',import.meta.url),'utf8'));
  if(fontManifest.schemaVersion!==1||fontManifest.family!=='BCFont_NotoSansJP'||!Array.isArray(fontManifest.assets)||fontManifest.assets.length>512||fontManifest.assets.some(name=>typeof name!=='string'||!/^[A-Za-z0-9_-]+\.(?:woff2|woff)$/.test(name)))throw Error('Invalid trusted font build manifest');
  ASSETS.set('/fonts.css',['build/fonts.css','text/css; charset=utf-8']);
  for(const name of fontManifest.assets)ASSETS.set('/fonts/'+name,['build/fonts/'+name,name.endsWith('.woff2')?'font/woff2':'font/woff']);
  protocol.handle('bookcreator',async request=>{
    const u=new URL(request.url),entry=ASSETS.get(u.pathname);
    if(u.host!=='app'||request.method!=='GET'||u.search||!entry)return new Response('Not found',{status:404});
    const data=await readFile(new URL(entry[0],import.meta.url));
    return new Response(data,{headers:{'Content-Type':entry[1],'Content-Security-Policy':CSP,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  });
  win=new BrowserWindow({width:1280,height:850,show:!SMOKE,title:'BookCreator – Development Preview',webPreferences:{preload:fileURLToPath(new URL('./preload.cjs',import.meta.url)),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,devTools:false}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',e=>e.preventDefault());
  win.webContents.on('will-attach-webview',e=>e.preventDefault());
  win.on('close',e=>{
    if(closing||SMOKE||!workspace)return;
    e.preventDefault();if(busy)return;
    const choice=dialog.showMessageBoxSync(win,{type:'warning',buttons:['キャンセル','終了'],defaultId:0,cancelId:0,message:'未保存の原稿・テーマ設定がある可能性があります。終了しますか？'});
    if(choice===1){closing=true;win.close();}
  });
  handle('open',async(...args)=>{
    checkArgs(args,0);
    const selected=SMOKE?{canceled:false,filePaths:[join(smokeRoot,'book.yaml')]}:await dialog.showOpenDialog(win,{title:'book.yaml を開く',properties:['openFile'],filters:[{name:'BookCreator project',extensions:['yaml']}]});
    if(selected.canceled)return null;
    const next=await openWorkspace(selected.filePaths[0]);const typography=await next.typography();workspace=next;return {...next.summary,typography};
  });
  handle('create',async(...args)=>{
    checkArgs(args,1);
    const selected=SMOKE?{canceled:false,filePaths:[smokeRoot]}:await dialog.showOpenDialog(win,{title:'新規書籍の保存先（親フォルダ）',properties:['openDirectory']});
    if(selected.canceled)return null;
    const next=await createProject(selected.filePaths[0],args[0]);const typography=await next.typography();workspace=next;return {...next.summary,typography};
  });
  handle('saveTypography',async(...args)=>{checkArgs(args,2);return requireWorkspace().saveTypography(...args);});
  handle('read',async(...args)=>{checkArgs(args,1);if(typeof args[0]!=='string')throw Error('Invalid section');return requireWorkspace().read(args[0]);});
  handle('save',async(...args)=>{checkArgs(args,3);if(typeof args[0]!=='string')throw Error('Invalid section');return requireWorkspace().save(...args);});
  if(SMOKE){
    await mkdir(join(smokeRoot,'manuscript'));
    await mkdir(join(smokeRoot,'themes','default'),{recursive:true});
    await writeFile(join(smokeRoot,'themes','default','theme.yaml'),'schemaVersion: 1\nid: default\nname: Default\n');
    await writeFile(join(smokeRoot,'book.yaml'),'schemaVersion: 1\ndocumentFormat: {name: bcm, version: 1}\ntitle: "Desktop smoke"\nlanguage: ja\ntheme: themes/default/theme.yaml\npage: {size: A4}\nsections:\n  - {id: chapter, type: manuscript, role: body, path: manuscript/chapter.md}\n');
    await writeFile(join(smokeRoot,'manuscript','chapter.md'),'# 見出し\n\n'+('日本語と English text の実測組版です。 '.repeat(30)).trim()+'\n');
  }
  await win.loadURL(PAGE);
  if(SMOKE)await smoke();
}
async function smoke(){
  const exec=js=>win.webContents.executeJavaScript(js);
  const until=async js=>{for(let i=0;i<100;i++){if(await exec(js))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+js);};
  await until("!!document.querySelector('#open')");
  if(!await exec("typeof require==='undefined' && typeof process==='undefined' && !!window.bookcreator"))throw Error('Renderer isolation failed');
  await exec("document.querySelector('#open').click()");
  await until("!!document.querySelector('[data-section=chapter]')");
  await exec("document.querySelector('[data-section=chapter]').click()");
  await until("document.querySelector('#source')?.value.includes('見出し')");
  await exec("document.querySelector('#preview-button').click()");
  await until("!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-block]')");
  if(!await exec("Array.from(document.fonts).some(f=>f.family.includes('BCFont_NotoSansJP')&&f.status==='loaded')"))throw Error('Bundled Noto font not loaded');
  if(!await exec("(()=>{const lines=[...document.querySelector('#preview > div').shadowRoot.querySelectorAll('[data-start]')];return lines.every(l=>l.style.fontFamily.includes('BCFont_NotoSansJP'))&&lines.some(l=>l.style.fontWeight==='700')&&lines.some(l=>l.style.fontWeight==='400');})()"))throw Error('Font roles not applied');
  await exec("(()=>{const el=document.querySelector('#body-font');el.value='serif';el.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until("!document.querySelector('#preview > div')");
  await exec("document.querySelector('#preview-button').click()");
  await until("!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-block]')");
  if(!await exec("Array.from(document.querySelector('#preview > div').shadowRoot.querySelectorAll('[data-start]')).some(l=>l.style.fontFamily==='serif')"))throw Error('Body font change not applied');
  await exec("document.querySelector('#preview > div').shadowRoot.querySelector('[data-block]').click()");
  if(!await exec("document.querySelector('#source').selectionEnd>document.querySelector('#source').selectionStart"))throw Error('Source selection failed');
  await exec("(()=>{const el=document.querySelector('#source');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,el.value+'\\n追記');el.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await until("!document.querySelector('#save').disabled && !document.querySelector('#preview > div')");
  await exec("document.querySelector('#save').click()");
  await until("document.querySelector('#status').textContent.includes('保存しました')");
  if(!(await readFile(join(smokeRoot,'manuscript','chapter.md'),'utf8')).endsWith('追記'))throw Error('Saved source missing');
  await exec("document.querySelector('#save-theme').click()");
  await until("document.querySelector('#status').textContent.includes('テーマを保存しました')");
  await exec("document.querySelector('#open').click()");
  await until("!document.querySelector('#open').disabled && document.querySelector('#body-font').value==='serif' && document.querySelector('#save-theme').disabled && document.querySelector('#source').disabled");
  await exec("document.querySelector('#new-project').click()");
  await until("!!document.querySelector('#new-title')");
  await exec("(()=>{const el=document.querySelector('#new-title');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'再読込テスト書籍');el.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await exec("document.querySelector('#create-project').click()");
  await until("!!document.querySelector('[data-section=chapter-01]')");
  if(!(await readFile(join(smokeRoot,'new-book','book.yaml'),'utf8')).includes('再読込テスト書籍'))throw Error('Created book missing');
  if(!await exec("document.querySelector('#body-font').value==='BCFont_NotoSansJP'"))throw Error('New book default typography missing');
  console.log('PASS Electron project creation, theme save/reopen, Electron sandbox, project open/read, React editing, bundled Noto, independent font roles, stale invalidation, measured preview, source selection and save');
  closing=true;win.destroy();await rm(smokeRoot,{recursive:true,force:true});app.exit(0);
}
app.on('window-all-closed',()=>{if(!SMOKE)app.quit();});
if(!SMOKE&&!app.requestSingleInstanceLock())app.quit();
else run().catch(async e=>{console.error(e);if(SMOKE&&smokeRoot)await rm(smokeRoot,{recursive:true,force:true}).catch(()=>{});app.exit(1);});
