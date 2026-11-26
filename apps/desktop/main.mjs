import {app,BrowserWindow,dialog,ipcMain,protocol,session} from 'electron';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {mkdtempSync,realpathSync,statSync} from 'node:fs';
import {join,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {openWorkspace,createProject,recoveryManifest} from './workspace.mjs';
import {projectCatalog} from './project-catalog.mjs';
import {STIX_FONT,verifyPinnedFontBlob} from './bundled-math-font.mjs';
import {createHash,randomUUID} from 'node:crypto';
import {recoveryKey,recoveryStore,recoveryStatus} from './manuscript-recovery.mjs';
import {listUnifiedRecovery} from './recovery-hub.mjs';
import {settingsRecovery} from './settings-recovery.mjs';
import {componentRecovery} from './component-recovery.mjs';
import {createPreviewReadLane} from './preview-read-lane.mjs';
const PACKAGE_CRASH_PREPARE=process.argv.includes('--package-crash-prepare');
const PACKAGE_CRASH_VERIFY=process.argv.includes('--package-crash-verify');
const EXTRA_CRASH_MODE=['settings-prepare','settings-verify','components-prepare','components-verify'].find(mode=>process.argv.includes('--package-crash-'+mode));
const PACKAGE_RESTART_SMOKE=!!EXTRA_CRASH_MODE||PACKAGE_CRASH_PREPARE||PACKAGE_CRASH_VERIFY||process.argv.includes('--package-restart-smoke');
const PACKAGE_SMOKE=PACKAGE_RESTART_SMOKE||process.argv.includes('--package-smoke');
const BENCHMARK=!PACKAGE_SMOKE&&process.argv.includes('--benchmark');
const SMOKE=PACKAGE_SMOKE||BENCHMARK||process.argv.includes('--smoke');
const smokeParent=PACKAGE_SMOKE?process.env.BC_PACKAGE_SMOKE_TMP||tmpdir():tmpdir();
function restartSmokeRoot(){
  // Only an explicitly supplied, runner-owned child of the isolated test parent.
  // Never reuse the application's normal userData or initialize fixtures again.
  if(!process.env.BC_PACKAGE_SMOKE_TMP||!process.env.BC_PACKAGE_RESTART_ROOT)throw Error('Restart smoke requires an isolated test profile');
  const parent=realpathSync(process.env.BC_PACKAGE_SMOKE_TMP),root=realpathSync(process.env.BC_PACKAGE_RESTART_ROOT);
  if(!basename(parent).startsWith('bc-package-profile-')||dirname(root)!==parent||!basename(root).startsWith('bc-electron-')||!statSync(join(root,'ux10-restart.json')).isFile())throw Error('Invalid restart smoke profile');
  return root;
}
const smokeRoot=PACKAGE_RESTART_SMOKE?restartSmokeRoot():SMOKE?mkdtempSync(join(smokeParent,'bc-electron-')):undefined;
if(smokeRoot)app.setPath('userData',smokeRoot);
protocol.registerSchemesAsPrivileged([{scheme:'bookcreator',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
const PAGE='bookcreator://app/index.html';
const ASSETS=new Map([['/index.html',['index.html','text/html; charset=utf-8']],['/renderer.js',['build/renderer.js','text/javascript; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']]]);
let win,workspace,closing=false,busy=false,projectFontAssets=new Map();
const previewReadLane=createPreviewReadLane();
const previewImageLane=createPreviewReadLane();
let smokeFontImports=0;
async function loadProjectFonts(next){
  const faces=await next.fonts(true);const assets=new Map();
  const info=faces.map(({bytes,...face})=>{assets.set('/project-fonts/'+face.sha256,{bytes,format:face.format});return face;});
  projectFontAssets=assets;return info;
}
const CSP="default-src 'none'; font-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
function sender(event){
  if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||event.senderFrame.url!==PAGE)throw Error('Untrusted IPC sender');
}
function handle(name,fn){
  ipcMain.handle('bookcreator:'+name,async(event,...args)=>{
    try{sender(event);if(busy)throw Error('Workspace operation in progress');previewReadLane.invalidate();previewImageLane.invalidate();busy=true;
      try{return {ok:true,value:await fn(...args)};}finally{busy=false;}
    }catch(e){return {ok:false,error:{code:e.code??'ERROR',message:String(e.message??e)}};}
  });
}
function requireWorkspace(){if(!workspace)throw Error('Open a project first');return workspace;}
function checkArgs(args,count){if(args.length!==count)throw Error('Invalid arguments');}
async function run(){
  await app.whenReady();
  const catalog=projectCatalog(app.getPath('userData'));
  const recovery=recoveryStore(app.getPath('userData'));
  const recoverySessions=new Map();
  const settingsDrafts=settingsRecovery(app.getPath('userData'));
  const componentDrafts=componentRecovery(app.getPath('userData'));
  let settingsToken=null;
  let settingsTail=Promise.resolve();
  function settingsSerial(fn){const result=settingsTail.then(fn);settingsTail=result.catch(()=>{});return result;}
  async function inspectSettings(current,kind){
    try{
      const result=await settingsDrafts.inspect(current,kind);
      if(result.candidate?.status==='already-saved'){
        await settingsDrafts.remove(current,kind,result.candidate.version);result.candidate=null;
      }
      return result;
    }catch(e){return {error:String(e.message??e)};}
  }
  async function activate(next){
    const typography=await next.typography(),settings=await next.bookSettings(),fonts=await loadProjectFonts(next);
    await settingsTail;
    workspace=next;recoverySessions.clear();settingsToken=randomUUID();
    const settingRecovery={token:settingsToken,typography:await inspectSettings(next,'typography'),'book-settings':await inspectSettings(next,'book-settings')};
    let recent, catalogWarning;
    try{recent=await catalog.remember(next.manifestPath,next.summary.title);}catch(e){catalogWarning='書籍一覧を更新できませんでした: '+String(e.message??e);}
    return {...next.summary,typography,fonts,settings,settingRecovery,recent,catalogWarning,projectId:recent?.find(p=>p.path===next.manifestPath)?.id??null};
  }
  handle('listRecoveryCandidates',async(...args)=>{
    checkArgs(args,0);
    return listUnifiedRecovery(catalog,{manuscript:recovery,settings:recoveryStore(app.getPath('userData'),'settings'),components:recoveryStore(app.getPath('userData'),'components')},recoveryManifest,async path=>{
      const readOnly=await openWorkspace(path),theme=await readOnly.typography();
      if(!theme.libraryEditable)throw Error('Component library unavailable');
      return theme.library.entries;
    });
  });
  handle('listProjects',async(...args)=>{checkArgs(args,0);return catalog.list();});
  handle('openRegisteredProject',async(...args)=>{checkArgs(args,1);return activate(await openWorkspace(await catalog.pathFor(args[0])));});
  handle('favoriteProject',async(...args)=>{checkArgs(args,2);return catalog.favorite(...args);});
  handle('forgetProject',async(...args)=>{checkArgs(args,1);return catalog.forget(args[0]);});
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('bookcreator://app/')}));
  const fontManifest=JSON.parse(await readFile(new URL('./build/fonts-manifest.json',import.meta.url),'utf8'));
  if(fontManifest.schemaVersion!==2||fontManifest.family!=='BCFont_NotoSansJP'||!Array.isArray(fontManifest.assets)||fontManifest.assets.length>512||fontManifest.assets.some(name=>typeof name!=='string'||!/^[A-Za-z0-9_-]+\.(?:woff2|woff)$/.test(name)))throw Error('Invalid trusted font build manifest');
  const math=fontManifest.math;
  if(!math||math.family!==STIX_FONT.family||math.asset!==STIX_FONT.asset||math.sourceCommit!==STIX_FONT.commit||!/^[a-f0-9]{64}$/.test(math.sha256))throw Error('Invalid bundled math manifest');
  const mathBytes=verifyPinnedFontBlob(await readFile(new URL('./build/fonts/'+STIX_FONT.asset,import.meta.url)),STIX_FONT.fontBlob,4*1024*1024);
  if(createHash('sha256').update(mathBytes).digest('hex')!==math.sha256)throw Error('Bundled math font digest mismatch');
  verifyPinnedFontBlob(await readFile(new URL('./build/STIXTwoMath-LICENSE.txt',import.meta.url)),STIX_FONT.licenseBlob,64*1024);
  ASSETS.set('/fonts/'+STIX_FONT.asset,['build/fonts/'+STIX_FONT.asset,'font/ttf']);
  ASSETS.set('/STIXTwoMath-LICENSE.txt',['build/STIXTwoMath-LICENSE.txt','text/plain; charset=utf-8']);
  ASSETS.set('/fonts.css',['build/fonts.css','text/css; charset=utf-8']);
  for(const name of fontManifest.assets)ASSETS.set('/fonts/'+name,['build/fonts/'+name,name.endsWith('.woff2')?'font/woff2':'font/woff']);
  protocol.handle('bookcreator',async request=>{
    const u=new URL(request.url),entry=ASSETS.get(u.pathname);
    if(u.host==='app'&&request.method==='GET'&&!u.search&&/^\/project-images\/[a-f0-9]{64}\.png$/.test(u.pathname)){
      const current=workspace;if(!current)return new Response('Not found',{status:404});
      try{const image=await current.image(u.pathname.slice(16,-4));if(workspace!==current)return new Response('Not found',{status:404});return new Response(image.bytes,{headers:{'Content-Type':'image/png','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':CSP}});}catch{return new Response('Image unavailable',{status:404});}
    }
    if(u.host==='app'&&request.method==='GET'&&!u.search&&projectFontAssets.has(u.pathname)){
      const f=projectFontAssets.get(u.pathname);return new Response(f.bytes,{headers:{'Content-Type':f.format==='ttf'?'font/ttf':'font/otf','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':CSP}});
    }
    if(u.host!=='app'||request.method!=='GET'||u.search||!entry)return new Response('Not found',{status:404});
    const data=await readFile(new URL(entry[0],import.meta.url));
    return new Response(data,{headers:{'Content-Type':entry[1],'Content-Security-Policy':CSP,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  });
  win=new BrowserWindow({width:1280,height:850,show:!SMOKE,title:'BookCreator – Development Preview',webPreferences:{preload:fileURLToPath(new URL('./preload.cjs',import.meta.url)),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,devTools:false}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',e=>e.preventDefault());
  win.webContents.on('will-attach-webview',e=>e.preventDefault());
  let closeSequence=0,pendingClose=null;
  // The renderer owns draft state. Never infer that an open workspace is clean.
  // The main process only accepts a response to the current native close request.
  win.on('close',e=>{
    if(closing)return;
    e.preventDefault();
    if(pendingClose!==null)return;
    pendingClose=++closeSequence;
    win.webContents.send('bookcreator:close-requested',pendingClose);
  });
  win.webContents.on('did-start-navigation',(_event,_url,isInPlace,isMainFrame)=>{
    if(isMainFrame&&!isInPlace){pendingClose=null;recoverySessions.clear();settingsToken=null;}
  });
  ipcMain.handle('bookcreator:complete-close',async(event,token,decision)=>{
    sender(event);
    if(pendingClose===null||token!==pendingClose||!['cancel','exit'].includes(decision))throw Error('Invalid close response');
    if(decision==='exit'&&busy)throw Error('Workspace operation in progress');
    pendingClose=null;
    if(decision==='exit'){
      closing=true;
      setImmediate(()=>{if(!win.isDestroyed())win.close();});
    }
    return true;
  });
  handle('open',async(...args)=>{
    checkArgs(args,0);
    const selected=SMOKE?{canceled:false,filePaths:[join(smokeRoot,'book.yaml')]}:await dialog.showOpenDialog(win,{title:'book.yaml を開く',properties:['openFile'],filters:[{name:'BookCreator project',extensions:['yaml']}]});
    if(selected.canceled)return null;
    return activate(await openWorkspace(selected.filePaths[0]));
  });
  handle('create',async(...args)=>{
    checkArgs(args,1);
    const selected=SMOKE?{canceled:false,filePaths:[smokeRoot]}:await dialog.showOpenDialog(win,{title:'新規書籍の保存先（親フォルダ）',properties:['openDirectory']});
    if(selected.canceled)return null;
    return activate(await createProject(selected.filePaths[0],args[0]));
  });
  handle('readImage',async(...args)=>{checkArgs(args,1);const image=await requireWorkspace().image(args[0]);return new Uint8Array(image.bytes);});
  handle('listImages',async(...args)=>{checkArgs(args,0);return requireWorkspace().images();});
  handle('importImage',async(...args)=>{
    checkArgs(args,1);if(args[0]!==true)throw Error('Confirm permission to copy and share the image');const current=requireWorkspace();
    const chosen=SMOKE?{canceled:false,filePaths:[join(smokeRoot,'test-image.png')]}:await dialog.showOpenDialog(win,{title:'プロジェクトにPNG素材をコピー',properties:['openFile'],filters:[{name:'PNG image',extensions:['png']}]});
    if(chosen.canceled)return null;
    const result=await current.importImage(chosen.filePaths[0]);return {...result,images:await current.images()};
  });
  handle('importFont',async(...args)=>{
    checkArgs(args,1);const current=requireWorkspace();
    const chosen=SMOKE?{canceled:false,filePaths:[smokeFontImports++===0?process.env.BC_TEST_FONT:process.env.BC_TEST_MATH_FONT]}:await dialog.showOpenDialog(win,{title:'プロジェクトにフォントをコピー',properties:['openFile'],filters:[{name:'Static OpenType / TrueType',extensions:['ttf','otf']}]});
    if(chosen.canceled)return null;
    const result=await current.importFont(chosen.filePaths[0],args[0]);
    const fonts=await loadProjectFonts(current);return {...result,fonts};
  });
  handle('changeComponentLibrary',async(...args)=>{checkArgs(args,2);return requireWorkspace().changeComponentLibrary(...args);});
  handle('saveStudyDesign',async(...args)=>{checkArgs(args,3);return requireWorkspace().saveStudyDesign(...args);});
  handle('saveParagraphDesign',async(...args)=>{checkArgs(args,2);return requireWorkspace().saveParagraphDesign(...args);});
  handle('saveHeadingDesign',async(...args)=>{checkArgs(args,3);return requireWorkspace().saveHeadingDesign(...args);});
  handle('saveTypography',async(...args)=>{checkArgs(args,2);return requireWorkspace().saveTypography(...args);});
  handle('readBook',async(...args)=>{checkArgs(args,0);return requireWorkspace().readBook();});
  // Preview reads do not acquire busy. Foreground IPC may proceed, but any
  // overlapping snapshot is rejected before it reaches the renderer.
  // Read-only, numeric process working-set snapshot. Never acquires workspace lock.
  ipcMain.handle('bookcreator:performanceMemory',async(event,...args)=>{
    try{
      sender(event);checkArgs(args,0);
      const value={browserKiB:0,rendererKiB:0,otherKiB:0,processes:0};
      for(const metric of app.getAppMetrics()){
        const size=metric.memory?.workingSetSize;
        if(!Number.isFinite(size)||size<0)continue;
        value.processes++;
        const key=metric.type==='Browser'?'browserKiB':metric.type==='Tab'?'rendererKiB':'otherKiB';
        value[key]+=size;
      }
      return {ok:true,value};
    }catch(e){return {ok:false,error:{code:'ERROR',message:'Memory metrics unavailable'}};}
  });
  ipcMain.handle('bookcreator:readPreviewBook',async(event,...args)=>{
    try{
      sender(event);checkArgs(args,1);
      const [token]=args,current=requireWorkspace();
      if(typeof token!=='string'||token!==settingsToken)throw Error('Invalid preview session');
      const value=await previewReadLane.read(token,()=>!busy&&!closing&&workspace===current&&settingsToken===token,()=>current.readBook());
      return {ok:true,value};
    }catch(e){return {ok:false,error:{code:e.code??'ERROR',message:String(e.message??e)}};}
  });
  ipcMain.handle('bookcreator:readPreviewImage',async(event,...args)=>{
    try{
      sender(event);checkArgs(args,2);
      const [token,id]=args,current=requireWorkspace();
      if(typeof token!=='string'||token!==settingsToken||typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))throw Error('Invalid preview image request');
      const value=await previewImageLane.read(token+':'+id,()=>!busy&&!closing&&workspace===current&&settingsToken===token,async()=>new Uint8Array((await current.image(id)).bytes));
      return {ok:true,value};
    }catch(e){return {ok:false,error:{code:e.code??'ERROR',message:String(e.message??e)}};}
  });
  handle('saveBookSettings',async(...args)=>{checkArgs(args,2);return requireWorkspace().saveBookSettings(...args);});
  ipcMain.handle('bookcreator:settings-recovery',async(event,request)=>{
    try{
      sender(event);
      if(!request||typeof request!=='object'||!['typography','book-settings'].includes(request.kind)||typeof request.token!=='string'||request.token!==settingsToken)throw Error('Invalid settings recovery session');
      const current=requireWorkspace(),token=settingsToken;
      const value=await settingsSerial(async()=>{
        if(workspace!==current||settingsToken!==token)throw Error('Stale settings recovery session');
        if(request.action==='inspect')return inspectSettings(current,request.kind);
        if(request.action==='put')return settingsDrafts.put(current,request.kind,request.baseRevision,request.value,request.version);
        if(request.action==='remove')return settingsDrafts.remove(current,request.kind,request.version);
        throw Error('Invalid settings recovery action');
      });
      return {ok:true,value};
    }catch(e){return {ok:false,error:{code:e.code??'ERROR',message:String(e.message??e)}};}
  });
  ipcMain.handle('bookcreator:component-recovery',async(event,request)=>{
    try{
      sender(event);
      if(!request||typeof request!=='object'||typeof request.token!=='string'||request.token!==settingsToken)throw Error('Invalid component recovery session');
      const current=requireWorkspace(),token=settingsToken;
      const value=await settingsSerial(async()=>{
        if(workspace!==current||settingsToken!==token)throw Error('Stale component recovery session');
        if(request.action==='inspect')return componentDrafts.inspect(current,request.target);
        if(request.action==='put')return componentDrafts.put(current,request.target,request.baseRevision,request.value,request.version);
        if(request.action==='remove')return componentDrafts.remove(current,request.target,request.version);
        throw Error('Invalid component recovery action');
      });
      return {ok:true,value};
    }catch(e){return {ok:false,error:{code:e.code??'ERROR',message:String(e.message??e)}};}
  });
  handle('read',async(...args)=>{
    checkArgs(args,1);if(typeof args[0]!=='string')throw Error('Invalid section');
    const current=requireWorkspace(),saved=await current.read(args[0]);
    recoverySessions.delete(saved.id);
    if(!saved.editable)return saved;
    try{
      const section=current.summary.sections.find(s=>s.id===saved.id&&s.editable);
      const key=recoveryKey(current.manifestPath,saved.id,section.path);
      let candidate=await recovery.get(key),status=recoveryStatus(candidate,saved);
      if(status==='already-saved'){
        await recovery.remove(key,candidate.version);candidate=null;status='none';
      }
      const token=randomUUID();
      recoverySessions.set(saved.id,{token,key,baseRevision:saved.revision,workspace:current});
      return {...saved,recovery:{token,status,candidate}};
    }catch(e){return {...saved,recoveryError:String(e.message??e)};}
  });
  // A narrow separate queue in recoveryStore avoids blocking ordinary preview
  // or project reads. Identity and baseline are derived from a real read.
  ipcMain.handle('bookcreator:recovery',async(event,request)=>{
    try{
      sender(event);
      if(!request||typeof request!=='object'||typeof request.id!=='string')throw Error('Invalid recovery request');
      const session=recoverySessions.get(request.id);
      if(!session||session.workspace!==workspace||request.token!==session.token||request.baseRevision!==session.baseRevision)throw Error('Stale recovery session');
      let value;
      if(request.action==='put')value=await recovery.put(session.key,{baseRevision:session.baseRevision,text:request.text},request.version);
      else if(request.action==='remove')value=await recovery.remove(session.key,request.version);
      else throw Error('Invalid recovery action');
      return {ok:true,value};
    }catch(e){return {ok:false,error:{code:e.code??'ERROR',message:String(e.message??e)}};}
  });
  handle('save',async(...args)=>{
    checkArgs(args,3);if(typeof args[0]!=='string')throw Error('Invalid section');
    const current=requireWorkspace(),saved=await current.save(...args),session=recoverySessions.get(args[0]);
    if(session?.workspace===current&&session.baseRevision===args[1])session.baseRevision=saved.revision;
    return saved;
  });
  if(BENCHMARK){
    const {prepareBenchmark,runBookBenchmark}=await import('./benchmark-runner.mjs');
    const fixture=await prepareBenchmark(smokeRoot);
    await win.loadURL(PAGE);
    await runBookBenchmark(win,app,smokeRoot,fixture);
    closing=true;win.destroy();
    // On Windows Chromium may still hold profile databases until process exit.
    if(process.platform!=='win32')await rm(smokeRoot,{recursive:true,force:true,maxRetries:10,retryDelay:100});
    app.exit(0);return;
  }
  if(SMOKE&&!PACKAGE_RESTART_SMOKE){
    await mkdir(join(smokeRoot,'manuscript'));
    await mkdir(join(smokeRoot,'themes','default'),{recursive:true});
    await writeFile(join(smokeRoot,'themes','default','theme.yaml'),'schemaVersion: 1\nid: default\nname: Default\n');
    await writeFile(join(smokeRoot,'book.yaml'),'schemaVersion: 1\ndocumentFormat: {name: bcm, version: 1}\ntitle: "Desktop smoke"\nlanguage: ja\ntheme: themes/default/theme.yaml\npage: {size: A4}\nsections:\n  - {id: chapter, type: manuscript, role: body, path: manuscript/chapter.md}\n');
    await writeFile(join(smokeRoot,'manuscript','chapter.md'),'# 見出し\n\n'+('日本語と English text の実測組版です。 '.repeat(30)).trim()+'\n');
  }
  await win.loadURL(PAGE);
  if(SMOKE){
    if(!PACKAGE_RESTART_SMOKE){
      await liveWritingSmoke();
      // Legacy scenarios start with a fresh renderer, not a previously open book.
      await win.loadURL(PAGE);
    }
    await selectManualPreviewForRegression();
  }
  if(EXTRA_CRASH_MODE)await productionDataCrashSmoke(EXTRA_CRASH_MODE);
  else if(PACKAGE_CRASH_PREPARE||PACKAGE_CRASH_VERIFY)await crashRecoverySmoke(PACKAGE_CRASH_PREPARE);
  else if(PACKAGE_RESTART_SMOKE)await packageRestartSmoke();
  else if(PACKAGE_SMOKE)await packageSmoke();
  else if(SMOKE)await smoke();
}
// Existing explicit-composition regressions deliberately use the supported manual
// mode. Exercise the default automatic mode separately before those regressions.
async function selectManualPreviewForRegression(){
  const raw=js=>win.webContents.executeJavaScript(js);
  for(let i=0;i<100;i++){
    if(await raw("!!document.querySelector('#live-preview')")){
      await raw("(()=>{const e=document.querySelector('#live-preview');if(e.checked)e.click();})()");
      if(await raw("document.querySelector('#live-preview').checked===false"))return;
    }
    await new Promise(r=>setTimeout(r,50));
  }
  throw Error('Cannot select manual preview for regression');
}
async function liveWritingSmoke(){
  const raw=js=>win.webContents.executeJavaScript(js);
  const until=async(label,js)=>{for(let i=0;i<150;i++){if(await raw(js))return;await new Promise(r=>setTimeout(r,100));}throw Error('Live writing: '+label+'; '+await raw("document.querySelector('#status')?.textContent"));};
  const click=async selector=>{await until('enabled '+selector,"!!document.querySelector("+JSON.stringify(selector)+")&&!document.querySelector("+JSON.stringify(selector)+").disabled");await raw("document.querySelector("+JSON.stringify(selector)+").click()");};
  const path=join(smokeRoot,'manuscript','chapter.md'),saved=await readFile(path,'utf8');
  const ready="document.querySelector('#workspace-layout-state').dataset.phase==='ready'&&document.querySelector('#preview > div')?.dataset.paperFreshness==='current'";
  const setSource=source=>raw("(()=>{const e=document.querySelector('#source');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,"+JSON.stringify(source)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await until('default live preview',"document.querySelector('#live-preview')?.checked===true");
  await click('#open');
  await until('book opened',"document.querySelector('.workspace-shell').dataset.workspaceMode==='writing'&&!!document.querySelector('[data-section=chapter]')&&!document.querySelector('#open').disabled");
  const scopeReady=scope=>ready+"&&document.querySelector('#workspace-layout-state').dataset.scope==="+JSON.stringify(scope);
  await click('#mode-layout');
  await until('whole book without selected manuscript',scopeReady('book')+"&&!document.querySelector('#source').value&&!!document.querySelector('#layout-pages')");
  await click('#mode-writing');await click('[data-section=chapter]');
  await until('initial paper',scopeReady('manuscript')+"&&!!document.querySelector('#preview').getClientRects().length");
  await raw("(()=>{const e=document.querySelector('#source');e.focus();e.setSelectionRange(0,0);e.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'あ'}));})()");
  const first=saved+'\nライブ組版途中。\n',latest=saved+'\nライブ組版最終確認。\n';
  await setSource(first);
  await new Promise(r=>setTimeout(r,350));
  if(!await raw("document.querySelector('#workspace-layout-state').dataset.phase==='stale'&&document.querySelector('#preview > div').inert"))throw Error('IME intermediate source triggered live composition');
  await setSource(latest);
  await raw("document.querySelector('#source').dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'あ'}))");
  await until('latest paper',ready+"&&document.querySelector('#preview > div').shadowRoot.textContent.includes('ライブ組版最終確認。')&&!document.querySelector('#preview > div').shadowRoot.textContent.includes('ライブ組版途中。')&&document.activeElement.id==='source'");
  if(await readFile(path,'utf8')!==saved)throw Error('Live writing changed saved manuscript');
  await click('#mode-layout');
  await until('whole book follows unsaved draft',scopeReady('book')+"&&document.querySelector('#preview > div').shadowRoot.textContent.includes('ライブ組版最終確認。')&&!!document.querySelector('#layout-pages')");
  await click('#preview-button');
  await until('explicit manuscript scope',scopeReady('manuscript'));
  await new Promise(r=>setTimeout(r,350));
  if(!await raw(scopeReady('manuscript')))throw Error('Automatic layout overrode explicit scope');
  await click('#mode-writing');
  await setSource(saved);
  await until('reverted source',scopeReady('manuscript')+"&&document.querySelector('#workspace-save-state').textContent==='保存済み'");
  await click('#mode-layout');
  await until('whole-book default on reentry',scopeReady('book')+"&&!document.querySelector('#preview > div').shadowRoot.textContent.includes('ライブ組版最終確認。')");
  if(await readFile(path,'utf8')!==saved)throw Error('Live book layout changed saved manuscript');
  await click('#mode-writing');
  await until('writing scope restored',scopeReady('manuscript'));
  const themePath=join(smokeRoot,'themes','default','theme.yaml'),manifestPath=join(smokeRoot,'book.yaml');
  const [savedTheme,savedManifest]=await Promise.all([readFile(themePath,'utf8'),readFile(manifestPath,'utf8')]);
  const change=async(selector,value)=>raw("(()=>{const e=document.querySelector("+JSON.stringify(selector)+");const proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()");
  const visiblePaper="!!document.querySelector('#preview').getClientRects().length";
  await click('#mode-design');
  await until('style paper visible',scopeReady('manuscript')+"&&"+visiblePaper+"&&document.querySelector('#style-live-preview').checked");
  await change('#body-font','serif');
  await until('unsaved actual font',scopeReady('manuscript')+"&&Array.from(document.querySelector('#preview > div').shadowRoot.querySelectorAll('[data-start]')).some(e=>e.style.fontFamily==='serif')&&document.querySelector('#workspace-save-state').textContent.includes('テーマ')");
  if(await readFile(themePath,'utf8')!==savedTheme)throw Error('Live style wrote the theme');
  await click('#discard-theme-roles');
  await until('discarded style',scopeReady('manuscript')+"&&document.querySelector('#workspace-save-state').textContent==='保存済み'");
  await click('#book-settings');
  await until('settings paper visible',scopeReady('book')+"&&"+visiblePaper+"&&document.querySelector('#book-settings-live-preview').checked");
  await change('#page-size','A5');
  await until('unsaved A5 geometry',scopeReady('book')+"&&Math.abs(parseFloat(document.querySelector('#preview > div').shadowRoot.querySelector('[data-page]').style.width)-148*96/25.4)<.1&&document.querySelector('#workspace-save-state').textContent.includes('書籍設定')");
  const oldTop=await raw("Number(document.querySelector('#page-margin-top').value)");
  const oldPaper=await raw("document.querySelector('#preview > div').shadowRoot.querySelector('[data-content-guide]').getAttribute('style')");
  await change('#page-margin-top',String(oldTop+5));
  await until('unsaved margin geometry',scopeReady('book')+"&&document.querySelector('#preview > div').shadowRoot.querySelector('[data-content-guide]').getAttribute('style')!=="+JSON.stringify(oldPaper));
  if(await readFile(manifestPath,'utf8')!==savedManifest)throw Error('Live page settings wrote book.yaml');
  await click('#discard-book-settings');
  await until('discarded page settings',scopeReady('book')+"&&Math.abs(parseFloat(document.querySelector('#preview > div').shadowRoot.querySelector('[data-page]').style.width)-210*96/25.4)<.1&&document.querySelector('#workspace-save-state').textContent==='保存済み'");
  await click('#mode-writing');
  await until('return to manuscript',scopeReady('manuscript'));
  if(await readFile(path,'utf8')!==saved)throw Error('Settings preview wrote manuscript');
  await click('#performance-toggle');
  await until('performance samples',"['measurement','layout'].every(stage=>['manuscript','book'].every(category=>Number(document.querySelector('#performance-summary tr[data-stage='+stage+'][data-category='+category+']')?.dataset.success)>0))&&Number(document.querySelector('#performance-summary tr[data-stage=read][data-category=source]')?.dataset.success)>0");
  await until('phase samples',"['manuscript','book'].every(scope=>{const e=document.querySelector('#performance-phase-summary tr[data-scope='+scope+'][data-cache-enabled=false][data-math-cache-enabled=false][data-paragraph-cache-enabled=true][data-page-cache-enabled=false]');if(!e||Number(e.dataset.count)<1)return false;const t=JSON.parse(e.dataset.latest);return ['validationMs','imagesMs','measurementMs','paginationMs','renderingMs','presentationMs'].every(k=>Number.isFinite(t[k])&&t[k]>=0);})");
  await until('cache defaults',"!document.querySelector('#performance-cache-enabled').checked&&!document.querySelector('#performance-math-cache-enabled').checked&&document.querySelector('#performance-paragraph-cache-enabled').checked&&!document.querySelector('#performance-page-cache-enabled').checked");
  await until('performance memory',"document.querySelector('#performance-memory')?.dataset.phase==='ready'&&document.querySelector('#performance-memory').textContent.includes('MiB')");
  console.log('PERF sample '+await raw("JSON.stringify({rows:[...document.querySelectorAll('#performance-summary tbody tr')].map(tr=>({stage:tr.dataset.stage,category:tr.dataset.category,values:[...tr.querySelectorAll('td')].map(td=>td.textContent)})),memory:document.querySelector('#performance-memory').textContent})"));
  await click('#performance-clear');
  await until('performance cleared',"document.querySelectorAll('#performance-summary tbody tr').length===0&&document.querySelectorAll('#performance-phase-summary tbody tr').length===0");
  await click('#performance-close');
  await until('performance closed',"!document.querySelector('#performance-panel')");
  // Reopening through the normal discard path cleans any coalesced recovery draft.
  await click('#mode-home');await click('#open');
  await until('reopened book',"document.querySelector('.workspace-shell').dataset.workspaceMode==='writing'&&!document.querySelector('#open').disabled&&!document.querySelector('#source').value");
  await click('#mode-home');
  console.log('PASS default live writing, whole-book and settings preview, explicit scope, IME, latest result, focus and disk safety');
}
// Short distribution smoke test: no installed fonts, user projects or native dialogs required.
// Existing regression scenarios still use the real controls, but reach them through
// the appropriate workflow surface rather than invoking hidden DOM controls.
function workspaceSmokeExec(){
  const raw=async js=>{try{return await win.webContents.executeJavaScript(js);}catch(e){throw Error('Renderer script failed: '+js.slice(0,800)+'; '+String(e.message??e),{cause:e});}};
  const routeFor=selector=>{
    if(/^#(?:open|new-project|new-title|new-folder|new-size|create-project)$/.test(selector))return 'home';
    if(/^#(?:font-manager|font-license|font-license-text|font-copy|import-font|image-manager|image-copy|import-image|lab-level|component-lab|paragraph-lab|study-design-kind|study-design-lab|body-font|body-weight|heading-font|heading-weight|math-font|save-theme)$/.test(selector))return 'design';
    if(/^#(?:source(?:-.*)?|editor-font|study-(?!design).+|preview-button|preview-book)$/.test(selector)||selector.startsWith('[data-section='))return 'writing';
    return null;
  };
  const designCategoryFor=selector=>{
    if(/^#(?:body-font|body-weight|heading-font|heading-weight|math-font|save-theme|discard-theme-roles)$/.test(selector))return 'styles';
    if(/^#(?:lab-level|component-lab|paragraph-lab|study-design-kind|study-design-lab)$/.test(selector))return 'components';
    if(/^#(?:image-manager|image-copy|import-image)$/.test(selector))return 'assets';
    if(/^#(?:font-manager|font-license|font-license-text|font-copy|import-font)$/.test(selector))return 'fonts';
    return null;
  };
  const panelFor=selector=>{
    if(/^#source-list-/.test(selector))return 'list';
    if(/^#source-(?:math|inline-math|equation-numbering|equation-reference)$/.test(selector))return 'math';
    if(/^#study-(?:kind|instance-id|generate-id|answer-to|include-optional|append)$/.test(selector))return 'study';
    if(/^#source-(?:combined|color|apply-|clear-|font|super|sub)/.test(selector))return 'format';
    if(selector==='#editor-font')return 'view';
    return null;
  };
  return async js=>{
    // Read-only assertions must not navigate or change the current mode.
    if(/\.(?:click|dispatchEvent|setSelectionRange|focus)\(/.test(js)){
      const selectors=[...js.matchAll(/document\.querySelector\((['"])(.*?)\1\)|document\.getElementById\((['"])(.*?)\3\)/g)].map(m=>m[2]??'#'+m[4]);
      const selector=selectors[0];
      // Recovery initialization and explicit commit/cancel are asynchronous.
      // Do not drive old smoke actions through disabled lab controls.
      if(await raw("!!document.querySelector('.lab-overlay')")){
        let settled=false;
        for(let i=0;i<100;i++){
          if(await raw("!document.querySelector('.lab-overlay')||(!document.querySelector('#component-recovery-state[data-phase=loading]')&&!document.querySelector('.lab-overlay[data-recovery-working=true]'))")){settled=true;break;}
          await new Promise(r=>setTimeout(r,50));
        }
        if(!settled)throw Error('Component recovery operation did not settle');
      }
      const mode=selector&&/^#preview-(?:book|button)$/.test(selector)&&await raw("document.querySelector('.workspace-shell').dataset.workspaceMode==='layout'")?'layout':selector&&routeFor(selector);
      if(mode&&!await raw("document.querySelector('.workspace-shell').dataset.workspaceMode==="+JSON.stringify(mode))){
        await raw("document.querySelector('#mode-"+mode+"').click()");
        let visible=false;
        for(let i=0;i<100;i++){
          if(await raw("document.querySelector('.workspace-shell').dataset.workspaceMode==="+JSON.stringify(mode))){visible=true;break;}
          await new Promise(r=>setTimeout(r,50));
        }
        if(!visible){
          const panel=panelFor(selector);
          if(!panel)throw Error('Cannot reach visible '+selector+' in '+mode);
          // Grouped commands become visible only after the group is expanded.
        }
      }
      const category=selectors.map(designCategoryFor).find(Boolean);
      if(category&&!await raw("document.querySelector('#design-tab-"+category+"')?.getAttribute('aria-current')==='page'")){
        await raw("document.querySelector('#design-tab-"+category+"').click()");
        let visible=false;
        for(let i=0;i<100;i++){
          if(await raw("!!document.querySelector('#design-panel-"+category+"')?.getClientRects().length")){visible=true;break;}
          await new Promise(r=>setTimeout(r,50));
        }
        if(!visible)throw Error('Cannot open design category '+category);
      }
      if(selectors.some(s=>/^#(?:lab-level|component-lab|paragraph-lab|study-design-kind|study-design-lab)$/.test(s))&&!await raw("document.querySelector('#component-quick-select')?.open")){
        await raw("document.querySelector('#component-quick-select summary').click()");
        if(!await raw("document.querySelector('#component-quick-select').open"))throw Error('Cannot open direct component selector');
      }
      if(selectors.some(s=>/^#lab-add(?:-image|-slot|-dynamic|-label)?$/.test(s))&&!await raw("document.querySelector('#lab-add-menu')?.getAttribute('aria-expanded')==='true'")){
        await raw("document.querySelector('#lab-add-menu').click()");
        if(!await raw("!document.querySelector('#lab-add-options').hidden"))throw Error('Cannot open element insertion menu');
      }
      // Inspector actions are routed through the corresponding visible category.
      const property=await raw("(()=>{for(const selector of "+JSON.stringify(selectors)+"){const el=document.querySelector(selector),p=el?.closest('[data-property-tab]');if(p)return p.dataset.propertyTab;}return null;})()");
      if(property&&!await raw("document.querySelector('[data-property-tab="+property+"]')?.hidden===false")){
        await raw("document.querySelector('[data-property-choice="+property+"]').click()");
        if(!await raw("document.querySelector('[data-property-tab="+property+"]')?.hidden===false"))throw Error('Cannot open property category '+property);
      }
      const samplePanel=await raw("(()=>{for(const selector of "+JSON.stringify(selectors)+"){const p=document.querySelector(selector)?.closest('[data-sample-fields]');if(p)return p.dataset.sampleFields;}return null;})()");
      if(samplePanel&&await raw("document.querySelector('#"+samplePanel+"-sample-fields')?.hidden")){
        await raw("document.querySelector('#"+samplePanel+"-sample-toggle').click()");
        if(await raw("document.querySelector('#"+samplePanel+"-sample-fields')?.hidden"))throw Error('Cannot open sample settings');
      }
      const panel=selectors.map(panelFor).find(Boolean);
      if(panel&&!await raw("!!document.querySelector('#writing-tools-"+panel+"')?.getClientRects().length")){
        await raw("document.querySelector('#writing-panel-"+panel+"').click()");
        let visible=false;
        for(let i=0;i<100;i++){
          if(await raw("!!document.querySelector('#writing-tools-"+panel+"')?.getClientRects().length")){visible=true;break;}
          await new Promise(r=>setTimeout(r,50));
        }
        if(!visible)throw Error('Cannot open writing panel '+panel);
      }
      const formatClick=selectors.find(s=>/^#source-(?:bold|italic|underline|combined|apply-color|clear-color|apply-font|clear-font|apply-size|clear-size|super|sub|clear-baseline)$/.test(s));
      if(formatClick&&js.includes('.click()')){
        let enabled=false;
        for(let i=0;i<100;i++){
          if(await raw("!!document.querySelector("+JSON.stringify(formatClick)+")?.getClientRects().length&&!document.querySelector("+JSON.stringify(formatClick)+").disabled")){enabled=true;break;}
          await new Promise(r=>setTimeout(r,50));
        }
        if(!enabled)throw Error('Cannot use selected text format '+formatClick);
      }
      if(selectors.some(s=>/^#study-(?:instance-id|generate-id|answer-to|include-optional)$/.test(s))&&!await raw("document.querySelector('#study-insertion-details')?.open")){
        await raw("document.querySelector('#study-insertion-details summary').click()");
        if(!await raw("document.querySelector('#study-insertion-details').open"))throw Error('Cannot open study insertion details');
      }
    }
    return raw(js);
  };
}
async function packageSmoke(){
  const exec=workspaceSmokeExec();
  const until=async js=>{for(let i=0;i<150;i++){if(await exec(js))return;await new Promise(r=>setTimeout(r,100));}throw Error('Package smoke timeout: '+js+'; '+await exec("document.querySelector('#status')?.textContent"));};
  await until("!!document.querySelector('#open')?.getClientRects().length&&!document.querySelector('#open').disabled");
  if(!await exec("document.querySelector('.workspace-shell').dataset.workspaceMode==='home'&&!document.querySelector('#source').getClientRects().length&&!document.querySelector('#body-font').getClientRects().length"))throw Error('Initial home exposes unrelated controls');
  if(!await exec("typeof require==='undefined'&&typeof process==='undefined'&&!!window.bookcreator"))throw Error('Renderer isolation failed');
  // Chromium UI zoom exercises reduced CSS viewports; it is not a native OS DPI change.
  const originalZoom=win.webContents.getZoomFactor();
  const baselineWidth=await exec("innerWidth");
  if(baselineWidth<=900||baselineWidth/2>900)throw Error('Package smoke requires a CSS viewport crossing 900px at 200% zoom; baseline='+baselineWidth);
  const responsiveReady="(document.querySelector('.workspace-shell').dataset.workspaceMode!=='writing'||document.querySelector('.workspace-main').classList.contains('compact-writing')===(innerWidth<=900))";
  const atUiZoom=async(factor,check)=>{
    win.webContents.setZoomFactor(originalZoom*factor);
    try{
      await until("Math.abs(innerWidth-"+baselineWidth+"/"+factor+")<8&&"+responsiveReady);
      await until(check);
    }finally{
      win.webContents.setZoomFactor(originalZoom);
      await until("Math.abs(innerWidth-"+baselineWidth+")<8&&"+responsiveReady);
    }
  };
  const visibleWithinWindow=selectors=>"(()=>{const nodes="+JSON.stringify(selectors)+".map(s=>document.querySelector(s));return nodes.every(e=>{if(!e||!e.getClientRects().length)return false;const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1;});})()";
  for(const factor of [1.25,1.5,2])await atUiZoom(factor,visibleWithinWindow(['#open','#new-project','#shortcut-help-toggle','.hub-content']));

  await exec("document.querySelector('#open').click()");
  await until("!!document.querySelector('[data-section=chapter]')");
  await exec("document.querySelector('[data-section=chapter]').click()");
  await until("document.querySelector('#source')?.value.includes('見出し')");
  // The legacy smoke theme intentionally has no math role (auto). Select STIX explicitly.
  await exec("(()=>{const e=document.querySelector('#math-font');e.value='BCFont_STIXTwoMath';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until("document.querySelector('#math-font').value==='BCFont_STIXTwoMath'");
  const sample='# 二次方程式\n\n本文 $x^2$ です。\n\n:::layout{#eq-test numbered="true"}\n$$\n\\frac{1}{2}\n$$\n:::\n';
  await exec("(()=>{const el=document.querySelector('#source');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,"+JSON.stringify(sample)+");el.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await until("document.querySelector('#source').value==="+JSON.stringify(sample));
  if(!await exec("document.querySelector('#workspace-save-state').textContent==='未保存：原稿・テーマ'&&document.querySelector('#workspace-layout-state').dataset.phase==='idle'"))throw Error('Independent unsaved targets missing');
  if(!await exec("document.querySelector('.workspace-shell').dataset.workspaceMode==='writing'&&!document.querySelector('#body-font').getClientRects().length&&!document.querySelector('#preview').getClientRects().length"))throw Error('Writing does not isolate design and paper controls');
  await exec("document.querySelector('#mode-design').click()");
  await until("document.querySelector('.workspace-shell').dataset.workspaceMode==='design'&&!!document.querySelector('#body-font').getClientRects().length&&!document.querySelector('#source').getClientRects().length");
  for(const category of ['components','assets','fonts','styles']){
    await exec("document.querySelector('#design-tab-"+category+"').click()");
    await until("document.querySelector('#design-tab-"+category+"').getAttribute('aria-current')==='page'&&!!document.querySelector('#design-panel-"+category+"').getClientRects().length&&[...document.querySelectorAll('.design-categories>section')].filter(e=>e.getClientRects().length).length===1");
  }
  if(!await exec("document.querySelector('#workspace-save-state').textContent.includes('テーマ')"))throw Error('Design category switch lost unsaved typography');
  await exec("document.querySelector('#design-tab-components').click()");
  await until("!document.querySelector('#design-panel-components').hidden&&document.querySelectorAll('#component-catalog .catalog-card').length>=15");
  if(!await exec("document.querySelectorAll('#component-catalog [data-catalog-edit]').length>=15&&[...document.querySelectorAll('#component-catalog [data-catalog-edit]')].every(e=>e.disabled)&&!document.querySelector('#component-quick-select').open"))throw Error('Unsaved typography must block editing from catalog');
  await exec("(()=>{const e=document.querySelector('#component-filter');e.value='heading';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until("document.querySelectorAll('#component-catalog .catalog-card').length===7");
  await exec("(()=>{const e=document.querySelector('#component-search');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'H3');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await until("document.querySelectorAll('#component-catalog .catalog-card').length===1&&!!document.querySelector('[data-catalog-edit=heading-3]')");
  await until("(()=>{const card=document.querySelector('[data-component-key=heading-3]'),sample=card?.querySelector('.catalog-measured-paper > div');return card?.querySelector('.catalog-measured')?.dataset.previewPhase==='ready'&&sample?.inert===true&&!!sample.shadowRoot?.querySelector('[data-page]')&&!!sample.shadowRoot?.querySelector('[data-start]');})()");
  await exec("(()=>{const e=document.querySelector('#component-search');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await exec("(()=>{const e=document.querySelector('#component-filter');e.value='all';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until("document.querySelectorAll('#component-catalog .catalog-card').length>=15");
  await exec("document.querySelector('#design-tab-styles').click()");
  await exec("document.querySelector('#mode-layout').click()");
  await until("document.querySelector('.workspace-shell').dataset.workspaceMode==='layout'&&!!document.querySelector('#preview').getClientRects().length&&!document.querySelector('#source').getClientRects().length");
  await exec("document.querySelector('#mode-publication').click()");
  await until("document.querySelector('.workspace-shell').dataset.workspaceMode==='publication'&&!document.querySelector('#preview').getClientRects().length");
  if(!await exec("document.querySelector('.publication-checks').textContent.includes('未保存：原稿・テーマ')&&document.querySelector('.publication-checks').textContent.includes('全冊の最新組版が必要')"))throw Error('Publication preparation state incorrect');
  if(!await exec("document.querySelector('#publication-save').dataset.state==='required'&&document.querySelector('#publication-layout').dataset.state==='required'&&document.querySelector('#publication-output').dataset.state==='unavailable'&&!document.querySelector('#publication-output button')"))throw Error('Publication gates incorrect before layout');
  await exec("document.querySelector('#mode-writing').click()");
  await until("document.querySelector('.workspace-shell').dataset.workspaceMode==='writing'&&!!document.querySelector('#source').getClientRects().length&&document.querySelector('#source').value==="+JSON.stringify(sample));
  const workspaceKey=(key,ctrl=false)=>exec("(()=>{const e=document.querySelector('#source');e.dispatchEvent(new KeyboardEvent('keydown',{key:"+JSON.stringify(key)+",ctrlKey:"+JSON.stringify(ctrl)+",bubbles:true,cancelable:true}));})()");
  await until("!document.querySelector('.workspace-main').classList.contains('compact-writing')&&!document.querySelector('#workspace-outline').hidden&&!document.querySelector('.editor').hidden&&!document.querySelector('#toggle-outline').disabled");
  const editorWidth=await exec("document.querySelector('.editor').getBoundingClientRect().width");
  await exec("document.querySelector('#toggle-outline').click()");
  await until("document.querySelector('#workspace-outline').hidden&&document.querySelector('#toggle-outline').getAttribute('aria-expanded')==='false'");
  await until("document.querySelector('.editor').getBoundingClientRect().width>"+editorWidth);
  await exec("document.querySelector('#toggle-outline').click()");
  await until("!document.querySelector('#workspace-outline').hidden");
  await exec("document.querySelector('#shortcut-help-toggle').click()");
  await until("!document.querySelector('#shortcut-help').hidden");
  await workspaceKey('Escape');
  await until("document.querySelector('#shortcut-help').hidden");
  await workspaceKey('2',true);
  await until("document.querySelector('.workspace-shell').dataset.workspaceMode==='design'");
  await exec("document.querySelector('.workspace-shell').dispatchEvent(new KeyboardEvent('keydown',{key:'1',ctrlKey:true,bubbles:true,cancelable:true}))");
  await until("document.querySelector('.workspace-shell').dataset.workspaceMode==='writing'");
  if(!await exec("document.querySelector('#source').value==="+JSON.stringify(sample)+"&&document.querySelector('#workspace-save-state').textContent==='未保存：原稿・テーマ'"))throw Error('Workspace view controls changed draft');
  for(const factor of [1.25,1.5,2]){
    await atUiZoom(factor,visibleWithinWindow(['#save','#book-settings','#shortcut-help-toggle','#workspace-save-state','.workspace-main','.editor'])+"&&document.querySelector('.editor').clientHeight>40");
  }
  // UX-09d: compact writing preserves the entire width and switches surfaces
  // without mutating the unsaved source or wide-mode sidebar preferences.
  // Compare the outer grid cell geometry, not clientWidth: Windows scrollbars
  // consume part of clientWidth when the editor scrolls vertically.
  await atUiZoom(2,"(()=>{const main=document.querySelector('.workspace-main'),editor=document.querySelector('.editor');const m=main.getBoundingClientRect(),e=editor.getBoundingClientRect();return main.classList.contains('compact-writing')&&document.querySelector('#workspace-outline').hidden&&document.querySelector('.paper').hidden&&!editor.hidden&&e.width>0&&Math.abs(e.left-m.left)<4&&Math.abs(e.right-m.right)<4;})()");
  win.webContents.setZoomFactor(originalZoom*2);
  try{
    await until("document.querySelector('.workspace-main').classList.contains('compact-writing')&&!document.querySelector('#compact-editor').hidden");
    // UX-09e: explicit surface navigation restores focus and source selection.
    await exec("(()=>{const e=document.querySelector('#source');e.focus();e.setSelectionRange(2,5);})()");
    await exec("document.querySelector('#toggle-outline').click()");
    await until("!document.querySelector('#workspace-outline').hidden&&document.querySelector('.editor').hidden&&document.querySelector('.paper').hidden&&document.activeElement.matches('[data-section=chapter]')");
    await exec("document.querySelector('[data-section=chapter]').click()");
    await until("!document.querySelector('.editor').hidden&&document.querySelector('#workspace-outline').hidden&&document.activeElement.id==='source'&&document.activeElement.selectionStart===2&&document.activeElement.selectionEnd===5");
    await exec("document.querySelector('#toggle-paper').click()");
    await until("!document.querySelector('.paper').hidden&&document.querySelector('.editor').hidden&&document.querySelector('#workspace-outline').hidden&&document.activeElement.id==='writing-paper'");
    await exec("document.querySelector('#compact-editor').click()");
    await until("!document.querySelector('.editor').hidden&&document.querySelector('.paper').hidden&&document.activeElement.id==='source'&&document.activeElement.selectionStart===2&&document.activeElement.selectionEnd===5&&document.querySelector('#source').value==="+JSON.stringify(sample));
    await exec("document.querySelector('#editor-view-structured').click()");
    await until("!!document.querySelector('[data-structured-kind=heading] [data-rich-edit]')");
    await exec("document.querySelector('#toggle-outline').click()");
    await until("document.activeElement.matches('[data-section=chapter]')");
    await exec("document.querySelector('[data-section=chapter]').click()");
    await until("document.activeElement.id==='writing-editor'&&!document.querySelector('#structured-editor').hidden");
    // An unapplied structural draft must not be hidden by compact navigation.
    await exec("document.querySelector('[data-structured-kind=heading] [data-rich-edit]').click()");
    await until("document.activeElement.id==='structured-rich-value'&&document.querySelector('#toggle-outline').disabled&&document.querySelector('#toggle-paper').disabled&&document.querySelector('#compact-editor').disabled");
    await exec("(()=>{const e=document.querySelector('#structured-rich-value');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'未確定の見出し');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await exec("document.querySelector('#toggle-paper').click()");
    await until("!document.querySelector('.editor').hidden&&document.querySelector('.paper').hidden&&document.querySelector('#structured-rich-value').value==='未確定の見出し'&&document.querySelector('#source').value==="+JSON.stringify(sample));
    await exec("document.querySelector('#structured-cancel').click()");
    await until("!document.querySelector('#toggle-outline').disabled&&document.querySelector('#source').value==="+JSON.stringify(sample));
    await exec("document.querySelector('#editor-view-source').click()");
    await until("!document.querySelector('#source').hidden");
  }finally{
    win.webContents.setZoomFactor(originalZoom);
    await until("!document.querySelector('.workspace-main').classList.contains('compact-writing')&&!document.querySelector('#workspace-outline').hidden&&!document.querySelector('.editor').hidden&&document.querySelector('.paper').hidden&&document.querySelector('#toggle-paper').getAttribute('aria-pressed')==='false'");
  }
  // Opening the paper in compact mode must not turn on wide-mode split view.
  if(!await exec("document.querySelector('#source').value==="+JSON.stringify(sample)))throw Error('UI zoom altered manuscript');
  // Round-trip structured edits, explicit cancel and opaque BCM preservation.
  const structuredFixture='# 見出し\n\n本文を編集します。\n\n$$\nx^2\n$$\n\n'+sample.slice(sample.indexOf(':::layout'));
  const setStructuredSource=value=>exec("(()=>{const e=document.querySelector('#source');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  const setStructuredValue=value=>exec("(()=>{const e=document.querySelector('#structured-value');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  // UX-08e: creation, move, duplication, deletion and history on a real draft.
  await setStructuredSource('');
  await exec("document.querySelector('#editor-view-structured').click()");
  // UX-09b: insertion choices are hidden until explicitly requested.
  await until("document.querySelector('#structured-insert-panel')?.hidden&&document.querySelector('#structured-undo').disabled");
  const openStructuredInsert=()=>exec("(()=>{const e=document.querySelector('#structured-insert-toggle');if(e.getAttribute('aria-expanded')==='false')e.click();})()");
  await openStructuredInsert();
  await until("!document.querySelector('#structured-insert-panel').hidden&&!document.querySelector('#structured-append').disabled");
  await exec("document.querySelector('[data-insert-category=math]').click()");
  await until("document.querySelector('#structured-insert-kind').value==='math'&&document.querySelector('[data-insert-category=math]').getAttribute('aria-pressed')==='true'");
  await exec("document.querySelector('[data-insert-category=text]').click()");
  await until("document.querySelector('#structured-insert-kind').value==='paragraph'");

  await exec("document.querySelector('#structured-append').click()");
  await until("document.querySelector('#source').value==='新しい本文を入力してください。\\n'&&!document.querySelector('#structured-undo').disabled");
  // UX-09c: insertion closes its panel and focuses the created paragraph's edit action.
  await until("document.querySelector('#structured-insert-panel').hidden&&document.activeElement.matches('[data-rich-edit]')&&document.activeElement.closest('.structured-block').dataset.focused==='true'");
  await exec("document.activeElement.click()");
  await until("document.activeElement.id==='structured-rich-value'");
  await exec("document.querySelector('#structured-cancel').click()");
  await until("document.activeElement.matches('[data-rich-edit]')&&document.querySelector('#structured-editor').dataset.editing==='false'");
  await openStructuredInsert();
  await until("document.activeElement.id==='structured-insert-kind'");
  await exec("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await until("document.querySelector('#structured-insert-panel').hidden&&document.activeElement.id==='structured-insert-toggle'");

  await exec("document.querySelector('#structured-undo').click()");
  await until("document.querySelector('#source').value===''&&!document.querySelector('#structured-redo').disabled");
  await exec("document.querySelector('#structured-redo').click()");
  await until("document.querySelector('#source').value==='新しい本文を入力してください。\\n'");
  await exec("document.querySelector('#editor-view-source').click()");
  await setStructuredSource(structuredFixture);
  await exec("document.querySelector('#editor-view-structured').click()");
  await until("document.querySelector('#structured-undo').disabled&&document.querySelectorAll('[data-structured-edit]').length===3");
  if(!await exec("!document.querySelector('[data-structured-kind=directive] [data-block-delete]')&&!document.querySelector('[data-structured-kind=heading] [data-block-duplicate]')"))throw Error('Protected blocks can be removed or duplicated');
  await exec("document.querySelector('[data-structured-kind=math] [data-block-move=up]').click()");
  const movedFixture=structuredFixture.replace('本文を編集します。\n\n$$\nx^2\n$$',()=> '$$\nx^2\n$$\n\n本文を編集します。');
  await until("document.querySelector('#source').value==="+JSON.stringify(movedFixture));
  await exec("document.querySelector('[data-structured-kind=paragraph] [data-block-duplicate]').click()");
  const duplicatedFixture=movedFixture.replace('本文を編集します。\n\n',()=> '本文を編集します。\n\n本文を編集します。\n\n');
  await until("document.querySelector('#source').value==="+JSON.stringify(duplicatedFixture)+"&&document.querySelectorAll('[data-structured-kind=paragraph]').length===2");
  await exec("document.querySelectorAll('[data-structured-kind=paragraph] [data-block-delete]')[1].click()");
  await until("!!document.querySelector('#structured-delete-confirm')&&document.querySelector('#source').value==="+JSON.stringify(duplicatedFixture));
  await exec("document.querySelector('#structured-delete-confirm').click()");
  await until("document.querySelectorAll('[data-structured-kind=paragraph]').length===1&&!document.querySelector('#structured-undo').disabled");
  await exec("document.querySelector('#structured-undo').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(duplicatedFixture));
  await exec("document.querySelector('#structured-undo').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(movedFixture));
  await exec("document.querySelector('#structured-undo').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(structuredFixture));
  await exec("(()=>{const e=document.querySelector('[data-structured-kind=directive] .structured-block-menu');if(!e.open)e.querySelector('summary').click();e.querySelector('[data-block-insert]').click();})()");
  await until("!document.querySelector('#structured-insert-panel').hidden&&document.querySelector('#structured-insert-position').value!==String(document.querySelectorAll('.structured-block').length)");
  await exec("document.querySelector('[data-insert-category=study]').click()");
  await until("document.querySelector('#structured-insert-kind').value==='example'&&document.querySelector('#source').value==="+JSON.stringify(structuredFixture));
  await exec("document.querySelector('#structured-append').click()");
  await until("!!document.querySelector('[data-study-kind=example]')&&document.querySelector('#source').value.includes(':::component{name=\"example\"}')&&document.querySelector('#source').value.includes('eq-test')&&document.querySelector('#structured-redo').disabled");
  await exec("document.querySelector('#structured-undo').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(structuredFixture));
  await exec("document.querySelector('#editor-view-source').click()");
  await setStructuredSource(sample);
  await setStructuredSource(structuredFixture);
  await exec("document.querySelector('#editor-view-structured').click()");
  await until("document.querySelector('#source').hidden&&!!document.querySelector('#structured-editor')&&document.querySelectorAll('[data-structured-edit]').length===3");
  if(!await exec("document.querySelector('[data-structured-kind=directive] pre').textContent.includes('eq-test')&&!document.querySelector('[data-structured-kind=directive] [data-structured-edit]')"))throw Error('Opaque BCM container not preserved');
  await exec("document.querySelector('[data-structured-kind=heading] [data-structured-edit]').click()");
  await setStructuredValue('新しい見出し');
  await until("!document.querySelector('#structured-apply').disabled&&document.querySelector('#save').disabled&&document.querySelector('#mode-design').disabled");
  await exec("document.querySelector('#structured-cancel').click()");
  await until("!document.querySelector('#structured-value')&&document.querySelector('#source').value==="+JSON.stringify(structuredFixture));
  await exec("document.querySelector('[data-structured-kind=paragraph] [data-structured-edit]').click()");
  await setStructuredValue('# 意図しない見出し');
  await until("document.querySelector('#structured-apply').disabled&&!!document.querySelector('.structured-error')");
  await setStructuredValue('新しい本文です。');
  await exec("document.querySelector('#structured-apply').click()");
  await until("!document.querySelector('#structured-value')&&document.querySelector('#source').value==="+JSON.stringify(structuredFixture.replace('本文を編集します。','新しい本文です。')));
  await exec("document.querySelector('[data-structured-kind=math] [data-structured-edit]').click()");
  await setStructuredValue('x^3');
  await exec("document.querySelector('#structured-apply').click()");
  const editedStructured=structuredFixture.replace('本文を編集します。','新しい本文です。').replace('x^2','x^3');
  await until("!document.querySelector('#structured-value')&&document.querySelector('#source').value==="+JSON.stringify(editedStructured));
  // UX-08b: heading level and multi-line paragraph formatting round-trip.
  await exec("document.querySelector('[data-structured-kind=heading] [data-structured-edit]').click()");
  await exec("(()=>{const e=document.querySelector('#structured-heading-level');e.value='2';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until("!document.querySelector('#structured-apply').disabled");
  await exec("document.querySelector('#structured-apply').click()");
  const leveledStructured=editedStructured.replace('# 見出し','## 見出し');
  await until("!document.querySelector('#structured-value')&&document.querySelector('#source').value==="+JSON.stringify(leveledStructured));
  await exec("document.querySelector('[data-structured-kind=paragraph] [data-structured-edit]').click()");
  await setStructuredValue('新しい本文です。\n次の行です。');
  await exec("document.querySelector('#structured-apply').click()");
  const multilineStructured=leveledStructured.replace('新しい本文です。','新しい本文です。\n次の行です。');
  await until("!document.querySelector('#structured-value')&&document.querySelector('#source').value==="+JSON.stringify(multilineStructured)+"&&document.querySelectorAll('[data-structured-kind=paragraph]').length===1");
  await exec("document.querySelector('[data-structured-kind=paragraph] [data-structured-edit]').click()");
  await exec("(()=>{const e=document.querySelector('#structured-value');e.focus();e.setSelectionRange(0,3);})()");
  await exec("document.querySelector('[data-structured-format=bold]').click()");
  await until("document.querySelector('#structured-value').value.startsWith('**新しい**')");
  await exec("document.querySelector('#structured-apply').click()");
  const formattedStructured=multilineStructured.replace('新しい本文','**新しい**本文');
  await until("!document.querySelector('#structured-value')&&document.querySelector('#source').value==="+JSON.stringify(formattedStructured)+"&&document.querySelector('[data-structured-kind=paragraph] .structured-content span')?.style.fontWeight==='700'");
  await exec("document.querySelector('[data-structured-kind=paragraph] [data-structured-edit]').click()");
  await setStructuredValue('新しい本文です。\n\n別の段落');
  await until("document.querySelector('#structured-apply').disabled");
  await exec("document.querySelector('#structured-cancel').click()");
  await until("!document.querySelector('#structured-value')&&document.querySelector('#source').value==="+JSON.stringify(formattedStructured));
  // UX-08c: engine-generated MathML, template preview, invalid input and inline atom edit.
  await until("!!document.querySelector('[data-structured-kind=math] [data-structured-math=display] math')");
  await exec("document.querySelector('[data-structured-kind=math] [data-structured-edit]').click()");
  await setStructuredValue('\\notacommand{x}');
  await until("document.querySelector('#structured-apply').disabled&&document.querySelector('[data-structured-kind=math] [data-structured-math]').dataset.state==='invalid'");
  await exec("document.querySelector('[data-structured-kind=math] [data-structured-template]').click()");
  await until("!document.querySelector('#structured-apply').disabled&&!!document.querySelector('[data-structured-kind=math] [data-structured-math] mfrac')");
  await exec("document.querySelector('#structured-apply').click()");
  const fractionStructured=formattedStructured.replace('x^3','\\frac{a}{b}');
  await until("!document.querySelector('#structured-value')&&document.querySelector('#source').value==="+JSON.stringify(fractionStructured));
  await exec("document.querySelector('[data-structured-kind=paragraph] [data-structured-edit]').click()");
  await setStructuredValue('**新しい**本文です。\n次の行です。\n式 $x^2$ と $y^2$ です。');
  await exec("document.querySelector('#structured-apply').click()");
  const inlineStructured=fractionStructured.replace('次の行です。','次の行です。\n式 $x^2$ と $y^2$ です。');
  await until("!document.querySelector('#structured-value')&&document.querySelector('#source').value==="+JSON.stringify(inlineStructured)+"&&document.querySelectorAll('[data-structured-kind=paragraph] [data-structured-math=inline] math').length===2");
  await exec("document.querySelector('[data-structured-kind=paragraph] [data-structured-edit]').click()");
  await exec("document.querySelectorAll('[data-structured-inline-edit]')[1].click()");
  await until("document.querySelector('#structured-inline-formula').value==='y^2'&&document.querySelector('#structured-apply').disabled");
  const setInlineFormula=value=>exec("(()=>{const e=document.querySelector('#structured-inline-formula');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await setInlineFormula('\\notacommand{x}');
  await until("document.querySelector('#structured-inline-update').disabled");
  await setInlineFormula('y^3');
  await exec("document.querySelector('#structured-inline-update').click()");
  await until("!document.querySelector('#structured-inline-formula')&&document.querySelector('#structured-value').value.includes('$y^3$')&&!document.querySelector('#structured-apply').disabled");
  if(!await exec("document.querySelector('#source').value==="+JSON.stringify(inlineStructured)))throw Error('Inline draft prematurely changed source');
  await exec("document.querySelector('#structured-apply').click()");
  await until("!document.querySelector('#structured-value')&&document.querySelector('#source').value==="+JSON.stringify(inlineStructured.replace('$y^2$','$y^3$')));
  await exec("document.querySelector('[data-mixed-edit]').click()");
  await until("document.querySelectorAll('[data-mixed-math] math').length===2&&!!document.querySelector('[data-mixed-text]')");
  // UX-08f-5b: mixed formula updates are staged, invalid formula and cancel are safe.
  await exec("document.querySelectorAll('[data-mixed-math-edit]')[1].click()");
  await until("document.querySelector('#mixed-math-formula')?.value==='y^3'&&document.querySelector('#structured-apply').disabled");
  const setMixedFormula=value=>exec("(()=>{const e=document.querySelector('#mixed-math-formula');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await setMixedFormula('\\notacommand{x}');
  await until("document.querySelector('#mixed-math-update').disabled");
  await setMixedFormula('y^4');
  await until("!document.querySelector('#mixed-math-update').disabled");
  await exec("document.querySelector('#mixed-math-update').click()");
  await until("!document.querySelector('#mixed-math-formula')&&!document.querySelector('#structured-apply').disabled&&document.querySelector('#source').value==="+JSON.stringify(inlineStructured.replace('$y^2$','$y^3$')));
  await exec("document.querySelector('#structured-apply').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(inlineStructured.replace('$y^2$','$y^4$')));
  await exec("document.querySelector('#structured-undo').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(inlineStructured.replace('$y^2$','$y^3$')));
  await exec("document.querySelector('[data-mixed-edit]').click()");
  await until("!!document.querySelector('[data-mixed-text]')");

  await exec("document.querySelector('#structured-cancel').click()");
  await until("!document.querySelector('[data-mixed-text]')&&document.querySelector('#source').value==="+JSON.stringify(inlineStructured.replace('$y^2$','$y^3$')));

  // UX-08d: study content and slot transactions, immutable identities and fences.
  const studyFixture=inlineStructured.replace('$y^2$','$y^3$')+'\n::::component{name="example" #gui-example title="確認"}\n:::slot{name="content"}\n問題 $x^2$ を解く。\n:::\n\n:::slot{name="hint"}\nヒントです。\n\n$$\nx^2\n$$\n:::\n::::\n\n:::component{name="explanation" #gui-answer answer-to="gui-example"}\n解説です。\n:::\n\n:::callout{kind="note"}\n補足です。\n:::\n';
  await exec("document.querySelector('#editor-view-source').click()");
  await setStructuredSource(studyFixture);
  await exec("document.querySelector('#editor-view-structured').click()");
  await until("document.querySelectorAll('[data-structured-kind=study]').length===3&&!!document.querySelector('[data-study-kind=example] [data-study-field=hint] math')");
  await exec("document.querySelector('[data-study-kind=example] [data-study-edit]').click()");
  await until("document.querySelector('#save').disabled&&document.querySelector('#mode-design').disabled&&document.querySelectorAll('[data-study-value]').length===2");
  const setStudyValue=(name,value)=>exec("(()=>{const e=[...document.querySelectorAll('[data-study-value]')].find(e=>e.dataset.studyValue==="+JSON.stringify(name)+");Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await setStudyValue('hint','変更を取り消す。');
  await exec("document.querySelector('#structured-study-cancel').click()");
  await until("!document.querySelector('#structured-study-apply')&&document.querySelector('#source').value==="+JSON.stringify(studyFixture));
  await exec("document.querySelector('[data-study-kind=example] [data-study-edit]').click()");
  await setStudyValue('hint',':::slot{name="extra"}\n不正な構造\n:::');
  await until("document.querySelector('#structured-study-apply').disabled");
  await setStudyValue('hint','新しいヒントです。\n\n$$\n\\frac{1}{2}\n$$');
  await setStudyValue('content','問題 $x^3$ を解く。');
  await until("!document.querySelector('#structured-study-apply').disabled&&!!document.querySelector('[data-study-field=hint] mfrac')");
  await exec("document.querySelector('#structured-study-apply').click()");
  const editedStudy=studyFixture.replace('問題 $x^2$ を解く。','問題 $x^3$ を解く。').replace('ヒントです。\n\n$$\nx^2\n$$',()=> '新しいヒントです。\n\n$$\n\\frac{1}{2}\n$$');
  await until("!document.querySelector('#structured-study-apply')&&document.querySelector('#source').value==="+JSON.stringify(editedStudy));
  await exec("document.querySelector('[data-study-kind=explanation] [data-study-edit]').click()");
  await setStudyValue('content','解説を変更しました。');
  await exec("document.querySelector('#structured-study-apply').click()");
  await until("!document.querySelector('#structured-study-apply')&&document.querySelector('#source').value==="+JSON.stringify(editedStudy.replace('解説です。','解説を変更しました。')));



  await exec("document.querySelector('[data-structured-kind=directive] [data-structured-source]').click()");
  await until("!document.querySelector('#source').hidden&&document.querySelector('#source').value.slice(document.querySelector('#source').selectionStart,document.querySelector('#source').selectionEnd).includes('eq-test')");
  // UX-08f-4a: logical editing preserves styled source and blocks unsafe replacements.
  const richFixture='# 章\n\n**重要**な文章です。\n';
  await setStructuredSource(richFixture);
  await exec("document.querySelector('#editor-view-structured').click()");
  await until("!!document.querySelector('[data-structured-kind=paragraph] [data-rich-edit]')&&!document.querySelector('[data-structured-kind=paragraph] .structured-block-menu').open");
  await exec("document.querySelector('[data-structured-kind=paragraph] .structured-block-menu summary').click()");
  await until("document.querySelector('[data-structured-kind=paragraph] .structured-block-menu').open");
  await exec("document.querySelector('[data-structured-kind=paragraph] [data-rich-edit]').click()");
  await until("document.querySelector('#structured-rich-value')?.value==='重要な文章です。'&&!!document.querySelector('.rich-text-preview span[style]')&&!document.querySelector('.rich-format-toolbar')");
  // UX-09a: edit mode hides unrelated actions and keeps the manuscript visible.
  await until("document.querySelector('#structured-editor').dataset.editing==='true'&&document.querySelector('.structured-operation-toolbar').getClientRects().length===0&&document.querySelectorAll('.structured-block[data-active=true]').length===1&&document.querySelector('[data-structured-kind=heading] .structured-content').getClientRects().length>0");
  if(!await exec("[...document.querySelectorAll('.structured-block[data-active=false] .structured-actions')].every(e=>e.getClientRects().length===0)"))throw Error('Unrelated writing actions remain visible');

  const setRichValue=value=>exec("(()=>{const e=document.querySelector('#structured-rich-value');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await setRichValue('重要な文章です。追加。');
  await until("!document.querySelector('#structured-apply').disabled&&document.querySelector('.rich-text-preview').textContent.includes('追加。')");
  await setRichValue('重要な文章です。追加。*');
  await until("document.querySelector('#structured-apply').disabled&&!!document.querySelector('.structured-rich-editor [role=alert]')");
  await setRichValue('重要な文章です。追加。');
  await until("!document.querySelector('#structured-apply').disabled");
  await exec("(()=>{const e=document.querySelector('#structured-rich-value');e.focus();e.setSelectionRange(3,5);e.dispatchEvent(new KeyboardEvent('keyup',{key:'Shift',bubbles:true}));})()");
  await until("!!document.querySelector('[data-rich-format=underline]')&&!document.querySelector('[data-rich-format=underline]').disabled");
  await exec("document.querySelector('[data-rich-format=underline]').click()");
  await until("Array.from(document.querySelectorAll('.rich-text-preview span')).some(s=>s.textContent==='文章'&&s.style.textDecoration==='underline')");
  await exec("document.querySelector('#structured-apply').click()");
  const richExpected=richFixture.replace('な文章です。','な:style{text="文章" underline="true"}です。追加。');
  await until("!document.querySelector('#structured-rich-value')&&document.querySelector('#source').value==="+JSON.stringify(richExpected));
  await until("document.querySelector('#structured-editor').dataset.editing==='false'&&document.querySelector('.structured-operation-toolbar').getClientRects().length>0&&document.activeElement.matches('[data-rich-edit]')");
  if(!await exec("(()=>{const row=document.querySelector('[data-structured-kind=paragraph]'),m=row.querySelector('.structured-more-actions');return !m.open&&row.querySelector('[data-rich-edit]').getClientRects().length>0&&row.querySelector('[data-structured-edit]').getClientRects().length===0;})()"))throw Error('Secondary source controls are exposed by default');
  await exec("document.querySelector('[data-structured-kind=paragraph] .structured-more-actions summary').click()");
  await until("document.querySelector('[data-structured-kind=paragraph] [data-structured-edit]').getClientRects().length>0");
  await exec("document.querySelector('[data-structured-kind=paragraph] .structured-more-actions summary').click()");

  await exec("document.querySelector('#structured-undo').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(richFixture));
  // UX-08f-5d: target the paragraph, not the first rich-edit button (the heading).
  await exec("document.querySelector('[data-structured-kind=paragraph] [data-rich-edit]').click()");
  await until("!!document.querySelector('#structured-rich-value')&&!!document.querySelector('#rich-math-insert')");
  await setRichValue('重要な文章です。追加。');
  await until("document.querySelector('#structured-rich-value')?.value==='重要な文章です。追加。'&&!document.querySelector('#rich-math-insert')?.disabled");
  await exec("(()=>{const e=document.querySelector('#structured-rich-value');e.focus();e.setSelectionRange(3,3);document.querySelector('#rich-math-insert').click();})()");
  await until("!!document.querySelector('#rich-math-formula')&&document.querySelector('#structured-apply').disabled");
  await exec("document.querySelector('#rich-math-cancel').click()");
  await until("document.querySelector('#structured-rich-value').value==='重要な文章です。追加。'&&!document.querySelector('#rich-math-formula')");
  await exec("(()=>{const e=document.querySelector('#structured-rich-value');e.focus();e.setSelectionRange(3,3);document.querySelector('#rich-math-insert').click();})()");
  await until("!!document.querySelector('#rich-math-formula')");
  await exec("(()=>{const e=document.querySelector('#rich-math-formula');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'x^2');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await until("!document.querySelector('#rich-math-update').disabled");
  await exec("document.querySelector('#rich-math-update').click()");
  await until("!!document.querySelector('[data-mixed-math] math')&&document.querySelector('#source').value==="+JSON.stringify(richFixture));
  await exec("document.querySelector('#structured-apply').click()");
  const richMathExpected=richFixture.replace('な文章です。','な$x^2$文章です。追加。');
  await until("document.querySelector('#source').value==="+JSON.stringify(richMathExpected));
  // UX-08f-5e: remove the final math atom, preserving surrounding text and styles.
  await exec("document.querySelector('[data-mixed-edit]').click()");
  await until("!!document.querySelector('[data-remove-kind=math]')");
  await exec("document.querySelector('[data-remove-kind=math]').click()");
  await until("!!document.querySelector('#mixed-remove-confirm')&&document.querySelector('#structured-apply').disabled");
  await exec("document.querySelector('#mixed-remove-cancel').click()");
  await until("!document.querySelector('#mixed-remove-confirm')&&document.querySelector('#source').value==="+JSON.stringify(richMathExpected));
  await exec("document.querySelector('[data-remove-kind=math]').click()");
  await until("!document.querySelector('#mixed-remove-confirm').disabled");
  await exec("document.querySelector('#mixed-remove-confirm').click()");
  const mathRemoved=richMathExpected.replace('$x^2$','');
  await until("document.querySelector('#source').value==="+JSON.stringify(mathRemoved)+"&&!!document.querySelector('[data-structured-kind=paragraph] [data-rich-edit]')&&!document.querySelector('[data-mixed-edit]')");
  await exec("document.querySelector('[data-structured-kind=paragraph] [data-rich-edit]').click()");
  await until("document.querySelector('#structured-rich-value')?.value==='重要な文章です。追加。'");
  await exec("document.querySelector('#structured-cancel').click()");
  await exec("document.querySelector('#structured-undo').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(richMathExpected));
  await exec("document.querySelector('#structured-undo').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(richFixture));
  await exec("document.querySelector('#editor-view-source').click()");
  // UX-08f-6a: text replacement and deletion across multiple style runs.
  const crossStyleFixture='# 章\n\n**重要**な*文章*です。\n';
  await setStructuredSource(crossStyleFixture);
  await exec("document.querySelector('#editor-view-structured').click()");
  await until("!!document.querySelector('[data-structured-kind=paragraph] [data-rich-edit]')");
  await exec("document.querySelector('[data-structured-kind=paragraph] [data-rich-edit]').click()");
  await until("document.querySelector('#structured-rich-value')?.value==='重要な文章です。'");
  await setRichValue('重新章です。');
  await until("!document.querySelector('#structured-apply').disabled&&Array.from(document.querySelectorAll('.rich-text-preview span')).some(s=>s.textContent==='重'&&s.style.fontWeight==='700')&&Array.from(document.querySelectorAll('.rich-text-preview span')).some(s=>s.textContent==='章'&&s.style.fontStyle==='italic')");
  await exec("document.querySelector('#structured-apply').click()");
  const crossStyleExpected=crossStyleFixture.replace('**重要**な*文章*','**重**新*章*');
  await until("document.querySelector('#source').value==="+JSON.stringify(crossStyleExpected));
  await exec("document.querySelector('#structured-undo').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(crossStyleFixture));
  await exec("document.querySelector('[data-structured-kind=paragraph] [data-rich-edit]').click()");
  await until("document.querySelector('#structured-rich-value')?.value==='重要な文章です。'");
  await setRichValue('重章です。');
  await until("!document.querySelector('#structured-apply').disabled&&Array.from(document.querySelectorAll('.rich-text-preview span')).some(s=>s.textContent==='重'&&s.style.fontWeight==='700')&&Array.from(document.querySelectorAll('.rich-text-preview span')).some(s=>s.textContent==='章'&&s.style.fontStyle==='italic')");
  await exec("document.querySelector('#structured-cancel').click()");
  await until("!document.querySelector('#structured-rich-value')&&document.querySelector('#source').value==="+JSON.stringify(crossStyleFixture));
  // UX-08f-6b: mixed style selection toggles a single property without changing text.
  await exec("document.querySelector('[data-structured-kind=paragraph] [data-rich-edit]').click()");
  await until("document.querySelector('#structured-rich-value')?.value==='重要な文章です。'");
  await exec("(()=>{const e=document.querySelector('#structured-rich-value');e.focus();e.setSelectionRange(1,4);e.dispatchEvent(new KeyboardEvent('keyup',{key:'Shift',bubbles:true}));})()");
  await until("document.querySelector('[data-rich-format=underline]')?.getAttribute('aria-pressed')==='false'");
  await exec("document.querySelector('[data-rich-format=underline]').click()");
  await until("document.querySelector('[data-rich-format=underline]')?.getAttribute('aria-pressed')==='true'&&Array.from(document.querySelectorAll('.rich-text-preview span')).some(s=>s.textContent==='要'&&s.style.fontWeight==='700'&&s.style.textDecoration==='underline')&&Array.from(document.querySelectorAll('.rich-text-preview span')).some(s=>s.textContent==='文'&&s.style.fontStyle==='italic'&&s.style.textDecoration==='underline')");
  await exec("document.querySelector('[data-rich-format=underline]').click()");
  await until("document.querySelector('[data-rich-format=underline]')?.getAttribute('aria-pressed')==='false'&&!Array.from(document.querySelectorAll('.rich-text-preview span')).some(s=>s.style.textDecoration==='underline')");
  await exec("document.querySelector('[data-rich-format=underline]').click()");
  await until("document.querySelector('[data-rich-format=underline]')?.getAttribute('aria-pressed')==='true'&&!document.querySelector('#structured-apply').disabled");
  await exec("document.querySelector('#structured-apply').click()");
  await until("!document.querySelector('#structured-rich-value')&&document.querySelector('#source').value.includes('underline=\"true\"')");
  await exec("document.querySelector('#structured-undo').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(crossStyleFixture));
  await exec("document.querySelector('#editor-view-source').click()");
  // UX-08f-4b: caret split, join, list conversion, item edits and safe indentation.
  const paragraphFixture='# 章\n\n最初の文章。次の文章。\n';
  await setStructuredSource(paragraphFixture);
  await exec("document.querySelector('#editor-view-structured').click()");
  await exec("document.querySelector('[data-structured-kind=paragraph] [data-rich-edit]').click()");
  await until("!!document.querySelector('#structured-rich-value')");
  await exec("(()=>{const e=document.querySelector('#structured-rich-value');e.focus();e.setSelectionRange(6,6);e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true,cancelable:true}));})()");
  const splitFixture=paragraphFixture.replace('最初の文章。次','最初の文章。\n\n次');
  await until("!document.querySelector('#structured-rich-value')&&document.querySelector('#source').value==="+JSON.stringify(splitFixture)+"&&document.querySelectorAll('[data-structured-kind=paragraph]').length===2");
  await exec("document.querySelector('[data-structured-kind=paragraph] .structured-block-menu summary').click()");
  await exec("document.querySelector('[data-paragraph-join]').click()");
  const joinedFixture=splitFixture.replace('。\n\n次','。\n次');
  await until("document.querySelector('#source').value==="+JSON.stringify(joinedFixture)+"&&document.querySelectorAll('[data-structured-kind=paragraph]').length===1");
  await exec("(()=>{const e=document.querySelector('[data-structured-kind=paragraph] .structured-block-menu');if(!e.open)e.querySelector('summary').click();})()");
  await exec("document.querySelector('[data-list-convert=ordered]').click()");
  const orderedFixture='# 章\n\n1. 最初の文章。\n2. 次の文章。\n';
  await until("document.querySelector('#source').value==="+JSON.stringify(orderedFixture)+"&&document.querySelectorAll('[data-list-item]').length===2");
  await exec("document.querySelector('[data-list-item=\"1\"] .structured-list-item-menu summary').click()");
  await exec("document.querySelector('[data-list-indent=\"1\"]').click()");
  await until("document.querySelector('[data-list-item=\"1\"]').dataset.depth==='1'&&document.querySelector('#source').value.includes('   2. 次の文章。')");
  await exec("(()=>{const e=document.querySelector('[data-list-item=\"1\"] .structured-list-item-menu');if(!e.open)e.querySelector('summary').click();})()");
  await exec("document.querySelector('[data-list-outdent=\"1\"]').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(orderedFixture));
  await exec("document.querySelector('[data-list-edit]').click()");
  await until("!!document.querySelector('[data-list-value=\"1\"]')&&document.querySelector('#save').disabled");
  await exec("(()=>{const e=document.querySelector('[data-list-value=\"1\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'変更した項目。');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await exec("document.querySelector('#structured-list-apply').click()");
  await until("!document.querySelector('#structured-list-apply')&&document.querySelector('#source').value==="+JSON.stringify(orderedFixture.replace('次の文章。','変更した項目。')));
  await exec("document.querySelector('#structured-undo').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(orderedFixture));
  // UX-08f-4c: draft-only list insertion/removal, renumbering, cancellation and undo.
  await exec("document.querySelector('[data-list-edit]').click()");
  await exec("document.querySelector('[data-list-add=\"0\"]').click()");
  await until("document.querySelectorAll('[data-list-value]').length===3&&document.querySelector('#structured-list-apply').disabled&&document.querySelector('#source').value==="+JSON.stringify(orderedFixture));
  await exec("(()=>{const e=document.querySelector('[data-list-value=\"1\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'追加した項目。');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await until("!document.querySelector('#structured-list-apply').disabled");
  await exec("document.querySelector('#structured-list-apply').click()");
  const addedList=orderedFixture.replace('2. 次の文章。','2. 追加した項目。\n3. 次の文章。');
  await until("!document.querySelector('#structured-list-apply')&&document.querySelector('#source').value==="+JSON.stringify(addedList));
  await exec("document.querySelector('[data-list-edit]').click()");
  await exec("document.querySelector('[data-list-remove=\"1\"]').click()");
  await until("document.querySelectorAll('[data-list-value]').length===2&&document.querySelector('#source').value==="+JSON.stringify(addedList));
  await exec("document.querySelector('#structured-list-cancel').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(addedList)+"&&!document.querySelector('#structured-list-apply')");
  await exec("document.querySelector('[data-list-edit]').click()");
  await exec("document.querySelector('[data-list-remove=\"1\"]').click()");
  await exec("document.querySelector('#structured-list-apply').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(orderedFixture));
  await exec("document.querySelector('#structured-undo').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(addedList));
  await exec("document.querySelector('#structured-undo').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(orderedFixture));
  // UX-08f-4d: keyboard insertion, empty-row removal, IME guard, draft hierarchy and undo.
  await exec("document.querySelector('[data-list-edit]').click()");
  await until("!!document.querySelector('[data-list-value=\"0\"]')");
  const listKey=(i,key,shift=false,ime=false)=>exec("(()=>{const e=document.querySelector('[data-list-value=\""+i+"\"]');e.focus();e.setSelectionRange(e.value.length,e.value.length);e.dispatchEvent(new KeyboardEvent('keydown',{key:"+JSON.stringify(key)+",shiftKey:"+shift+",isComposing:"+ime+",bubbles:true,cancelable:true}));})()");
  await listKey(0,'Enter',false,true);
  await until("document.querySelectorAll('[data-list-value]').length===2");
  await listKey(0,'Enter');
  await until("document.querySelectorAll('[data-list-value]').length===3&&document.activeElement.dataset.listValue==='1'&&document.querySelector('#structured-list-apply').disabled");
  await listKey(1,'Backspace');
  await until("document.querySelectorAll('[data-list-value]').length===2&&document.activeElement.dataset.listValue==='0'&&document.querySelector('#source').value==="+JSON.stringify(orderedFixture));
  await listKey(1,'Tab');
  await until("document.querySelector('[data-list-item=\"1\"]').dataset.depth==='1'&&document.querySelector('#source').value==="+JSON.stringify(orderedFixture));
  await listKey(1,'Tab',true);
  await until("document.querySelector('[data-list-item=\"1\"]').dataset.depth==='0'&&document.querySelector('#structured-list-apply').disabled");
  await listKey(1,'Tab');
  await until("!document.querySelector('#structured-list-apply').disabled");
  await exec("document.querySelector('#structured-list-apply').click()");
  await until("document.querySelector('#source').value.includes('   2. 次の文章。')&&!document.querySelector('#structured-list-apply')");
  await exec("document.querySelector('#structured-undo').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(orderedFixture));
  await exec("(()=>{const e=document.querySelector('[data-structured-kind=list] details.structured-block-menu');if(!e.open)e.querySelector('summary').click();})()");
  await exec("document.querySelector('[data-list-convert=bullet]').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify('# 章\n\n- 最初の文章。\n- 次の文章。\n'));
  await exec("document.querySelector('[data-list-convert=bullet]').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(joinedFixture));
  await exec("document.querySelector('#editor-view-source').click()");
  // UX-08f-3: persistent study ID, typed answer targets and whole-book validation.
  const linkFixture='# 章\n\n:::component{name="exercise"}\n問題を解く。\n:::\n\n:::component{name="example" #another-problem}\n例題です。\n:::\n\n:::component{name="explanation"}\n解説です。\n:::\n';
  await setStructuredSource(linkFixture);
  await exec("document.querySelector('#editor-view-structured').click()");
  await exec("document.querySelector('[data-study-kind=exercise] [data-study-links]').click()");
  await until("!!document.querySelector('#study-link-editor')&&document.querySelector('#structured-study-id').value===''&&document.querySelector('#save').disabled");
  await exec("document.querySelector('#structured-study-generate-id').click()");
  const problemId=await exec("document.querySelector('#structured-study-id').value");
  await exec("document.querySelector('#structured-study-link-cancel').click()");
  await until("!document.querySelector('#study-link-editor')&&document.querySelector('#source').value==="+JSON.stringify(linkFixture));
  await exec("document.querySelector('[data-study-kind=exercise] [data-study-links]').click()");
  await until("!!document.querySelector('#structured-study-generate-id')");
  await exec("document.querySelector('#structured-study-generate-id').click()");
  const generatedProblem=await exec("document.querySelector('#structured-study-id').value");
  if(!generatedProblem.startsWith('study-')||problemId===generatedProblem)throw Error('Study identity generation failed');
  await exec("document.querySelector('#structured-study-link-apply').click()");
  const identifiedFixture=linkFixture.replace('name="exercise"}','name="exercise" #'+generatedProblem+'}');
  await until("!document.querySelector('#study-link-editor')&&document.querySelector('#source').value==="+JSON.stringify(identifiedFixture));
  await exec("document.querySelector('[data-study-kind=exercise] [data-study-links]').click()");
  await until("document.querySelector('#structured-study-id')?.value==="+JSON.stringify(generatedProblem)+"&&!document.querySelector('#structured-study-generate-id')");
  await exec("document.querySelector('#structured-study-link-cancel').click()");
  await exec("document.querySelector('[data-study-kind=explanation] [data-study-links]').click()");
  await until("document.querySelector('#structured-study-target')?.options.length===3&&Array.from(document.querySelector('#structured-study-target').options).some(o=>o.value==="+JSON.stringify(generatedProblem)+"&&o.textContent.includes('1.1'))");
  await exec("(()=>{const e=document.querySelector('#structured-study-target');e.value="+JSON.stringify(generatedProblem)+";e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await exec("document.querySelector('#structured-study-link-apply').click()");
  const linkedFixture=identifiedFixture.replace('name="explanation"}','name="explanation" answer-to="'+generatedProblem+'"}');
  await until("!document.querySelector('#study-link-editor')&&document.querySelector('#source').value==="+JSON.stringify(linkedFixture));
  await exec("document.querySelector('#preview-book').click()");
  await until("document.querySelector('#workspace-layout-state').dataset.phase==='ready'&&document.querySelector('#workspace-layout-state').dataset.scope==='book'");
  await exec("document.querySelector('[data-study-kind=explanation] [data-study-links]').click()");
  await until("document.querySelector('#structured-study-target')?.value==="+JSON.stringify(generatedProblem));
  await exec("(()=>{const e=document.querySelector('#structured-study-target');e.value='';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await exec("document.querySelector('#structured-study-link-apply').click()");
  await until("!document.querySelector('#study-link-editor')&&!document.querySelector('#source').value.includes('answer-to=')");
  await exec("document.querySelector('#structured-undo').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(linkedFixture));
  await exec("document.querySelector('#editor-view-source').click()");
  // UX-08f-2: stable numbered equation, reference picker and protected numbering.
  const numberedFixture='# 章\n\n本文です。\n\n$$\nx^2\n$$\n';
  await setStructuredSource(numberedFixture);
  await exec("document.querySelector('#editor-view-structured').click()");
  await exec("document.querySelector('[data-structured-kind=math] [data-structured-numbering]').click()");
  await until("!!document.querySelector('[data-equation-wrapper] math')&&document.querySelector('[data-equation-wrapper]').dataset.equationWrapper.startsWith('eq-')&&!document.querySelector('#structured-undo').disabled");
  const structuredEqId=await exec("document.querySelector('[data-equation-wrapper]').dataset.equationWrapper");
  const numberedSource=await exec("document.querySelector('#source').value");
  if(!numberedSource.includes('#'+structuredEqId+' numbered="true"'))throw Error('Missing persistent numbered equation identity');
  await exec("document.querySelector('[data-equation-edit]').click()");
  await setStructuredValue('x^3');
  await until("!document.querySelector('#structured-apply').disabled");
  await exec("document.querySelector('#structured-apply').click()");
  const formulaSource=numberedSource.replace('x^2','x^3');
  await until("!document.querySelector('#structured-value')&&document.querySelector('#source').value==="+JSON.stringify(formulaSource));
  await exec("document.querySelector('[data-structured-kind=paragraph] [data-structured-edit]').click()");
  await exec("(()=>{const e=document.querySelector('#structured-value');e.focus();e.setSelectionRange(2,2);})()");
  await exec("document.querySelector('#structured-reference-open').click()");
  await until("document.querySelector('#equation-reference-target')?.value==="+JSON.stringify(structuredEqId)+"&&document.querySelector('#source').hidden");
  await exec("document.querySelector('#equation-reference-cancel').click()");
  await until("!document.querySelector('#equation-reference-editor')&&document.querySelector('#structured-value').value==='本文です。'");
  await exec("(()=>{const e=document.querySelector('#structured-value');e.focus();e.setSelectionRange(2,2);})()");
  await exec("document.querySelector('#structured-reference-open').click()");
  await until("!document.querySelector('#equation-reference-apply')?.disabled&&!!document.querySelector('#equation-reference-apply')");
  await exec("document.querySelector('#equation-reference-apply').click()");
  const referenceSource=formulaSource.replace('本文です。','本文:ref{target="'+structuredEqId+'" format="label-number"}です。');
  await until("!document.querySelector('#equation-reference-editor')&&!document.querySelector('#structured-value')&&document.querySelector('#source').hidden&&document.querySelector('#source').value==="+JSON.stringify(referenceSource));
  // UX-08f-5a: edit text around a protected reference, preserving the token.
  await until("!!document.querySelector('[data-mixed-reference]')&&!!document.querySelector('[data-mixed-edit]')");
  await exec("document.querySelector('[data-mixed-edit]').click()");
  await until("document.querySelector('[data-mixed-text=\"0\"]')?.value==='本文'&&document.querySelector('#save').disabled");
  const setMixed=(i,value)=>exec("(()=>{const e=document.querySelector('[data-mixed-text=\""+i+"\"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await exec("(()=>{const e=document.querySelector('[data-mixed-text=\"0\"]');e.focus();e.setSelectionRange(1,1);document.querySelector('[data-mixed-math-insert=\"0\"]').click();})()");
  await until("!!document.querySelector('#mixed-math-formula')");
  await setMixedFormula('x^2');
  await until("!document.querySelector('#mixed-math-update').disabled");
  await exec("document.querySelector('#mixed-math-update').click()");
  await until("!!document.querySelector('[data-mixed-math] math')&&!!document.querySelector('[data-mixed-reference]')&&document.querySelector('#source').value==="+JSON.stringify(referenceSource));
  await exec("document.querySelector('#structured-apply').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(referenceSource.replace('本文:ref','本$x^2$文:ref')));
  await exec("document.querySelector('#structured-undo').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(referenceSource));
  await exec("document.querySelector('[data-mixed-edit]').click()");
  await until("document.querySelector('[data-mixed-text=\"0\"]')?.value==='本文'");

  await setMixed(0,'本文*');
  await until("document.querySelector('#structured-apply').disabled");
  await setMixed(0,'新しい本文');
  await until("!document.querySelector('#structured-apply').disabled&&document.querySelector('#source').value==="+JSON.stringify(referenceSource));
  await exec("document.querySelector('#structured-apply').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(referenceSource.replace('本文:ref','新しい本文:ref'))+"&&!document.querySelector('[data-mixed-text]')");
  await exec("document.querySelector('#structured-undo').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(referenceSource));

  await exec("document.querySelector('[data-equation-wrapper] [data-structured-numbering]').click()");
  await until("!document.querySelector('#open').disabled&&document.querySelector('#status').textContent.includes('Book validation failed')");
  if(!await exec("document.querySelector('#source').value==="+JSON.stringify(referenceSource)))throw Error('Referenced equation numbering was removed');
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"document.querySelector('#preview > div')?.shadowRoot?.textContent.includes('式 (1.1)')&&!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-equation-number]')"+")");
  await exec("document.querySelector('#structured-undo').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(formulaSource));
  await exec("document.querySelector('#editor-view-source').click()");
  // UX-08f-5c: select, cancel, retarget, insert and undo a reference in mixed text.
  const twoRefs=referenceSource+'\n:::layout{#eq-mixed-second numbered="true"}\n$$\ny^2\n$$\n:::\n';
  await setStructuredSource(twoRefs);
  await exec("document.querySelector('#editor-view-structured').click()");
  await exec("document.querySelector('[data-mixed-edit]').click()");
  await exec("document.querySelector('[data-mixed-reference-edit]').click()");
  await until("document.querySelector('#equation-reference-target')?.value==="+JSON.stringify(structuredEqId)+"&&Array.from(document.querySelector('#equation-reference-target').options).some(o=>o.value==='eq-mixed-second')");
  await exec("document.querySelector('#equation-reference-cancel').click()");
  await until("!document.querySelector('#equation-reference-editor')&&!!document.querySelector('[data-mixed-text]')&&document.querySelector('#source').value==="+JSON.stringify(twoRefs));
  await setMixed(0,'新しい本文');
  await exec("document.querySelector('[data-mixed-reference-edit]').click()");
  await until("!!document.querySelector('#equation-reference-target')");
  await exec("(()=>{const e=document.querySelector('#equation-reference-target');e.value='eq-mixed-second';e.dispatchEvent(new Event('change',{bubbles:true}));const f=document.querySelector('#equation-reference-format');f.value='number';f.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until("document.querySelector('#equation-reference-target').value==='eq-mixed-second'&&document.querySelector('#equation-reference-format').value==='number'");
  await exec("document.querySelector('#equation-reference-apply').click()");
  const retargeted=twoRefs.replace('本文:ref{target="'+structuredEqId+'" format="label-number"}','新しい本文:ref{target="eq-mixed-second" format="number"}');
  await until("!document.querySelector('#equation-reference-editor')&&!document.querySelector('[data-mixed-text]')&&document.querySelector('#source').value==="+JSON.stringify(retargeted));
  await exec("document.querySelector('[data-mixed-edit]').click()");
  await exec("(()=>{const e=document.querySelector('[data-mixed-text=\"0\"]');e.focus();e.setSelectionRange(1,1);document.querySelector('[data-mixed-reference-insert=\"0\"]').click();})()");
  await until("!!document.querySelector('#equation-reference-target')");
  await exec("document.querySelector('#equation-reference-apply').click()");
  const insertedRef=retargeted.replace('新しい本文','新:ref{target="'+structuredEqId+'" format="label-number"}しい本文');
  await until("!document.querySelector('#equation-reference-editor')&&document.querySelector('#source').value==="+JSON.stringify(insertedRef));
  await exec("document.querySelector('#structured-undo').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(retargeted));
  await exec("document.querySelector('#structured-undo').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(twoRefs));
  // UX-08f-6c: select text, math and reference in one rendered range.
  await exec("document.querySelector('#editor-view-source').click()");
  const rangeFixture=twoRefs.replace('本文:ref','前半$x^2$と:ref');
  await setStructuredSource(rangeFixture);
  await exec("document.querySelector('#editor-view-structured').click()");
  await until("!!document.querySelector('[data-mixed-edit]')");
  await exec("document.querySelector('[data-mixed-edit]').click()");
  await until("!!document.querySelector('#mixed-range-open')");
  await exec("document.querySelector('#mixed-range-open').click()");
  await until("!!document.querySelector('#mixed-range-preview')&&document.querySelector('#structured-apply').disabled");
  const selectMixedRange=()=>exec("(()=>{const root=document.querySelector('#mixed-range-preview'),a=root.firstElementChild.firstChild,b=root.lastElementChild.firstChild,r=document.createRange();r.setStart(a,1);r.setEnd(b,1);const s=window.getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new Event('selectionchange'));})()");
  await selectMixedRange();
  await until("document.querySelector('#mixed-range-summary').textContent.includes('数式 1 件・参照 1 件')&&!document.querySelector('#mixed-range-apply').disabled");
  await exec("document.querySelector('#mixed-range-cancel').click()");
  await until("!document.querySelector('#mixed-range-preview')&&document.querySelector('#source').value==="+JSON.stringify(rangeFixture));
  await exec("document.querySelector('#mixed-range-open').click()");
  await until("!!document.querySelector('#mixed-range-preview')");
  await selectMixedRange();
  await exec("(()=>{const e=document.querySelector('#mixed-range-replacement');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'新');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await until("!document.querySelector('#mixed-range-apply').disabled");
  await exec("document.querySelector('#mixed-range-apply').click()");
  const rangeExpected=rangeFixture.replace('前半$x^2$と:ref{target="'+structuredEqId+'" format="label-number"}で','前新');
  await until("document.querySelector('#source').value==="+JSON.stringify(rangeExpected)+"&&!document.querySelector('#mixed-range-preview')&&document.querySelectorAll('[data-equation-wrapper]').length===2");
  await exec("document.querySelector('#structured-undo').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(rangeFixture));
  await exec("document.querySelector('#editor-view-source').click()");
  await setStructuredSource(formulaSource);
  await exec("document.querySelector('#editor-view-structured').click()");
  await until("!!document.querySelector('[data-structured-kind=paragraph] [data-rich-edit]')");
  await exec("document.querySelector('[data-structured-kind=paragraph] [data-rich-edit]').click()");
  await until("!!document.querySelector('#rich-reference-insert')");
  await setRichValue('新しい本文です。');
  await until("document.querySelector('#structured-rich-value')?.value==='新しい本文です。'&&!document.querySelector('#rich-reference-insert')?.disabled");
  await exec("(()=>{const e=document.querySelector('#structured-rich-value');e.focus();e.setSelectionRange(5,5);document.querySelector('#rich-reference-insert').click();})()");
  await until("!!document.querySelector('#equation-reference-target')");
  await exec("document.querySelector('#equation-reference-cancel').click()");
  await until("!document.querySelector('#equation-reference-editor')&&document.querySelector('#structured-rich-value').value==='新しい本文です。'");
  await exec("(()=>{const e=document.querySelector('#structured-rich-value');e.focus();e.setSelectionRange(5,5);document.querySelector('#rich-reference-insert').click();})()");
  await until("!!document.querySelector('#equation-reference-target')");
  await exec("document.querySelector('#equation-reference-apply').click()");
  const richRefExpected=formulaSource.replace('本文です。','新しい本文:ref{target="'+structuredEqId+'" format="label-number"}です。');
  await until("!document.querySelector('#equation-reference-editor')&&document.querySelector('#source').value==="+JSON.stringify(richRefExpected));
  await exec("document.querySelector('[data-mixed-edit]').click()");
  await until("!!document.querySelector('[data-remove-kind=reference]')");
  await setMixed(0,'修正した本文');
  await until("document.querySelector('[data-mixed-text=\"0\"]')?.value==='修正した本文'");
  await exec("document.querySelector('[data-remove-kind=reference]').click()");
  await until("!document.querySelector('#mixed-remove-confirm').disabled");
  await exec("document.querySelector('#mixed-remove-confirm').click()");
  const refRemoved=formulaSource.replace('本文です。','修正した本文です。');
  await until("document.querySelector('#source').value==="+JSON.stringify(refRemoved)+"&&!!document.querySelector('[data-structured-kind=paragraph] [data-rich-edit]')&&!!document.querySelector('[data-equation-wrapper]')");
  await exec("document.querySelector('#structured-undo').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(richRefExpected));
  await exec("document.querySelector('#structured-undo').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(formulaSource));
  await exec("document.querySelector('#editor-view-source').click()");
  await setStructuredSource(sample);
  await until("document.querySelector('#source').value==="+JSON.stringify(sample));

  if(!await exec("document.querySelector('.writing-toolbar button').getClientRects().length>0&&[...document.querySelectorAll('.writing-tool-panel')].every(e=>e.hidden)"))throw Error('Writing default exposes detailed commands');
  await exec("(()=>{const e=document.querySelector('#source');e.focus();e.setSelectionRange(0,0);})()");
  await until("['bold','italic','underline'].every(id=>document.querySelector('#source-'+id).disabled)");
  await exec("(()=>{const e=document.querySelector('#source'),p=e.value.indexOf('本文');e.focus();e.setSelectionRange(p,p+2);})()");
  await until("['bold','italic','underline'].every(id=>!document.querySelector('#source-'+id).disabled)");
  await exec("document.querySelector('#writing-panel-math').click()");
  await until("!document.querySelector('#writing-tools-math').hidden&&document.querySelector('#writing-tools-format').hidden");
  await exec("document.querySelector('#writing-panel-format').click()");
  await until("document.querySelector('#writing-tools-math').hidden&&!document.querySelector('#writing-tools-format').hidden&&!document.querySelector('#format-selection-controls').hidden");
  await exec("(()=>{const e=document.querySelector('#source');e.focus();e.setSelectionRange(0,0);})()");
  await until("document.querySelector('#format-selection-controls').hidden&&document.querySelector('#format-selection-hint').textContent.includes('文字を選択')&&document.querySelector('#source-bold').disabled");
  if(!await exec("document.querySelector('#source').value==="+JSON.stringify(sample)))throw Error('Toolbar panel switch changed manuscript');
  await exec("document.querySelector('#writing-panel-format').click()");
  await until("[...document.querySelectorAll('.writing-tool-panel')].every(e=>e.hidden)");
  await exec("document.querySelector('#writing-panel-study').click()");
  await until("!document.querySelector('#writing-tools-study').hidden");
  if(!await exec("!document.querySelector('#study-insertion-details').open&&!document.querySelector('#study-instance-id').getClientRects().length&&!!document.querySelector('#study-append').getClientRects().length"))throw Error('Study insertion exposes metadata by default');
  await exec("document.querySelector('#study-insertion-details summary').click()");
  await until("document.querySelector('#study-insertion-details').open&&!!document.querySelector('#study-instance-id').getClientRects().length");
  await exec("document.querySelector('#study-insertion-details summary').click()");
  await until("!document.querySelector('#study-insertion-details').open");
  await exec("document.querySelector('#writing-panel-study').click()");
  await until("[...document.querySelectorAll('.writing-tool-panel')].every(e=>e.hidden)");
  if(!await exec("document.querySelector('#source').value==="+JSON.stringify(sample)))throw Error('Insertion details changed manuscript');
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-inline-math] math msup')&&!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-display-math] math mfrac')&&document.querySelector('#preview > div').shadowRoot.querySelector('[data-equation-number]')?.textContent==='(1.1)'"+")");
  await exec("document.fonts.ready.then(()=>true)");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"(()=>{const root=document.querySelector('#preview > div')?.shadowRoot,math=[...root?.querySelectorAll('math')??[]],faces=[...document.fonts];return math.length===2&&math.every(m=>m.style.fontFamily.includes('BCFont_STIXTwoMath'))&&faces.some(f=>f.family.includes('BCFont_NotoSansJP')&&f.status==='loaded')&&faces.some(f=>f.family.includes('BCFont_STIXTwoMath')&&f.status==='loaded');})()"+")");
  await exec("document.querySelector('#save').click()");
  await until("document.querySelector('#status').textContent.includes('保存しました')");
  if(await readFile(join(smokeRoot,'manuscript','chapter.md'),'utf8')!==sample)throw Error('Packaged app source save mismatch');
  await until("document.querySelector('#workspace-save-state').textContent==='未保存：テーマ'&&document.querySelector('#workspace-layout-state').dataset.phase==='ready'&&document.querySelector('#workspace-layout-state').dataset.scope==='manuscript'");
  // A saved manuscript does not imply a saved theme or a current whole-book plan.
  await exec("document.querySelector('#mode-design').click()");
  await until("document.querySelector('.workspace-shell').dataset.workspaceMode==='design'");
  await exec("document.querySelector('#save-theme').click()");
  await until("document.querySelector('#workspace-save-state').textContent==='保存済み'");
  await exec("document.querySelector('#mode-writing').click()");
  await until("document.querySelector('.workspace-shell').dataset.workspaceMode==='writing'");
  const navigationSample=sample+'\n'+Array.from({length:10},()=>('ページ移動のための日本語本文を確認します。'.repeat(22))).join('\n\n')+'\n';
  const setNavigationSource=value=>exec("(()=>{const e=document.querySelector('#source');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await setNavigationSource(navigationSample);
  await exec("document.querySelector('#mode-publication').click()");
  await until("document.querySelector('#publication-save').dataset.state==='required'&&document.querySelector('#publication-layout').dataset.state==='required'");
  await exec("document.querySelector('#publication-compose').click()");
  await until("document.querySelector('.workspace-shell').dataset.workspaceMode==='layout'");
  await until("document.querySelector('#workspace-layout-state').dataset.phase==='ready'&&document.querySelector('#workspace-layout-state').dataset.scope==='book'&&document.querySelectorAll('[data-layout-page]').length>1");
  const paperViewportWidth=await exec("document.querySelector('#preview').getBoundingClientRect().width");
  await exec("document.querySelector('#toggle-page-list').click()");
  await exec("document.querySelector('#toggle-page-info').click()");
  await until("document.querySelector('#layout-page-list').hidden&&document.querySelector('#layout-page-info').hidden&&document.querySelector('#preview').getBoundingClientRect().width>"+paperViewportWidth+"&&document.querySelector('#workspace-layout-state').dataset.phase==='ready'");
  await exec("document.querySelector('#toggle-page-list').click()");
  await exec("document.querySelector('#toggle-page-info').click()");
  await until("!document.querySelector('#layout-page-list').hidden&&!document.querySelector('#layout-page-info').hidden");
  if(!await exec("document.querySelectorAll('[data-layout-page]').length===document.querySelector('#preview > div').shadowRoot.querySelectorAll('[data-page]').length&&document.querySelector('#layout-page-scope').textContent.includes('書籍全体')&&document.querySelector('.layout-page-info').textContent.includes('chapter')&&document.querySelector('#layout-prev').disabled"))throw Error('Page list does not represent measured pages');
  await exec("document.querySelector('#layout-next').click()");
  await until("document.querySelector('[data-layout-page=\"2\"]').getAttribute('aria-current')==='page'&&document.querySelector('#preview').scrollTop>0&&document.querySelector('#layout-page-jump').value==='2'");
  const paperWidth=await exec("(()=>{const h=document.querySelector('#preview > div');h.dataset.paperProbe='same';return h.shadowRoot.querySelector('[data-page]').style.width;})()");
  const changePaperZoom=value=>exec("(()=>{const e=document.querySelector('#layout-zoom');e.value="+JSON.stringify(value)+";e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  if(!await exec("document.querySelectorAll('#layout-pages .layout-thumbnail').length===document.querySelectorAll('[data-layout-page]').length"))throw Error('Missing measured page miniatures');
  await changePaperZoom('75');
  await until("(()=>{const v=document.querySelector('#preview'),h=v.firstElementChild,p=h.shadowRoot.querySelector('[data-page]');return Number(v.dataset.paperZoom)===.75&&Math.abs(p.getBoundingClientRect().width/p.offsetWidth-.75)<.02;})()");
  await exec("document.querySelector('#layout-guides').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"Array.from(document.querySelector('#preview > div').shadowRoot.querySelectorAll('[data-content-guide]')).every(e=>getComputedStyle(e).visibility==='hidden')"+")");
  await changePaperZoom('page');
  await until("(()=>{const v=document.querySelector('#preview'),p=v.firstElementChild.shadowRoot.querySelector('[data-page]'),r=p.getBoundingClientRect();return r.width<=v.clientWidth&&r.height<=v.clientHeight;})()");
  if(!await exec("document.querySelector('#preview > div').dataset.paperProbe==='same'&&document.querySelector('#preview > div').shadowRoot.querySelector('[data-page]').style.width==="+JSON.stringify(paperWidth)+"&&document.querySelector('#workspace-layout-state').dataset.phase==='ready'"))throw Error('Paper view altered measured result');
  await exec("document.querySelector('#layout-guides').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"Array.from(document.querySelector('#preview > div').shadowRoot.querySelectorAll('[data-content-guide]')).every(e=>getComputedStyle(e).visibility==='visible')"+")");
  await changePaperZoom('width');
  await until("Number(document.querySelector('#preview').dataset.paperZoom)>0&&Number(document.querySelector('#preview').dataset.paperZoom)<=1");
  await changePaperZoom('100');
  await until("Number(document.querySelector('#preview').dataset.paperZoom)===1");
  // Collapse auxiliary panels to reserve the paper area on short, high-zoom windows.
  await exec("document.querySelector('#toggle-page-list').click()");
  await exec("document.querySelector('#toggle-page-info').click()");
  await changePaperZoom('page');
  for(const factor of [1.25,1.5,2]){
    await atUiZoom(factor,visibleWithinWindow(['#save','#toggle-page-list','#toggle-page-info','.paper'])+"&&document.querySelector('#preview').clientHeight>0&&document.querySelector('#workspace-layout-state').dataset.phase==='ready'");
  }
  await changePaperZoom('100');
  await exec("document.querySelector('#toggle-page-list').click()");
  await exec("document.querySelector('#toggle-page-info').click()");
  await until("!document.querySelector('#layout-page-list').hidden&&!document.querySelector('#layout-page-info').hidden&&Number(document.querySelector('#preview').dataset.paperZoom)===1");
  if(!await exec("document.querySelector('#preview > div').dataset.paperProbe==='same'&&document.querySelector('#preview > div').shadowRoot.querySelector('[data-page]').style.width==="+JSON.stringify(paperWidth)))throw Error('UI zoom changed physical paper');

  await exec("document.querySelector('[data-layout-page=\"1\"]').click()");
  await until("document.querySelector('[data-layout-page=\"1\"]').getAttribute('aria-current')==='page'&&document.querySelector('#preview').scrollTop<20");
  await exec("(()=>{const e=document.querySelector('#layout-page-jump');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'2');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await exec("document.querySelector('#layout-jump').click()");
  await until("document.querySelector('[data-layout-page=\"2\"]').getAttribute('aria-current')==='page'");
  await exec("document.querySelector('#layout-prev').click()");
  await until("document.querySelector('[data-layout-page=\"1\"]').getAttribute('aria-current')==='page'");
  await exec("document.querySelector('#layout-to-publication').click()");
  await until("document.querySelector('.workspace-shell').dataset.workspaceMode==='publication'&&document.querySelector('#publication-layout').dataset.state==='ready'&&document.querySelector('#publication-save').dataset.state==='required'&&document.querySelector('#publication-diagnostics').dataset.state==='preview'&&document.querySelector('#publication-output').dataset.state==='unavailable'");
  if(!await exec("!document.querySelector('#publication-output button')&&document.querySelector('#publication-layout').textContent.includes('未保存の変更')"))throw Error('Preview mistaken for publishable snapshot');
  await exec("document.querySelector('#mode-writing').click()");
  const invalidSource='# 見出し\n\n$\n\\notacommand{x}\n$\n';
  await setNavigationSource(invalidSource);
  await exec("document.querySelector('#mode-publication').click()");
  await exec("document.querySelector('#publication-compose').click()");
  await until("document.querySelector('#workspace-layout-state').dataset.phase==='failed'");
  await exec("document.querySelector('#layout-to-publication').click()");
  await until("document.querySelector('#publication-layout').dataset.state==='error'&&document.querySelector('#publication-diagnostics').dataset.state==='error'&&!!document.querySelector('#publication-diagnostics li')&&document.querySelector('#publication-output').dataset.state==='unavailable'");
  await until("!!document.querySelector('#publication-diagnostic-list [data-diagnostic-open]')&&document.querySelector('#publication-diagnostic-list').textContent.includes('行目')");
  await exec("document.querySelector('#toggle-diagnostics').click()");
  await until("!document.querySelector('#workspace-diagnostics').hidden&&!!document.querySelector('#workspace-diagnostic-list [data-diagnostic-open]')");
  await exec("document.querySelector('#workspace-diagnostic-list [data-diagnostic-open]').click()");
  await until("document.querySelector('.workspace-shell').dataset.workspaceMode==='writing'&&document.querySelector('#workspace-diagnostics').hidden&&document.activeElement===document.querySelector('#source')&&document.querySelector('#source').value.slice(document.querySelector('#source').selectionStart,document.querySelector('#source').selectionEnd).includes('notacommand')");
  if(!await exec("document.querySelector('#source').value==="+JSON.stringify(invalidSource)))throw Error('Diagnostic jump changed manuscript');
  await setNavigationSource(sample);
  await until("document.querySelector('#toggle-diagnostics').hidden&&!document.querySelector('#workspace-diagnostic-list li')");
  await until("document.querySelector('#workspace-layout-state').dataset.phase==='stale'&&!document.querySelector('#layout-pages')&&document.querySelector('#preview > div')?.dataset.paperFreshness==='previous'&&document.querySelector('#preview > div').inert");
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector('#workspace-layout-state').dataset.phase==='ready'&&document.querySelector('#workspace-layout-state').dataset.scope==='manuscript'");
  if(await readFile(join(smokeRoot,'manuscript','chapter.md'),'utf8')!==sample)throw Error('Page navigation changed saved manuscript');
  await exec("document.querySelector('#mode-publication').click()");
  await until("document.querySelector('#publication-save').dataset.state==='ready'&&document.querySelector('#publication-layout').dataset.state==='required'&&document.querySelector('#publication-diagnostics').dataset.state==='required'&&document.querySelector('#publication-output').dataset.state==='unavailable'");
  if(!await exec("!document.querySelector('#publication-diagnostics li')&&!document.querySelector('#publication-output button')"))throw Error('Stale diagnostics or output action exposed');
  await exec("document.querySelector('#mode-writing').click()");
  await exec("(()=>{const e=document.querySelector('#source');e.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'あ'}));})()");
  await until("document.querySelector('#mode-design').disabled");
  await workspaceKey('2',true);
  await workspaceKey('s',true);
  if(!await exec("document.querySelector('.workspace-shell').dataset.workspaceMode==='writing'&&document.querySelector('#mode-design').disabled"))throw Error('IME guard bypassed by workspace shortcuts');
  await exec("(()=>{const e=document.querySelector('#source');e.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'あ'}));})()");
  await until("!document.querySelector('#mode-design').disabled");
  await exec("(()=>{const e=document.querySelector('#source');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,"+JSON.stringify(sample+'\n追記。\n')+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await until("document.querySelector('#workspace-save-state').textContent==='未保存：原稿'&&document.querySelector('#workspace-layout-state').dataset.phase==='stale'&&document.querySelector('#preview > div')?.dataset.paperFreshness==='previous'&&document.querySelector('#preview > div').inert");
  if(!await exec("(()=>{const e=document.querySelector('#source');e.setSelectionRange(0,0);document.querySelector('#preview > div').shadowRoot.querySelector('[data-block]').click();return e.selectionStart===0&&e.selectionEnd===0;})()"))throw Error('Stale paper changed source selection');
  if(await readFile(join(smokeRoot,'manuscript','chapter.md'),'utf8')!==sample)throw Error('Unsaved edit changed disk');
  await workspaceKey('s',true);
  await until("document.querySelector('#workspace-save-state').textContent==='保存済み'");
  await exec("document.querySelector('#mode-home').click()");
  await until("document.querySelector('.workspace-shell').dataset.workspaceMode==='home'&&document.querySelectorAll('.hub-project-row').length===1");
  if(!await exec("!document.querySelector('#mode-writing').getClientRects().length&&!document.querySelector('#source').getClientRects().length"))throw Error('Home exposes editing controls');
  await exec("document.querySelector('.hub-row-actions button').click()");
  await until("document.querySelector('.hub-row-actions button').getAttribute('aria-pressed')==='true'&&!document.querySelector('#open').disabled");
  const catalog=JSON.parse(await readFile(join(smokeRoot,'project-catalog.json'),'utf8'));
  if(catalog.entries.length!==1||!catalog.entries[0].favorite||catalog.entries[0].title!=='Desktop smoke')throw Error('Catalog persistence mismatch');
  await exec("document.querySelector('#project-favorites-only').click()");
  await until("document.querySelectorAll('.hub-project-row').length===1");
  await exec("document.querySelector('.hub-project-open').click()");
  await until("document.querySelector('.workspace-shell').dataset.workspaceMode==='writing'&&!document.querySelector('#open').disabled");
  await exec("document.querySelector('[data-section=chapter]').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(sample+'\n追記。\n'));
  await writingJourneySmoke();
  await recoveryJourneySmoke();
  await settingsRecoveryJourneySmoke();
  await componentRecoveryJourneySmoke();
  await nativeCloseSmoke('discard');
  const report='PASS portable Windows package: isolated renderer, workspace, math, bundled fonts, numbering, save, new-book writing journey and renderer reload';
  if(process.env.BC_PACKAGE_SMOKE_REPORT)await writeFile(process.env.BC_PACKAGE_SMOKE_REPORT,report+'\n',{flag:'wx'});
  console.log(report);
  // Chromium still holds profile databases until the process exits on Windows.
  // The package test runner owns and removes the isolated parent after exit.
  app.exit(0);
}
// UX-10a: a continuous journey using only visible, enabled UI controls.
// Unlike the legacy smoke helper, do not automatically navigate or open panels.
async function writingJourneySmoke(){
  const raw=js=>win.webContents.executeJavaScript(js);
  const until=async(label,js)=>{for(let i=0;i<150;i++){if(await raw(js))return;await new Promise(r=>setTimeout(r,100));}throw Error('Writing journey: '+label+'; '+await raw("document.querySelector('#status')?.textContent"));};
  const click=async selector=>{
    await until('reachable '+selector,"(()=>{const e=document.querySelector("+JSON.stringify(selector)+");return !!e?.getClientRects().length&&!e.disabled;})()");
    await raw("document.querySelector("+JSON.stringify(selector)+").click()");
  };
  const input=async(selector,value)=>{
    await until('editable '+selector,"(()=>{const e=document.querySelector("+JSON.stringify(selector)+");return !!e?.getClientRects().length&&!e.disabled&&!e.readOnly;})()");
    await raw("(()=>{const e=document.querySelector("+JSON.stringify(selector)+");const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  };
  const mode=which=>"document.querySelector('.workspace-shell').dataset.workspaceMode==="+JSON.stringify(which);
  const title='執筆フロー検証書籍',folder='writing-journey';
  const paragraph='二次方程式の解き方を学びます。';
  const problem='次の方程式を解いてみましょう。';
  const manuscript=join(smokeRoot,folder,'manuscript','chapter-01.md');
  await click('#mode-home');
  await until('home',mode('home'));
  await click('#new-project');
  await input('#new-title',title);
  await input('#new-folder',folder);
  await until('default A5',"document.querySelector('#new-size').value==='A5'");
  await click('#create-project');
  await until('created book',mode('writing')+"&&!!document.querySelector('[data-section=chapter-01]')&&!document.querySelector('[data-section=chapter-01]').disabled");
  if(!(await readFile(join(smokeRoot,folder,'book.yaml'),'utf8')).includes(title))throw Error('Writing journey: new manifest not saved');
  await click('[data-section=chapter-01]');
  await until('starter manuscript',"document.querySelector('#source').value.includes('ここから原稿を書き始めます。')&&!document.querySelector('#editor-view-structured').disabled");
  const initial=await readFile(manuscript,'utf8');
  await click('#editor-view-structured');
  await click('[data-structured-kind=paragraph] [data-rich-edit]');
  await input('#structured-rich-value',paragraph);
  await click('#structured-apply');
  await until('paragraph committed',"document.querySelector('#source').value.includes("+JSON.stringify(paragraph)+")&&!document.querySelector('#structured-apply')");
  const insert=async(category,selector)=>{
    await click('#structured-insert-toggle');
    await click('[data-insert-category='+category+']');
    await click('#structured-append');
    await until('insert '+category,"!!document.querySelector("+JSON.stringify(selector)+")&&document.querySelector('#structured-insert-panel').hidden");
  };
  await insert('math','[data-structured-kind=math]');
  await click('[data-structured-kind=math] [data-structured-edit]');
  await input('#structured-value','x^2-5x+6=0');
  await click('#structured-apply');
  await until('math committed',"document.querySelector('#source').value.includes('x^2-5x+6=0')&&!document.querySelector('#structured-apply')");
  await insert('study','[data-study-kind=example]');
  await click('[data-study-kind=example] [data-study-edit]');
  await input('[data-study-value=content]',problem);
  await click('#structured-study-apply');
  await until('study committed',"document.querySelector('#source').value.includes("+JSON.stringify(problem)+")&&!document.querySelector('#structured-study-apply')");
  let expected=await raw("document.querySelector('#source').value");
  if(!expected.includes(paragraph)||!expected.includes('x^2-5x+6=0')||!expected.includes(problem)||await readFile(manuscript,'utf8')!==initial)throw Error('Writing journey: draft was lost or saved implicitly');
  await click('#mode-layout');
  await until('layout mode',mode('layout'));
  await click('#preview-book');
  await until('whole book preview',"document.querySelector('#workspace-layout-state').dataset.phase==='ready'&&document.querySelector('#workspace-layout-state').dataset.scope==='book'&&!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-display-math] math')");
  await click('#mode-writing');
  await until('return to manuscript',mode('writing')+"&&document.querySelector('#source').value==="+JSON.stringify(expected));
  await click('#save');
  await until('saved',"document.querySelector('#workspace-save-state').textContent==='保存済み'");
  if(await readFile(manuscript,'utf8')!==expected)throw Error('Writing journey: saved manuscript differs');
  // UX-10b: create a genuinely customized study design in this same book.
  const themePath=join(smokeRoot,folder,'themes','default','theme.yaml');
  const themeBefore=await readFile(themePath,'utf8');
  const customName='二次方程式のポイント',customContent='積が6、和が5になる二つの数を探します。';
  await click('#mode-design');
  await click('#design-tab-components');
  await click('#catalog-custom-new');
  await until('custom editor',"!!document.querySelector('#lab-library-name')&&!document.querySelector('#lab-library-bind')");
  await until('initial custom live preview',"document.querySelector('#lab-preview').dataset.previewPhase==='ready'&&!!document.querySelector('#lab-preview > div')?.shadowRoot?.querySelector('[data-content-slot]')&&document.querySelector('#lab-preview').dataset.previewConfirmed==='true'");
  await input('#lab-library-name',customName);
  await click('[data-property-choice=layout]');
  const padding=await raw("Number(document.querySelector('#lab-padding').value)===5?6:5");
  await input('#lab-padding',String(padding));
  await until('changed padding',"Number(document.querySelector('#lab-padding').value)==="+padding);
  await until('edited live preview',"document.querySelector('#lab-preview').dataset.previewPhase==='ready'&&document.querySelector('#lab-preview').dataset.previewConfirmed==='true'&&!document.querySelector('#lab-library-add').disabled&&[...document.querySelector('#lab-preview > div')?.shadowRoot?.querySelectorAll('[data-fixed-label]')??[]].some(e=>e.textContent==="+JSON.stringify(customName+'：サンプル')+")");
  console.log('PASS UX-10h-1 initial and edited custom component preview without pressing measure');
  // UX-10c: one required named slot and one independently optional slot.
  await click('#lab-add-menu');
  await click('#lab-add-slot');
  await click('[data-property-choice=details]');
  await input('#lab-slot-name','strategy');
  await click('#lab-add-menu');
  await click('#lab-add-slot');
  await click('[data-property-choice=details]');
  await input('#lab-slot-name','extension');
  await click('#lab-slot-optional');
  await click('#lab-group');
  await click('[data-property-choice=details]');
  await click('#lab-group-optional');
  await click('#lab-sample-toggle');
  await input('[data-lab-slot-sample=strategy]','必須欄の見本。');
  await input('[data-lab-slot-sample=extension]','任意欄の見本。');
  await until('both sample slots',"(()=>{const r=document.querySelector('#lab-preview > div')?.shadowRoot;return r?.querySelector('[data-named-slot=strategy]')?.textContent==='必須欄の見本。'&&r?.querySelector('[data-named-slot=extension]')?.textContent==='任意欄の見本。'&&!document.querySelector('#lab-library-add').disabled;})()");
  const fullHeight=await raw("parseFloat(document.querySelector('#lab-preview > div').shadowRoot.querySelector('[data-block]').style.height)");
  await click('[data-lab-slot-omit=extension]');
  await until('optional group consumes no height',"(()=>{const r=document.querySelector('#lab-preview > div')?.shadowRoot;return !!r?.querySelector('[data-named-slot=strategy]')&&!r.querySelector('[data-named-slot=extension]')&&!r.querySelector('[data-component-group]')&&parseFloat(r.querySelector('[data-block]').style.height)<"+fullHeight+";})()");
  await until('custom measured',"!document.querySelector('#lab-library-add').disabled&&[...document.querySelector('#lab-preview > div')?.shadowRoot?.querySelectorAll('[data-fixed-label]')??[]].some(e=>e.textContent==="+JSON.stringify(customName+'：サンプル')+")");
  if(await readFile(themePath,'utf8')!==themeBefore||await readFile(manuscript,'utf8')!==expected)throw Error('Writing journey: unregistered component changed disk');
  await until('custom draft recorded',"document.querySelector('#component-recovery-state')?.dataset.phase==='recorded'");
  await click('#lab-library-add');
  await until('custom registered',"[...document.querySelector('#lab-library-select')?.options??[]].some(e=>e.textContent==="+JSON.stringify(customName)+")&&!document.querySelector('#lab-cancel').disabled");
  const customId=await raw("[...document.querySelector('#lab-library-select').options].find(e=>e.textContent==="+JSON.stringify(customName)+").value");
  if(!/^component-[a-f0-9-]+$/.test(customId))throw Error('Writing journey: invalid registered component ID');
  const themeRegistered=await readFile(themePath,'utf8');
  if((await recoveryStore(smokeRoot,'components').list()).records.length)throw Error('Writing journey: successful registration did not clear recovery draft');
  if(themeRegistered===themeBefore||!themeRegistered.includes(customId)||await readFile(manuscript,'utf8')!==expected)throw Error('Writing journey: component registration did not preserve manuscript');
  await click('#lab-cancel');
  await until('catalog after registration',"!document.querySelector('#lab-measure')&&!!document.querySelector("+JSON.stringify('[data-catalog-edit=registered-'+customId+']')+")");
  await click('#mode-writing');
  await until('same manuscript after design',mode('writing')+"&&document.querySelector('#source').value==="+JSON.stringify(expected));
  await click('#structured-insert-toggle');
  await click('[data-insert-category=study]');
  await until('registered choice visible',"!!document.querySelector('#structured-insert-kind')?.getClientRects().length&&[...document.querySelector('#structured-insert-kind').options].some(e=>e.value==="+JSON.stringify(customId)+")");
  await raw("(()=>{const e=document.querySelector('#structured-insert-kind');e.value="+JSON.stringify(customId)+";e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until('registered choice selected',"document.querySelector('#structured-insert-kind').value==="+JSON.stringify(customId));
  await until('required field only',"document.querySelector('#structured-insertion-fields').textContent.includes('strategy')&&!document.querySelector('#structured-insertion-fields').textContent.includes('extension')&&!document.querySelector('#structured-optional-slots').checked");
  await click('#structured-append');
  await until('custom inserted',"!!document.querySelector('[data-study-kind=custom]')&&document.querySelector('#source').value.includes("+JSON.stringify('name="'+customId+'"')+")");
  await click('[data-study-kind=custom] [data-study-edit]');
  await input('[data-study-value=content]',customContent);
  await input('[data-study-value=strategy]','まず因数分解を試します。');
  await until('optional field absent',"!document.querySelector('[data-study-value=extension]')");
  await click('#structured-study-apply');
  await until('custom content applied',"document.querySelector('#source').value.includes("+JSON.stringify(customContent)+")&&!document.querySelector('#structured-study-apply')");
  const firstInstance=await raw("document.querySelector('#source').value");
  await click('#structured-insert-toggle');
  await until('same custom kind',"document.querySelector('#structured-insert-kind').value==="+JSON.stringify(customId)+"&&!!document.querySelector('#structured-optional-slots')");
  await click('#structured-optional-slots');
  await until('optional field offered',"document.querySelector('#structured-insertion-fields').textContent.includes('extension')");
  await click('#structured-append');
  await until('two independent instances',"document.querySelectorAll('[data-study-kind=custom]').length===2&&!!document.querySelector('[data-study-kind=custom] [data-study-field=extension]')");
  const secondEdit='[data-study-kind=custom]:has([data-study-field=extension]) [data-study-edit]';
  await click(secondEdit);
  await input('[data-study-value=content]','別解を考えてみましょう。');
  await input('[data-study-value=strategy]','解の公式で確かめます。');
  await input('[data-study-value=extension]','判別式も計算しましょう。');
  await click('#structured-study-cancel');
  await until('cancel preserves both instances',"!document.querySelector('#structured-study-apply')&&!document.querySelector('#source').value.includes('判別式も計算しましょう。')&&document.querySelector('#source').value.startsWith("+JSON.stringify(firstInstance.trimEnd())+")");
  await click(secondEdit);
  await input('[data-study-value=content]','別解を考えてみましょう。');
  await input('[data-study-value=strategy]','解の公式で確かめます。');
  await input('[data-study-value=extension]','判別式も計算しましょう。');
  await click('#structured-study-apply');
  await until('second instance applied',"!document.querySelector('#structured-study-apply')&&document.querySelector('#source').value.includes('判別式も計算しましょう。')&&document.querySelector('#source').value.startsWith("+JSON.stringify(firstInstance.trimEnd())+")");
  if(await readFile(manuscript,'utf8')!==expected||await readFile(themePath,'utf8')!==themeRegistered)throw Error('Writing journey: custom instance edit saved implicitly or changed definition');
  expected=await raw("document.querySelector('#source').value");
  await click('#mode-layout');
  await click('#preview-book');
  const customOnPaper="[...document.querySelector('#preview > div')?.shadowRoot?.querySelectorAll('[data-fixed-label]')??[]].some(e=>e.textContent==="+JSON.stringify(customName)+")";
  const slotsOnPaper="(()=>{const r=document.querySelector('#preview > div')?.shadowRoot;if(!r)return false;const required=[...r.querySelectorAll('[data-named-slot=strategy]')],optional=[...r.querySelectorAll('[data-named-slot=extension]')];return required.length===2&&required.some(e=>e.textContent.includes('まず因数分解を試します。'))&&required.some(e=>e.textContent.includes('解の公式で確かめます。'))&&optional.length===1&&optional[0].textContent.includes('判別式も計算しましょう。');})()";
  await until('custom measured in book',"document.querySelector('#workspace-layout-state').dataset.phase==='ready'&&document.querySelector('#workspace-layout-state').dataset.scope==='book'&&"+customOnPaper+"&&"+slotsOnPaper);
  await click('#mode-writing');
  await click('#save');
  await until('custom instance saved',"document.querySelector('#workspace-save-state').textContent==='保存済み'");
  if(await readFile(manuscript,'utf8')!==expected)throw Error('Writing journey: custom instance save mismatch');
  // Start a fresh renderer in the same isolated Electron process/profile.
  // This verifies catalog reload from disk; not a full OS/process restart.
  await win.loadURL(PAGE);
  await selectManualPreviewForRegression();
  await until('fresh renderer home',mode('home')+"&&!![...document.querySelectorAll('.hub-project-open')].find(e=>e.querySelector('strong')?.textContent==="+JSON.stringify(title)+")");
  await raw("(()=>{const e=[...document.querySelectorAll('.hub-project-open')].find(e=>e.querySelector('strong')?.textContent==="+JSON.stringify(title)+");if(!e?.getClientRects().length||e.disabled)throw Error('New project not accessible');e.click();})()");
  await until('reopened book',mode('writing')+"&&!!document.querySelector('[data-section=chapter-01]')&&!document.querySelector('[data-section=chapter-01]').disabled");
  await click('[data-section=chapter-01]');
  await until('reloaded exact source',"document.querySelector('#source').value==="+JSON.stringify(expected)+"&&document.querySelector('#workspace-save-state').textContent==='保存済み'&&document.querySelector('#workspace-layout-state').dataset.phase==='idle'");
  await click('#editor-view-structured');
  await until('reloaded GUI',"!!document.querySelector('[data-structured-kind=math] math')&&!!document.querySelector('[data-study-kind=example]')&&!!document.querySelector('[data-study-kind=custom]')&&document.querySelector('#structured-editor').textContent.includes("+JSON.stringify(paragraph)+")");
  await click('#mode-layout');
  await click('#preview-book');
  await until('recomposed book',"document.querySelector('#workspace-layout-state').dataset.phase==='ready'&&document.querySelector('#workspace-layout-state').dataset.scope==='book'&&!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-display-math] math')");
  await until('custom on reloaded paper',customOnPaper+"&&"+slotsOnPaper);
  await click('#mode-design');
  await click('#design-tab-components');
  await click('[data-catalog-edit=registered-'+customId+']');
  await click('[data-property-choice=layout]');
  await until('reloaded component geometry',"Number(document.querySelector('#lab-padding').value)==="+padding+"&&document.querySelector('#lab-library-name').value==="+JSON.stringify(customName));
  await until('reloaded slot definitions',"[...document.querySelectorAll('[data-lab-node]')].some(e=>e.textContent.includes('原稿スロット strategy'))&&[...document.querySelectorAll('[data-lab-node]')].some(e=>e.textContent.includes('原稿スロット extension'))");
  await click('#lab-cancel');
  await until('closed component editor',"!document.querySelector('#lab-measure')");
  if(await readFile(manuscript,'utf8')!==expected||await readFile(themePath,'utf8')!==themeRegistered)throw Error('Writing journey: reload or compose changed saved files');
  console.log('PASS UX-10b custom component design, registration, insertion, measured paper and persisted geometry');
  console.log('PASS UX-10c required and optional slots, independent instances, cancel, measured omission and saved round-trip');
  // Independent restart oracle, written only after the complete first-phase journey.
  const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
  await writeFile(join(smokeRoot,'ux10-restart.json'),JSON.stringify({version:1,pid:process.pid,title,customName,customId,padding,sourceHash:digest(expected),themeHash:digest(themeRegistered),manifestHash:digest(await readFile(join(smokeRoot,folder,'book.yaml')))}),{flag:'wx'});
  console.log('PASS UX-10a new A5 book, structured writing, math, study component, whole-book composition, explicit save and fresh renderer reopen');
}
// The CI runner starts a second executable only after the first has exited.
async function packageRestartSmoke(){
  const oracle=JSON.parse(await readFile(join(smokeRoot,'ux10-restart.json'),'utf8'));
  if(oracle.version!==1||!Number.isSafeInteger(oracle.pid)||oracle.pid===process.pid||oracle.title!=='執筆フロー検証書籍'||oracle.customName!=='二次方程式のポイント'||!/^component-[a-f0-9-]+$/.test(oracle.customId)||![5,6].includes(oracle.padding)||![oracle.sourceHash,oracle.themeHash,oracle.manifestHash].every(x=>/^[a-f0-9]{64}$/.test(x)))throw Error('Invalid first-process restart oracle');
  const root=join(smokeRoot,'writing-journey'),sourcePath=join(root,'manuscript','chapter-01.md'),themePath=join(root,'themes','default','theme.yaml'),manifestPath=join(root,'book.yaml');
  const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
  async function checkDisk(){
    for(const [path,hash] of [[sourcePath,oracle.sourceHash],[themePath,oracle.themeHash],[manifestPath,oracle.manifestHash]])if(digest(await readFile(path))!==hash)throw Error('Restart smoke: saved file changed '+basename(path));
  }
  await checkDisk();
  const expected=await readFile(sourcePath,'utf8');
  const raw=js=>win.webContents.executeJavaScript(js);
  const until=async(label,js)=>{for(let i=0;i<150;i++){if(await raw(js))return;await new Promise(r=>setTimeout(r,100));}throw Error('Restart smoke: '+label+'; '+await raw("document.querySelector('#status')?.textContent"));};
  const click=async selector=>{
    await until('reachable '+selector,"(()=>{const e=document.querySelector("+JSON.stringify(selector)+");return !!e?.getClientRects().length&&!e.disabled;})()");
    await raw("document.querySelector("+JSON.stringify(selector)+").click()");
  };
  const mode=which=>"document.querySelector('.workspace-shell').dataset.workspaceMode==="+JSON.stringify(which);
  const catalog=JSON.parse(await readFile(join(smokeRoot,'project-catalog.json'),'utf8'));
  const entry=catalog.entries.find(e=>e.title===oracle.title);
  if(!entry||!catalog.entries.some(e=>e.title==='Desktop smoke'&&e.favorite))throw Error('Restart smoke: saved catalog or favorite missing');
  await until('fresh home',mode('home')+"&&document.querySelectorAll('.hub-project-row').length===2");
  const row=await raw("[...document.querySelectorAll('.hub-project-row')].find(e=>e.querySelector('strong')?.textContent==='Desktop smoke')?.querySelector('.hub-row-actions button')?.getAttribute('aria-pressed')");
  if(row!=='true')throw Error('Restart smoke: favorite UI not restored');
  await raw("(()=>{const e=[...document.querySelectorAll('.hub-project-open')].find(e=>e.querySelector('strong')?.textContent==="+JSON.stringify(oracle.title)+");if(!e?.getClientRects().length||e.disabled)throw Error('Saved project not accessible');e.click();})()");
  await until('reopened book',mode('writing')+"&&!!document.querySelector('[data-section=chapter-01]')&&!document.querySelector('[data-section=chapter-01]').disabled");
  await click('[data-section=chapter-01]');
  await until('exact saved source',"document.querySelector('#source').value==="+JSON.stringify(expected)+"&&document.querySelector('#workspace-save-state').textContent==='保存済み'&&document.querySelector('#workspace-layout-state').dataset.phase==='idle'");
  await click('#editor-view-structured');
  await until('restored structured instances',"document.querySelectorAll('[data-study-kind=custom]').length===2&&document.querySelectorAll('[data-study-kind=custom] [data-study-field=strategy]').length===2&&document.querySelectorAll('[data-study-kind=custom] [data-study-field=extension]').length===1&&!!document.querySelector('[data-structured-kind=math] math')");
  await click('#mode-design');
  await click('#design-tab-components');
  await click('[data-catalog-edit=registered-'+oracle.customId+']');
  await click('[data-property-choice=layout]');
  await until('restored component definition',"Number(document.querySelector('#lab-padding').value)==="+oracle.padding+"&&document.querySelector('#lab-library-name').value==="+JSON.stringify(oracle.customName));
  await click('#lab-cancel');
  await until('closed editor',"!document.querySelector('#lab-measure')");
  await click('#mode-layout');
  await click('#preview-book');
  await until('recomposed paper',"document.querySelector('#workspace-layout-state').dataset.phase==='ready'&&document.querySelector('#workspace-layout-state').dataset.scope==='book'&&(()=>{const r=document.querySelector('#preview > div')?.shadowRoot;return !!r?.querySelector('[data-display-math] math')&&r.querySelectorAll('[data-named-slot=strategy]').length===2&&r.querySelectorAll('[data-named-slot=extension]').length===1&&[...r.querySelectorAll('[data-fixed-label]')].some(e=>e.textContent==="+JSON.stringify(oracle.customName)+");})()");
  await checkDisk();
  await nativeCloseSmoke('save');
  await checkDisk();
  const report='PASS UX-10d portable Windows process restart: catalog, favorite, exact saved files, custom slots and recomposition';
  if(!process.env.BC_PACKAGE_SMOKE_REPORT)throw Error('Restart report path required');
  await writeFile(process.env.BC_PACKAGE_SMOKE_REPORT,report+'\n',{flag:'wx'});
  console.log(report);
  app.exit(0);
}
// Exercise the real packaged recovery IPC and editor, using only the isolated
// fixture. Renderer reload is not yet a forced process crash.
// Run in a dedicated CI-owned profile only. The runner kills the first
// process tree after the checkpoint marker, without invoking close/save.
// Independent process pairs for settings and components. A component lab
// cannot be opened while typography is dirty; do not bypass that guard.
async function productionDataCrashSmoke(mode){
  const [kind,stage]=mode.split('-'),prepare=stage==='prepare';
  const root=join(smokeRoot,'writing-journey'),manifest=join(root,'book.yaml'),theme=join(root,'themes','default','theme.yaml'),source=join(root,'manuscript','chapter-01.md');
  const oraclePath=join(smokeRoot,'ux10-crash-'+kind+'.json'),store=recoveryStore(smokeRoot,kind);
  const raw=js=>win.webContents.executeJavaScript(js);
  const until=async(label,js)=>{for(let i=0;i<150;i++){if(await raw(js))return;await new Promise(r=>setTimeout(r,100));}throw Error('Production crash '+mode+': '+label+'; '+await raw("document.querySelector('#status')?.textContent"));};
  const click=async selector=>{
    await until('reachable '+selector,"(()=>{const e=document.querySelector("+JSON.stringify(selector)+");return !!e?.getClientRects().length&&!e.disabled;})()");
    await raw("document.querySelector("+JSON.stringify(selector)+").click()");
  };
  const change=(selector,value)=>raw("(()=>{const e=document.querySelector("+JSON.stringify(selector)+");if(!e?.getClientRects().length||e.disabled)throw Error('Select unavailable');e.value="+JSON.stringify(value)+";e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  const input=(selector,value)=>raw("(()=>{const e=document.querySelector("+JSON.stringify(selector)+");if(!e?.getClientRects().length||e.disabled)throw Error('Input unavailable');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+JSON.stringify(String(value))+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  const hashes=async()=>Object.fromEntries(await Promise.all(Object.entries({manifest,theme,source}).map(async([k,p])=>[k,createHash('sha256').update(await readFile(p)).digest('hex')])));
  const records=async()=>{const list=await store.list();if(list.unreadable)throw Error('Unreadable recovery fixture');return list.records.sort((a,b)=>a.key.localeCompare(b.key));};
  const saved=await hashes();
  const restart=JSON.parse(await readFile(join(smokeRoot,'ux10-restart.json'),'utf8'));
  async function homeReady(){await until('home catalog',"[...document.querySelectorAll('.hub-project-open')].some(e=>e.querySelector('strong')?.textContent==='執筆フロー検証書籍'&&!e.disabled)");}
  async function openBook(){await homeReady();await raw("(()=>{const e=[...document.querySelectorAll('.hub-project-open')].find(e=>e.querySelector('strong')?.textContent==='執筆フロー検証書籍');e.click();})()");await click('[data-section=chapter-01]');}
  async function hub(expected){
    await homeReady();await click('#hub-recovery');
    await until('unified recovery list',"document.querySelector('#hub-recovery-summary')?.textContent==="+JSON.stringify(expected+' 件の復旧候補')+"&&document.querySelectorAll('.hub-recovery-row').length==="+expected+"&&!document.querySelector('#hub-recovery-warning')");
  }
  function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
  if(!process.env.BC_PACKAGE_SMOKE_REPORT)throw Error('Isolated crash report required');
  if(prepare){
    if((await records()).length)throw Error('Unexpected prior '+kind+' recovery records');
    await openBook();
    let values;
    if(kind==='settings'){
      await click('#mode-design');await click('#design-tab-styles');
      const font=await raw("document.querySelector('#body-font').value==='serif'?'sans-serif':'serif'");
      await change('#body-font',font);await click('#book-settings');
      const size=await raw("document.querySelector('#page-size').value==='A4'?'A5':'A4'");
      await change('#page-size',size);
      await until('two settings checkpoints',"['typography','book-settings'].every(k=>document.querySelector('#settings-recovery-state-'+k)?.dataset.phase==='recorded')&&document.querySelector('#workspace-save-state').textContent==='未保存：テーマ・書籍設定'");
      values={font,size};
    }else{
      await click('#mode-design');await click('#design-tab-components');
      await click('[data-catalog-edit=registered-'+restart.customId+']');
      await click('[data-property-choice=layout]');
      await until('component ready',"!document.querySelector('#lab-padding').disabled");
      const padding=await raw("Number(document.querySelector('#lab-padding').value)===7?8:7");
      await input('#lab-padding',padding);
      await until('component checkpoint',"document.querySelector('#component-recovery-state')?.dataset.phase==='recorded'");
      values={padding,id:restart.customId};
    }
    const snapshot=await records();
    if(snapshot.length!==(kind==='settings'?2:1)||!same(await hashes(),saved))throw Error('Checkpoint missing or original files changed');
    await writeFile(oraclePath,JSON.stringify({version:1,pid:process.pid,kind,saved,values,snapshot}),{flag:'wx'});
    await writeFile(process.env.BC_PACKAGE_SMOKE_REPORT,'READY UX-10g-6 '+kind+' '+process.pid+'\n',{flag:'wx'});
    return; // Runner will force-kill this still-open process.
  }
  const oracle=JSON.parse(await readFile(oraclePath,'utf8'));
  if(oracle.version!==1||oracle.kind!==kind||oracle.pid===process.pid||!same(saved,oracle.saved)||!same(await records(),oracle.snapshot))throw Error('Production crash oracle mismatch');
  if(kind==='settings'){
    await hub(2);
    await click('[data-recovery-setting=typography] .hub-recovery-open');
    await until('font review',"document.querySelector('#settings-recovery-dialog').open&&!!document.querySelector('#settings-recovery-restore')");
    await click('#settings-recovery-later');
    await until('deferred font remains locked',"!document.querySelector('#settings-recovery-dialog').open&&document.querySelector('#body-font').disabled");
    await click('#settings-recovery-review-typography');await click('#settings-recovery-restore');
    await until('font restored',"!document.querySelector('#settings-recovery-dialog').open&&document.querySelector('#body-font').value==="+JSON.stringify(oracle.values.font)+"&&document.querySelector('#workspace-save-state').textContent.includes('テーマ')");
    await click('#settings-recovery-review-book-settings');await click('#settings-recovery-restore');
    await until('paper restored',"!document.querySelector('#settings-recovery-dialog').open&&document.querySelector('#page-size').value==="+JSON.stringify(oracle.values.size)+"&&document.querySelector('#workspace-save-state').textContent==='未保存：テーマ・書籍設定'");
    if(!same(await hashes(),saved))throw Error('Restored settings silently changed original');
    // Keep theme and manifest writes separate and verify cleanup of both.
    await click('#mode-design');await click('#design-tab-styles');await click('#save-theme');
    await until('font saved',"document.querySelector('#workspace-save-state').textContent==='未保存：書籍設定'");
    await click('#book-settings');await click('#save-book-settings');
    await until('both saved',"document.querySelector('#workspace-save-state').textContent==='保存済み'");
    const after=await hashes();
    if(after.theme===saved.theme||after.manifest===saved.manifest||after.source!==saved.source||(await records()).length)throw Error('Explicit settings save or cleanup failed');
    // Read through a fresh renderer and actual workspace activation, not
    // merely an in-memory state update or a changed YAML hash.
    await win.loadURL(PAGE);await selectManualPreviewForRegression();await openBook();
    await click('#mode-design');await click('#design-tab-styles');
    await until('saved font reloaded',"document.querySelector('#body-font').value==="+JSON.stringify(oracle.values.font)+"&&!document.querySelector('#settings-recovery-review-typography')");
    await click('#book-settings');
    await until('saved paper reloaded',"document.querySelector('#page-size').value==="+JSON.stringify(oracle.values.size)+"&&!document.querySelector('#settings-recovery-review-book-settings')&&document.querySelector('#workspace-save-state').textContent==='保存済み'");
  }else{
    await hub(1);
    await click('[data-recovery-entry='+oracle.values.id+'] .hub-recovery-open');
    await click('[data-property-choice=layout]');
    await until('registered candidate locked',"!!document.querySelector('#component-recovery-restore')&&document.querySelector('#lab-padding').disabled");
    await click('#component-recovery-restore');
    await until('restored and unmeasured',"Number(document.querySelector('#lab-padding').value)==="+oracle.values.padding+"&&document.querySelector('#lab-library-replace').disabled&&!document.querySelector('#lab-measure').disabled");
    await click('#lab-measure');await until('measured',"!document.querySelector('#lab-library-replace').disabled");
    if(!same(await hashes(),saved))throw Error('Component recovery silently updated theme');
    await click('#lab-cancel');await until('closed',"!document.querySelector('#lab-measure')");
    if((await records()).length||!same(await hashes(),saved))throw Error('Component cancel lost original or retained working draft');
  }
  await click('#mode-home');await hub(0);
  const report='PASS UX-10g-6 forced process recovery '+kind;
  await writeFile(process.env.BC_PACKAGE_SMOKE_REPORT,report+'\n',{flag:'wx'});
  console.log(report);
  closing=true;win.destroy();app.exit(0);
}
async function crashRecoverySmoke(prepare){
  const root=join(smokeRoot,'writing-journey'),path=join(root,'manuscript','chapter-01.md');
  const key=recoveryKey(await realpathSync(join(root,'book.yaml')),'chapter-01','manuscript/chapter-01.md');
  const store=recoveryStore(smokeRoot),oraclePath=join(smokeRoot,'ux10-crash.json');
  const digest=value=>createHash('sha256').update(value).digest('hex');
  const raw=js=>win.webContents.executeJavaScript(js);
  const until=async(label,js)=>{for(let i=0;i<150;i++){if(await raw(js))return;await new Promise(r=>setTimeout(r,100));}throw Error('Crash recovery: '+label+'; '+await raw("document.querySelector('#status')?.textContent"));};
  const click=async selector=>{
    await until('reachable '+selector,"(()=>{const e=document.querySelector("+JSON.stringify(selector)+");return !!e?.getClientRects().length&&!e.disabled;})()");
    await raw("document.querySelector("+JSON.stringify(selector)+").click()");
  };
  async function openBook(){
    await until('home catalog',"[...document.querySelectorAll('.hub-project-open')].some(e=>e.querySelector('strong')?.textContent==='執筆フロー検証書籍')");
    await raw("(()=>{const e=[...document.querySelectorAll('.hub-project-open')].find(e=>e.querySelector('strong')?.textContent==='執筆フロー検証書籍');if(!e?.getClientRects().length||e.disabled)throw Error('Fixture unavailable');e.click();})()");
    await click('[data-section=chapter-01]');
  }
  const saved=await readFile(path,'utf8'),draft=saved+'\n強制終了後に復旧する未保存原稿。\n';
  if(prepare){
    if(await store.get(key))throw Error('Unexpected preexisting crash recovery record');
    await openBook();
    await until('original source',"document.querySelector('#source').value==="+JSON.stringify(saved)+"&&document.querySelector('#workspace-save-state').textContent==='保存済み'");
    await raw("(()=>{const e=document.querySelector('#source');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,"+JSON.stringify(draft)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await until('real checkpoint',"document.querySelector('#recovery-state')?.dataset.phase==='recorded'&&document.querySelector('#workspace-save-state').textContent==='未保存：原稿'");
    const record=await store.get(key);
    if(record?.text!==draft||await readFile(path,'utf8')!==saved)throw Error('Crash preparation changed original or lost recovery');
    await writeFile(oraclePath,JSON.stringify({version:1,pid:process.pid,sourceHash:digest(saved),draftHash:digest(draft),recordVersion:record.version}),{flag:'wx'});
    if(!process.env.BC_PACKAGE_SMOKE_REPORT)throw Error('Crash marker required');
    await writeFile(process.env.BC_PACKAGE_SMOKE_REPORT,'READY UX-10f-3 '+process.pid+'\n',{flag:'wx'});
    // Keep the process and unsaved renderer alive. Do not call close or exit.
    return;
  }
  const oracle=JSON.parse(await readFile(oraclePath,'utf8')),record=await store.get(key);
  if(oracle.version!==1||oracle.pid===process.pid||oracle.sourceHash!==digest(saved)||oracle.draftHash!==digest(draft)||record?.version!==oracle.recordVersion||record?.text!==draft)throw Error('Crash recovery oracle mismatch');
  await click('#hub-recovery');
  await until('home recovery candidate',"document.querySelector('#hub-recovery-summary')?.textContent==='1 件の復旧候補'&&document.querySelectorAll('.hub-recovery-row').length===1&&document.querySelector('.hub-recovery-row').textContent.includes('執筆フロー検証書籍')&&document.querySelector('.hub-recovery-row').dataset.recoverySection==='chapter-01'&&!document.querySelector('.hub-recovery-row').textContent.includes('強制終了後に復旧する未保存原稿。')");
  await click('.hub-recovery-open');
  await until('recovery after forced exit',"document.querySelector('#recovery-dialog').open&&document.querySelector('#recovery-saved-text').value==="+JSON.stringify(saved)+"&&document.querySelector('#recovery-draft-text').value==="+JSON.stringify(draft)+"&&!!document.querySelector('#recovery-restore')");
  await click('#recovery-later');
  await until('deferred', "!document.querySelector('#recovery-dialog').open&&document.querySelector('#source').readOnly");
  // Change the fixture externally, then reopen. The old candidate must be
  // preserved and must not be offered as an automatic restore.
  const external=saved+'\n外部変更の検証。\n';
  await writeFile(path,external);
  await win.loadURL(PAGE);await selectManualPreviewForRegression();await openBook();
  await until('diverged review',"document.querySelector('#recovery-dialog').open&&document.querySelector('#recovery-saved-text').value==="+JSON.stringify(external)+"&&document.querySelector('#recovery-draft-text').value==="+JSON.stringify(draft)+"&&!document.querySelector('#recovery-restore')");
  await click('#recovery-later');
  await until('diverged deferred',"!document.querySelector('#recovery-dialog').open&&document.querySelector('#source').readOnly");
  if((await store.get(key))?.version!==oracle.recordVersion||await readFile(path,'utf8')!==external)throw Error('Diverged recovery changed original or candidate');
  // Restore only the test fixture to its exact prior bytes, then exercise
  // explicit restoration and normal revision-checked save.
  await writeFile(path,saved);
  await win.loadURL(PAGE);await selectManualPreviewForRegression();await openBook();
  await click('#recovery-restore');
  await until('restored but unsaved',"!document.querySelector('#recovery-dialog').open&&document.querySelector('#source').value==="+JSON.stringify(draft)+"&&document.querySelector('#workspace-save-state').textContent==='未保存：原稿'");
  if(await readFile(path,'utf8')!==saved)throw Error('Recovery overwrote original before save');
  await click('#save');
  await until('explicit save',"document.querySelector('#workspace-save-state').textContent==='保存済み'&&!document.querySelector('#recovery-state')");
  if(await readFile(path,'utf8')!==draft||await store.get(key))throw Error('Recovered save or cleanup failed');
  await click('#mode-home');await click('#hub-recovery');
  await until('home recovery list cleared',"document.querySelector('#hub-recovery-summary')?.textContent==='0 件の復旧候補'&&document.querySelectorAll('.hub-recovery-row').length===0&&!document.querySelector('#hub-recovery-warning')");
  console.log('PASS UX-10f-4 home recovery discovery, direct navigation and list cleanup');
  const report='PASS UX-10f-3 forced process recovery, external conflict protection and explicit save';
  if(!process.env.BC_PACKAGE_SMOKE_REPORT)throw Error('Crash verification report required');
  await writeFile(process.env.BC_PACKAGE_SMOKE_REPORT,report+'\n',{flag:'wx'});
  console.log(report);
  closing=true;win.destroy();app.exit(0);
}
async function recoveryJourneySmoke(){
  const raw=js=>win.webContents.executeJavaScript(js);
  const until=async(label,js)=>{for(let i=0;i<150;i++){if(await raw(js))return;await new Promise(r=>setTimeout(r,100));}throw Error('Recovery journey: '+label+'; '+await raw("document.querySelector('#status')?.textContent"));};
  const click=async selector=>{
    await until('reachable '+selector,"(()=>{const e=document.querySelector("+JSON.stringify(selector)+");return !!e?.getClientRects().length&&!e.disabled;})()");
    await raw("document.querySelector("+JSON.stringify(selector)+").click()");
  };
  const path=join(smokeRoot,'writing-journey','manuscript','chapter-01.md');
  const saved=await readFile(path,'utf8'),draft=saved+'\n復旧テストの未保存原稿。\n';
  const key=recoveryKey(join(smokeRoot,'writing-journey','book.yaml'),'chapter-01','manuscript/chapter-01.md');
  const store=recoveryStore(smokeRoot);
  await click('#mode-writing');await click('#editor-view-source');
  await raw("(()=>{const e=document.querySelector('#source');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,"+JSON.stringify(draft)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await until('snapshot recorded',"document.querySelector('#recovery-state')?.dataset.phase==='recorded'");
  if((await store.get(key))?.text!==draft||await readFile(path,'utf8')!==saved)throw Error('Recovery checkpoint changed original or lost draft');
  async function reopen(){
    await win.loadURL(PAGE);
    await selectManualPreviewForRegression();
    await until('home catalog',"[...document.querySelectorAll('.hub-project-open')].some(e=>e.querySelector('strong')?.textContent==='執筆フロー検証書籍')");
    await raw("(()=>{const e=[...document.querySelectorAll('.hub-project-open')].find(e=>e.querySelector('strong')?.textContent==='執筆フロー検証書籍');if(!e?.getClientRects().length||e.disabled)throw Error('Fixture unavailable');e.click();})()");
    await click('[data-section=chapter-01]');
    await until('recovery review',"document.querySelector('#recovery-dialog').open&&document.querySelector('#recovery-draft-text').value==="+JSON.stringify(draft)+"&&document.querySelector('#source').value==="+JSON.stringify(saved));
  }
  await reopen();
  await click('#recovery-later');
  await until('deferred is read-only',"!document.querySelector('#recovery-dialog').open&&document.querySelector('#source').readOnly");
  await click('#recovery-review');await click('#recovery-restore');
  await until('restored in memory',"!document.querySelector('#recovery-dialog').open&&document.querySelector('#source').value==="+JSON.stringify(draft)+"&&document.querySelector('#workspace-save-state').textContent==='未保存：原稿'");
  if(await readFile(path,'utf8')!==saved)throw Error('Restore overwrote original');
  await until('restored checkpoint',"document.querySelector('#recovery-state')?.dataset.phase==='recorded'");
  await reopen();await click('#recovery-discard');
  await until('explicit discard',"!document.querySelector('#recovery-dialog').open&&!document.querySelector('#source').readOnly&&document.querySelector('#workspace-save-state').textContent==='保存済み'");
  if(await store.get(key)||await readFile(path,'utf8')!==saved)throw Error('Discard changed original or kept recovery');
  console.log('PASS UX-10f-2 packaged checkpoint, deferred review, restore without overwriting and explicit discard');
}
// Exercise the packaged typed settings recovery UI without modifying the
// writing-journey restart oracle's saved manifest or theme.
async function settingsRecoveryJourneySmoke(){
  const raw=js=>win.webContents.executeJavaScript(js);
  const until=async(label,js)=>{for(let i=0;i<150;i++){if(await raw(js))return;await new Promise(r=>setTimeout(r,100));}throw Error('Settings recovery journey: '+label+'; '+await raw("document.querySelector('#status')?.textContent"));};
  const click=async selector=>{
    await until('reachable '+selector,"(()=>{const e=document.querySelector("+JSON.stringify(selector)+");return !!e?.getClientRects().length&&!e.disabled;})()");
    await raw("document.querySelector("+JSON.stringify(selector)+").click()");
  };
  const change=async(selector,value)=>raw("(()=>{const e=document.querySelector("+JSON.stringify(selector)+");if(!e?.getClientRects().length||e.disabled)throw Error('Select unavailable');e.value="+JSON.stringify(value)+";e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  const root=join(smokeRoot,'writing-journey'),manifest=join(root,'book.yaml'),theme=join(root,'themes','default','theme.yaml');
  const savedManifest=await readFile(manifest,'utf8'),savedTheme=await readFile(theme,'utf8'),store=recoveryStore(smokeRoot,'settings');
  await click('#mode-design');await click('#design-tab-styles');
  const font=await raw("document.querySelector('#body-font').value==='serif'?'sans-serif':'serif'");
  await change('#body-font',font);
  await click('#book-settings');
  const size=await raw("document.querySelector('#page-size').value==='A4'?'A5':'A4'");
  await change('#page-size',size);
  await until('both recorded',"['typography','book-settings'].every(k=>document.querySelector('#settings-recovery-state-'+k)?.dataset.phase==='recorded')");
  if((await store.list()).records.length!==2||await readFile(manifest,'utf8')!==savedManifest||await readFile(theme,'utf8')!==savedTheme)throw Error('Settings checkpoint changed ordinary files');
  await win.loadURL(PAGE);
  await selectManualPreviewForRegression();
  await until('home catalog',"[...document.querySelectorAll('.hub-project-open')].some(e=>e.querySelector('strong')?.textContent==='執筆フロー検証書籍'&&!e.disabled)");
  await click('#hub-recovery');
  await until('settings listed',"document.querySelector('#hub-recovery-summary')?.textContent==='2 件の復旧候補'&&['typography','book-settings'].every(k=>!!document.querySelector('[data-recovery-setting='+k+'] .hub-recovery-open'))");
  await click('[data-recovery-setting=typography] .hub-recovery-open');
  await until('both candidates',"['typography','book-settings'].every(k=>!!document.querySelector('#settings-recovery-review-'+k))");
  await until('locked typography',"document.querySelector('#body-font').disabled");
  await until('comparison',"document.querySelector('#settings-recovery-dialog').open&&!!document.querySelector('#settings-recovery-restore')");
  await click('#settings-recovery-later');
  await until('deferred',"!document.querySelector('#settings-recovery-dialog').open&&document.querySelector('#body-font').disabled");
  await click('#settings-recovery-review-typography');await click('#settings-recovery-restore');
  await until('font restored',"!document.querySelector('#settings-recovery-dialog').open&&document.querySelector('#body-font').value==="+JSON.stringify(font)+"&&document.querySelector('#workspace-save-state').textContent.includes('テーマ')");
  await click('#settings-recovery-review-book-settings');await click('#settings-recovery-restore');
  await until('size restored',"!document.querySelector('#settings-recovery-dialog').open&&document.querySelector('#page-size').value==="+JSON.stringify(size)+"&&document.querySelector('#workspace-save-state').textContent==='未保存：テーマ・書籍設定'");
  if(await readFile(manifest,'utf8')!==savedManifest||await readFile(theme,'utf8')!==savedTheme)throw Error('Settings recovery overwrote original');
  await click('#discard-book-settings');await click('#mode-design');await click('#design-tab-styles');await click('#discard-theme-roles');
  await until('clean settings',"document.querySelector('#workspace-save-state').textContent==='保存済み'");
  for(let i=0;i<100;i++){if(!(await store.list()).records.length)break;await new Promise(r=>setTimeout(r,100));}
  if((await store.list()).records.length||await readFile(manifest,'utf8')!==savedManifest||await readFile(theme,'utf8')!==savedTheme)throw Error('Settings discard failed');
  await click('#mode-writing');await click('[data-section=chapter-01]');
  await until('manuscript returned',"document.querySelector('#workspace-save-state').textContent==='保存済み'&&!document.querySelector('#source').disabled");
  console.log('PASS UX-10g-2 packaged settings checkpoint, locked review, restore and discard without changing originals');
}
// Test the editor against the actual component store and theme. The saved
// restart fixture must remain byte-identical throughout this journey.
async function componentRecoveryJourneySmoke(){
  const raw=js=>win.webContents.executeJavaScript(js);
  const until=async(label,js)=>{for(let i=0;i<150;i++){if(await raw(js))return;await new Promise(r=>setTimeout(r,100));}throw Error('Component recovery journey: '+label+'; '+await raw("document.querySelector('#status')?.textContent"));};
  const click=async selector=>{
    await until('reachable '+selector,"(()=>{const e=document.querySelector("+JSON.stringify(selector)+");return !!e?.getClientRects().length&&!e.disabled;})()");
    await raw("document.querySelector("+JSON.stringify(selector)+").click()");
  };
  const input=async(selector,value)=>{
    await until('editable '+selector,"(()=>{const e=document.querySelector("+JSON.stringify(selector)+");return !!e?.getClientRects().length&&!e.disabled;})()");
    await raw("(()=>{const e=document.querySelector("+JSON.stringify(selector)+");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+JSON.stringify(String(value))+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  };
  const root=join(smokeRoot,'writing-journey'),themePath=join(root,'themes','default','theme.yaml'),savedTheme=await readFile(themePath,'utf8');
  const store=recoveryStore(smokeRoot,'components');
  const oracle=JSON.parse(await readFile(join(smokeRoot,'ux10-restart.json'),'utf8'));
  const selector='[data-catalog-edit=registered-'+oracle.customId+']';
  async function openLab(){await click('#mode-design');await click('#design-tab-components');await click(selector);await click('[data-property-choice=layout]');}
  await openLab();
  const padding=oracle.padding===7?8:7;
  await input('#lab-padding',padding);
  await until('component checkpoint',"document.querySelector('#component-recovery-state')?.dataset.phase==='recorded'");
  const snapshot=(await store.list()).records;
  if(snapshot.length!==1||await readFile(themePath,'utf8')!==savedTheme)throw Error('Component checkpoint modified theme or missed draft');
  async function reopen(){
    await win.loadURL(PAGE);
    await selectManualPreviewForRegression();
    await until('home catalog',"[...document.querySelectorAll('.hub-project-open')].some(e=>e.querySelector('strong')?.textContent==='執筆フロー検証書籍'&&!e.disabled)");
    await click('#hub-recovery');
    await until('registered component listed',"document.querySelector('#hub-recovery-summary')?.textContent==='1 件の復旧候補'&&!!document.querySelector("+JSON.stringify('[data-recovery-entry='+oracle.customId+'] .hub-recovery-open')+")");
    await click('[data-recovery-entry='+oracle.customId+'] .hub-recovery-open');
    await click('[data-property-choice=layout]');
    await until('candidate',"!!document.querySelector('#component-recovery-restore')&&document.querySelector('#lab-padding').disabled");
  }
  await reopen();await click('#component-recovery-later');
  await until('deferred close',"!document.querySelector('#lab-measure')");
  if((await store.list()).records[0]?.version!==snapshot[0].version)throw Error('Deferred recovery was modified');
  await openLab();await click('#component-recovery-restore');
  await until('restored design requires measurement',"Number(document.querySelector('#lab-padding').value)==="+padding+"&&!document.querySelector('#lab-measure').disabled&&document.querySelector('#lab-library-replace').disabled");
  await click('#lab-measure');
  await until('restored design measured',"!document.querySelector('#lab-library-replace').disabled");
  if(await readFile(themePath,'utf8')!==savedTheme)throw Error('Recovery implicitly changed registered component');
  await click('#lab-cancel');await until('discarded close',"!document.querySelector('#lab-measure')");
  if((await store.list()).records.length||await readFile(themePath,'utf8')!==savedTheme)throw Error('Component cancel did not clean up working draft');
  await click('#mode-writing');await click('[data-section=chapter-01]');
  await until('manuscript returned',"document.querySelector('#workspace-save-state').textContent==='保存済み'&&!document.querySelector('#source').disabled");
  console.log('PASS UX-10g-4 registered component draft checkpoint, defer, restore, remeasure and cancel without overwriting');
  await click('#mode-home');await click('#hub-recovery');
  await until('unified list cleared',"document.querySelector('#hub-recovery-summary')?.textContent==='0 件の復旧候補'&&!document.querySelector('#hub-recovery-warning')");
  await click('#hub-projects');await click('#hub-recovery');
  await until('refreshed list cleared',"document.querySelector('#hub-recovery-summary')?.textContent==='0 件の復旧候補'");
  await click('#hub-return-writing');
  await until('returned to writing',"document.querySelector('.workspace-shell').dataset.workspaceMode==='writing'");
  console.log('PASS UX-10g-5 home recovery routes for settings and registered component, list cleanup');
}
async function nativeCloseSmoke(decision){
  const raw=js=>win.webContents.executeJavaScript(js);
  const until=async(label,js)=>{for(let i=0;i<150;i++){if(await raw(js))return;await new Promise(r=>setTimeout(r,100));}throw Error('Native close smoke: '+label);};
  const click=async selector=>{
    await until('reachable '+selector,"(()=>{const e=document.querySelector("+JSON.stringify(selector)+");return !!e?.getClientRects().length&&!e.disabled;})()");
    await raw("document.querySelector("+JSON.stringify(selector)+").click()");
  };
  const inputSource=value=>raw("(()=>{const e=document.querySelector('#source');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  const changeSelect=(selector,value)=>raw("(()=>{const e=document.querySelector("+JSON.stringify(selector)+");if(!e?.getClientRects().length||e.disabled)throw Error('Select unavailable');e.value="+JSON.stringify(value)+";e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  const openClose=async()=>{win.close();await until('native close dialog',"document.querySelector('#close-dialog').open");};
  const cancelClose=async()=>{await click('#close-cancel');await until('cancelled close',"!document.querySelector('#close-dialog').open");};
  const exit=async selector=>{
    await until('exit available',"!document.querySelector("+JSON.stringify(selector)+").disabled");
    let timer;
    const closed=new Promise((resolve,reject)=>{win.once('closed',resolve);timer=setTimeout(()=>reject(Error('Native close did not exit')),15000);});
    try{
      // A successful exit can dispose the frame before executeJavaScript replies.
      // Only accept that specific error if the actual closed event also arrives.
      await raw("document.querySelector("+JSON.stringify(selector)+").click()").catch(e=>{if(!win.isDestroyed()&&!/Render frame was disposed|Object has been destroyed/i.test(String(e.message??e)))throw e;});
      await closed;
    }finally{clearTimeout(timer);}
  };
  if(decision==='discard'){
    const path=join(smokeRoot,'writing-journey','manuscript','chapter-01.md'),saved=await readFile(path,'utf8');
    await click('#mode-writing');await click('#editor-view-source');
    await inputSource(saved+'\n保存せず終了する検査。\n');
    await until('dirty draft',"document.querySelector('#workspace-save-state').textContent==='未保存：原稿'");
    await openClose();
    await until('dirty target and safe default',"document.querySelector('#close-unsaved').textContent==='原稿'&&document.activeElement.id==='close-cancel'");
    await cancelClose();
    await until('cancel preserves draft',"document.querySelector('#source').value==="+JSON.stringify(saved+'\n保存せず終了する検査。\n'));
    await openClose();await exit('#close-discard');
    if(await readFile(path,'utf8')!==saved)throw Error('Discard changed saved manuscript');
    console.log('PASS UX-10e native close cancel and discard preserve saved book');
    return;
  }
  // First test unfinished structured edits on the saved journey book.
  await click('#mode-writing');
  await click('[data-structured-kind=heading] [data-rich-edit]');
  await until('active structured draft',"!!document.querySelector('#structured-rich-value')");
  await openClose();
  await until('blocked close',"!document.querySelector('#close-save')&&!document.querySelector('#close-discard')&&document.querySelector('#close-description').textContent.includes('現在の操作')");
  await cancelClose();
  await until('draft preserved',"!!document.querySelector('#structured-rich-value')");
  await click('#structured-cancel');
  // Test actual saves on the other disposable fixture, leaving the restart oracle intact.
  await click('#mode-home');
  await until('other book visible',"[...document.querySelectorAll('.hub-project-open')].some(e=>e.querySelector('strong')?.textContent==='Desktop smoke')");
  await raw("(()=>{const e=[...document.querySelectorAll('.hub-project-open')].find(e=>e.querySelector('strong')?.textContent==='Desktop smoke');if(!e?.getClientRects().length||e.disabled)throw Error('Fixture unavailable');e.click();})()");
  await until('fixture reopened',"document.querySelector('.workspace-shell').dataset.workspaceMode==='writing'&&!!document.querySelector('[data-section=chapter]')&&!document.querySelector('[data-section=chapter]').disabled");
  await click('[data-section=chapter]');
  const path=join(smokeRoot,'manuscript','chapter.md'),themePath=join(smokeRoot,'themes','default','theme.yaml'),manifestPath=join(smokeRoot,'book.yaml');
  const saved=await readFile(path,'utf8'),oldTheme=await readFile(themePath,'utf8'),oldManifest=await readFile(manifestPath,'utf8');
  await until('fixture loaded',"document.querySelector('#source').value==="+JSON.stringify(saved));
  const draft=saved+'\n終了時の保存を検証します。\n';
  await inputSource(draft);
  await click('#mode-design');await click('#design-tab-styles');
  const family=await raw("document.querySelector('#body-font').value==='serif'?'sans-serif':'serif'");
  await changeSelect('#body-font',family);
  await click('#book-settings');
  const size=await raw("document.querySelector('#page-size').value==='A4'?'A5':'A4'");
  await changeSelect('#page-size',size);
  await until('all dirty',"document.querySelector('#workspace-save-state').textContent==='未保存：原稿・テーマ・書籍設定'");
  // Simulate a real external modification and require the existing revision guard.
  const external=saved+'\n外部で更新した原稿。\n';
  await writeFile(path,external);
  await openClose();
  await click('#close-save');
  await until('conflict blocks exit',"document.querySelector('#close-dialog').open&&document.querySelector('#close-error')?.textContent.includes('CONFLICT')&&!document.querySelector('#close-cancel').disabled");
  if(await readFile(path,'utf8')!==external||await readFile(themePath,'utf8')!==oldTheme||await readFile(manifestPath,'utf8')!==oldManifest)throw Error('Failed close save changed saved files');
  await cancelClose();
  await until('conflict preserves in-memory draft',"document.querySelector('#source').value==="+JSON.stringify(draft)+"&&document.querySelector('#workspace-save-state').textContent==='未保存：原稿・テーマ・書籍設定'");
  // Restore the original fixture bytes so the original revision can be saved.
  await writeFile(path,saved);
  await openClose();await exit('#close-save');
  if(await readFile(path,'utf8')!==draft||await readFile(themePath,'utf8')===oldTheme||!(await readFile(manifestPath,'utf8')).includes('size: '+size))throw Error('Save and exit failed to persist every target');
  console.log('PASS UX-10e native close blocks drafts and conflicts, then saves all targets and exits');
}
async function smoke(){
  const exec=workspaceSmokeExec();
  const until=async js=>{for(let i=0;i<100;i++){if(await exec(js))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+js+'; renderer status: '+await exec("document.querySelector('#status')?.textContent")+'; inline nodes: '+await exec("JSON.stringify([...document.querySelector('#preview > div')?.shadowRoot?.querySelectorAll('[data-named-slot=extra] [data-inline-style]')??[]].map(s=>({text:s.textContent,style:s.getAttribute('style')})))"));};
  await until("!!document.querySelector('#open')&&!document.querySelector('#open').disabled");
  if(!await exec("typeof require==='undefined' && typeof process==='undefined' && !!window.bookcreator"))throw Error('Renderer isolation failed');
  await exec("document.querySelector('#open').click()");
  await until("!!document.querySelector('[data-section=chapter]')");
  const {tinyPng}=await import('./tests/png-fixture.mjs');
  await writeFile(join(smokeRoot,'test-image.png'),tinyPng());
  await exec("document.querySelector('#image-manager').click()");
  await until("!!document.querySelector('#import-image')");
  if(!await exec("document.querySelector('#import-image').disabled"))throw Error('Image import permission gate missing');
  await exec("document.querySelector('#image-copy').click()");
  await until("!document.querySelector('#import-image').disabled");
  await exec("document.querySelector('#import-image').click()");
  await until("!!document.querySelector('[data-project-image] img') && document.querySelector('[data-project-image] img').naturalWidth===2 && !document.querySelector('#open').disabled");
  const imageId=await exec("document.querySelector('[data-project-image]').dataset.projectImage");
  if(!(await readFile(join(smokeRoot,'assets','images',imageId+'.png'))).equals(tinyPng()))throw Error('Imported image bytes differ');
  await exec("document.querySelector('#image-copy').click()");
  await exec("document.querySelector('#import-image').click()");
  await until("document.querySelector('#status').textContent.includes('登録済み') && !document.querySelector('#open').disabled");
  if(!await exec("document.querySelectorAll('[data-project-image]').length===1"))throw Error('Duplicate image catalog entry');
  await exec("document.querySelector('#image-manager').click()");
  await until("!document.querySelector('#import-image')");
  await exec("document.querySelector('[data-section=chapter]').click()");
  await until("document.querySelector('#source')?.value.includes('見出し')");
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-block]')"+")");
  if(!await exec("Array.from(document.fonts).some(f=>f.family.includes('BCFont_NotoSansJP')&&f.status==='loaded')"))throw Error('Bundled Noto font not loaded');
  if(!await exec("(()=>{const lines=[...document.querySelector('#preview > div').shadowRoot.querySelectorAll('[data-start]')];return lines.every(l=>l.style.fontFamily.includes('BCFont_NotoSansJP'))&&lines.some(l=>l.style.fontWeight==='700')&&lines.some(l=>l.style.fontWeight==='400');})()"))throw Error('Font roles not applied');
  // Inline math in ordinary body text, including bundled-font rendering and exact atom selection.
  const beforeInlineMath=await exec("document.querySelector('#source').value");
  const inlineMathSource='$\\frac{a_1^2}{b}$',mixedInlineMath=beforeInlineMath.replace(/\n*$/,'')+'\n\n**係数** '+inlineMathSource+' を使います。\n';
  const setInlineMathSource=value=>exec("(()=>{const el=document.querySelector('#source');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,"+JSON.stringify(value)+");el.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await setInlineMathSource(mixedInlineMath);
  await until("document.querySelector('#source').value==="+JSON.stringify(mixedInlineMath));
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-inline-math] math mfrac')"+")");
  await exec("document.querySelector('#preview > div').shadowRoot.querySelector('[data-inline-math]').click()");
  if(!await exec("(()=>{const el=document.querySelector('#source');return el.value.slice(el.selectionStart,el.selectionEnd)==="+JSON.stringify(inlineMathSource)+";})()"))throw Error('Inline math raw delimiter envelope selection failed');
  // Reuse the math dialog to edit a clicked inline atom and insert another at a caret.
  await exec("document.querySelector('#source-inline-math').click()");
  await until("document.querySelector('#math-formula')?.value==="+JSON.stringify(inlineMathSource.slice(1,-1)));
  const setInlineDraft=value=>exec("(()=>{const e=document.querySelector('#math-formula');Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await setInlineDraft(' x');
  await until("document.querySelector('#math-apply')?.disabled===true");
  await exec("document.querySelector('#math-cancel').click()");
  if(await exec("document.querySelector('#source').value")!==mixedInlineMath)throw Error('Cancel inline formula changed manuscript');
  await exec("document.querySelector('#source-inline-math').click()");
  await until("!!document.querySelector('#math-formula')");
  const editedInline='\\sqrt{x^2+1}';
  await setInlineDraft(editedInline);
  await until("!!document.querySelector('#math-draft-preview math[display=inline] msqrt')");
  await exec("document.querySelector('#math-apply').click()");
  const editedInlineSource=mixedInlineMath.replace(inlineMathSource,'$'+editedInline+'$');
  await until("document.querySelector('#source').value==="+JSON.stringify(editedInlineSource));
  await until("(()=>{const e=document.querySelector('#source');return e.value.slice(e.selectionStart,e.selectionEnd)==="+JSON.stringify(editedInline)+";})()");
  await exec("(()=>{const e=document.querySelector('#source'),p=e.value.lastIndexOf('を使います。');e.focus();e.setSelectionRange(p,p);document.querySelector('#source-inline-math').click();})()");
  await until("document.querySelector('#math-formula')?.value==='x^2'");
  await exec("document.querySelector('#math-apply').click()");
  const twiceInline=editedInlineSource.replace('を使います。','$x^2$を使います。');
  await until("document.querySelector('#source').value==="+JSON.stringify(twiceInline));
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"document.querySelector('#preview > div')?.shadowRoot?.querySelectorAll('[data-inline-math]').length===2"+")");
  await exec("document.querySelector('#preview > div').shadowRoot.querySelectorAll('[data-inline-math]')[1].click()");
  await exec("document.querySelector('#source-inline-math').click()");
  await until("document.querySelector('#math-formula')?.value==='x^2'");
  await setInlineMathSource(twiceInline+'\n追記。');
  await until("document.querySelector('#math-apply')?.disabled===true");
  await exec("document.querySelector('#math-cancel').click()");
  if(await exec("document.querySelector('#source').value")!==twiceInline+'\n追記。')throw Error('Stale inline draft overwrote manuscript');
  await setInlineMathSource(beforeInlineMath);
  await until("document.querySelector('#source').value==="+JSON.stringify(beforeInlineMath)+" && document.querySelector('#preview > div')?.dataset.paperFreshness==='previous'&&document.querySelector('#preview > div').inert");
  await exec("(()=>{const el=document.querySelector('#body-font');el.value='serif';el.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until("document.querySelector('#preview > div')?.dataset.paperFreshness==='previous'&&document.querySelector('#preview > div').inert");
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-block]')"+")");
  if(!await exec("Array.from(document.querySelector('#preview > div').shadowRoot.querySelectorAll('[data-start]')).some(l=>l.style.fontFamily==='serif')"))throw Error('Body font change not applied');
  await exec("document.querySelector('#preview > div').shadowRoot.querySelector('[data-block]').click()");
  if(!await exec("document.querySelector('#source').selectionEnd>document.querySelector('#source').selectionStart"))throw Error('Source selection failed');
  await exec("(()=>{const el=document.querySelector('#source');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,el.value+'\\n追記');el.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await until("!document.querySelector('#save').disabled && document.querySelector('#preview > div')?.dataset.paperFreshness==='previous'&&document.querySelector('#preview > div').inert");
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
  if(!await exec("document.querySelector('#math-font').value==='BCFont_STIXTwoMath'"))throw Error('New book default STIX math role missing');
  if(!process.env.BC_TEST_FONT)throw Error('Missing test font path');
  await until("!document.querySelector('#open').disabled");
  await exec("document.querySelector('#font-manager').click()");
  await until("!!document.querySelector('#font-license')");
  await exec("(()=>{for(const [id,value] of [['font-license','Liberation Sans test font'],['font-license-text','Disposable CI fixture, Liberation Sans font license recorded for testing']]){const e=document.getElementById(id);Object.getOwnPropertyDescriptor((e.tagName==='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement).prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));}document.querySelector('#font-copy').click();})()");
  await until("!document.querySelector('#import-font').disabled");
  await exec("document.querySelector('#import-font').click()");
  await until("!document.querySelector('#open').disabled && !!document.querySelector('[data-project-font][data-loaded=true]')");
  await exec("(()=>{const el=document.querySelector('#body-font');el.value=[...el.options].find(o=>/^BCFont_[a-f0-9]{64}$/.test(o.value)).value;el.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until("!document.querySelector('#save-theme').disabled");
  await exec("document.querySelector('#save-theme').click()");
  await until("!document.querySelector('#open').disabled && document.querySelector('#status').textContent.includes('テーマを保存しました')");
  await exec("document.querySelector('[data-section=chapter-01]').click()");
  await until("!document.querySelector('#open').disabled && document.querySelector('#source').value.includes('はじめに')");
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-start]')"+")");
  if(!await exec("Array.from(document.querySelector('#preview > div').shadowRoot.querySelectorAll('[data-start]')).some(l=>/BCFont_[a-f0-9]{64}/.test(l.style.fontFamily))"))throw Error('Imported face not used in measured preview');
  await exec("document.querySelector('#book-settings').click()");
  await until("!!document.querySelector('#page-size')");
  await exec("(()=>{const e=document.querySelector('#page-size');e.value='A4';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until("!document.querySelector('#save-book-settings').disabled");
  await exec("document.querySelector('#save-book-settings').click()");
  await until("!document.querySelector('#open').disabled && document.querySelector('#status').textContent.includes('書籍設定を保存しました')");
  if(!(await readFile(join(smokeRoot,'new-book','book.yaml'),'utf8')).includes('size: A4'))throw Error('Page size not persisted');
  await exec("document.querySelector('#preview-book').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-content-guide]')"+")");
  if(!await exec("Math.abs(parseFloat(document.querySelector('#preview > div').shadowRoot.querySelector('[data-page]').style.width)-210*96/25.4)<0.1"))throw Error('Physical A4 preview width mismatch');
  await exec("document.querySelector('#component-lab').click()");
  await until("!!document.querySelector('#lab-measure')");
  if(!await exec("(()=>{const q=s=>document.querySelector(s),a=q('.lab-layers').getBoundingClientRect(),b=q('.lab-canvas').getBoundingClientRect(),c=q('.lab-inspector').getBoundingClientRect();return a.width>0&&b.width>0&&c.width>0&&a.right<=b.left&&b.right<=c.left&&q('.lab-layers').contains(q('[data-lab-node]'))&&q('.lab-inspector').contains(q('#lab-padding'))&&q('.lab-canvas').contains(q('#lab-preview'));})()"))throw Error('Component editor pane order or controls incorrect');
  await until("document.querySelector('#lab-add-options').hidden&&document.querySelector('#lab-property-appearance').hidden===false&&document.querySelector('#lab-property-layout').hidden&&document.querySelector('#lab-property-details').hidden");
  await exec("document.querySelector('#lab-add-menu').click()");
  await until("!document.querySelector('#lab-add-options').hidden&&!!document.querySelector('#lab-add-label').getClientRects().length");
  await exec("document.querySelector('#lab-add-menu').click()");
  await until("document.querySelector('#lab-add-options').hidden&&!document.querySelector('#lab-add-label').getClientRects().length");
  for(const category of ['layout','details','appearance']){
    await exec("document.querySelector('[data-property-choice="+category+"]').click()");
    await until("!document.querySelector('[data-property-tab="+category+"]').hidden&&[...document.querySelectorAll('.lab-inspector [data-property-tab]')].filter(p=>!p.hidden).length===1");
  }
  if(!await exec("document.querySelector('#lab-padding').closest('[data-property-tab]').dataset.propertyTab==='layout'&&document.querySelector('#lab-font-size').closest('[data-property-tab]').dataset.propertyTab==='appearance'"))throw Error('Inspector categories incorrect');
  // At compact UI sizes the same editor becomes a scrollable vertical workspace.
  const labOriginalZoom=win.webContents.getZoomFactor(),labBaseWidth=await exec("innerWidth");
  win.webContents.setZoomFactor(labOriginalZoom*2);
  try{
    await until("Math.abs(innerWidth-"+labBaseWidth+"/2)<8");
    await until("(()=>{const d=document.querySelector('.lab-three-pane'),r=d.getBoundingClientRect(),c=document.querySelector('#lab-cancel').getBoundingClientRect(),g=document.querySelector('.lab-grid-three');return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1&&c.left>=r.left&&c.right<=r.right&&g.clientHeight>0;})()");
    if(await exec("innerWidth<=650")){
      await until("(()=>{const a=document.querySelector('.lab-layers').getBoundingClientRect(),b=document.querySelector('.lab-canvas').getBoundingClientRect(),c=document.querySelector('.lab-inspector').getBoundingClientRect();return a.bottom<=b.top+1&&b.bottom<=c.top+1;})()");
    }
    await exec("document.querySelector('#lab-measure').scrollIntoView({block:'center',inline:'nearest'})");
    await until("(()=>{const r=document.querySelector('#lab-measure').getBoundingClientRect(),g=document.querySelector('.lab-grid-three').getBoundingClientRect();return r.top>=g.top-1&&r.bottom<=g.bottom+1;})()");
    await exec("document.querySelector('#lab-measure').click()");
    await until("!document.querySelector('#lab-apply').disabled");
    await exec("document.querySelector('[data-property-choice=layout]').scrollIntoView({block:'center',inline:'nearest'})");
    await until("(()=>{const r=document.querySelector('[data-property-choice=layout]').getBoundingClientRect(),g=document.querySelector('.lab-grid-three').getBoundingClientRect();return r.top>=g.top-1&&r.bottom<=g.bottom+1;})()");
    await exec("document.querySelector('[data-property-choice=layout]').click()");
    await until("!document.querySelector('#lab-property-layout').hidden");
  }finally{
    win.webContents.setZoomFactor(labOriginalZoom);
    await until("Math.abs(innerWidth-"+labBaseWidth+")<8");
  }
  await exec("document.querySelector('[data-property-choice=appearance]').click()");

  await exec("document.querySelector('#lab-measure').click()");
  await until("!document.querySelector('#lab-apply').disabled");
  await exec("document.querySelector('#lab-cancel').click()");
  await until("!document.querySelector('#lab-measure')");
  if((await readFile(join(smokeRoot,'new-book','themes','default','theme.yaml'),'utf8')).includes('previewComponents'))throw Error('Discard saved component');
  await exec("document.querySelector('#component-lab').click()");
  await until("!!document.querySelector('#lab-measure')");
  await exec("document.querySelector('#lab-measure').click()");
  await until("!document.querySelector('#lab-apply').disabled");
  await exec("document.querySelector('#lab-apply').click()");
  await until("!document.querySelector('#open').disabled && !document.querySelector('#lab-measure')");
  if(!(await readFile(join(smokeRoot,'new-book','themes','default','theme.yaml'),'utf8')).includes('previewComponents'))throw Error('Component not saved');
  await exec("document.querySelector('#preview-book').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-component]')"+")");
  await exec("(()=>{const e=document.querySelector('#lab-level');e.value='1';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until("document.querySelector('#lab-level').value==='1'");
  await exec("document.querySelector('#component-lab').click()");
  await until("!!document.querySelector('#lab-add-label')");
  await exec("(()=>{const e=document.querySelector('#lab-direction');e.value='column';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until("document.querySelector('#lab-direction').value==='column'");
  await exec("document.querySelector('#lab-add-label').click()");
  await until("!!document.querySelector('#lab-font-label')");
  await exec("(()=>{const e=document.querySelector('#lab-font-label');e.value='system-monospace';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until("document.querySelector('#lab-font-label').value==='system-monospace'");
  await exec("document.querySelector('#lab-measure').click()");
  await until("!document.querySelector('#lab-apply').disabled");
  await exec("document.querySelector('#lab-apply').click()");
  await until("!document.querySelector('#open').disabled && !document.querySelector('#lab-measure')");
  await exec("document.querySelector('#preview-book').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-fixed-label]')"+")");
  if(!await exec("(()=>{const l=document.querySelector('#preview > div').shadowRoot.querySelector('[data-fixed-label]');return l.textContent==='CHAPTER'&&l.firstElementChild.style.fontFamily==='monospace';})()"))throw Error('Level-specific fixed label not rendered');
  await exec("document.querySelector('#component-lab').click()");
  await until("!!document.querySelector('#lab-group-next')");
  await exec("document.querySelector('[data-lab-node=content]').click()");
  await until("!document.querySelector('#lab-group-next').disabled");
  await exec("document.querySelector('#lab-group-next').click()");
  await until("!!document.querySelector('#lab-group-direction')");
  await exec("document.querySelector('#lab-measure').click()");
  await until("!document.querySelector('#lab-apply').disabled");
  await exec("document.querySelector('#lab-apply').click()");
  await until("!document.querySelector('#open').disabled && !document.querySelector('#lab-measure')");
  await exec("document.querySelector('#preview-book').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-component-group] [data-fixed-label]')"+")");
  await exec("document.querySelector('#component-lab').click()");
  await until("!!document.querySelector('#lab-group-next')");
  await exec("Array.from(document.querySelectorAll('[data-lab-node]')).find(e=>e.textContent.includes('グループ')).click()");
  await until("!!document.querySelector('#lab-group-direction')");
  await exec("(()=>{const e=document.querySelector('#lab-group-direction');e.value='canvas';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until("!!document.querySelector('#lab-canvas-height')");
  await exec("document.querySelector('[data-lab-node=content]').click()");
  await until("!!document.querySelector('#lab-canvas-x')");
  await exec("(()=>{const e=document.querySelector('#lab-canvas-x');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'3');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await until("document.querySelector('#lab-canvas-x').value==='3'");
  await exec("document.querySelector('#lab-measure').click()");
  await until("!document.querySelector('#lab-apply').disabled");
  await exec("document.querySelector('#lab-apply').click()");
  await until("!document.querySelector('#open').disabled && !document.querySelector('#lab-measure')");
  await exec("document.querySelector('#preview-book').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-component-canvas]')"+")");
  if(!await exec("Math.abs(parseFloat(document.querySelector('#preview > div').shadowRoot.querySelector('[data-component-canvas] [data-content-slot]').style.left)-3*96/25.4)<.02"))throw Error('Canvas x not preserved in book');
  await exec("document.querySelector('#component-lab').click()");
  await until("!!document.querySelector('#lab-measure')");
  await exec("document.querySelector('[data-lab-node=content]').click()");
  await until("document.querySelector('#lab-canvas-x')?.value==='3'");
  await exec("document.querySelector('#lab-measure').click()");
  await until("!document.querySelector('#lab-apply').disabled");
  // View settings must not invalidate the measured draft or alter source coordinates.
  await until("document.querySelector('#lab-sample-fields').hidden&&document.querySelector('#lab-zoom').value==='100'");
  const measuredElement=await exec("(()=>{const h=document.querySelector('#lab-preview > div');h.dataset.zoomProbe='same';return h.shadowRoot.querySelector('[data-component-canvas]').style.width;})()");
  await exec("document.querySelector('#lab-sample-toggle').click()");
  await until("!document.querySelector('#lab-sample-fields').hidden");
  await exec("document.querySelector('#lab-sample-toggle').click()");
  await until("document.querySelector('#lab-sample-fields').hidden&&!document.querySelector('#lab-apply').disabled");
  const setZoom=value=>exec("(()=>{const e=document.querySelector('#lab-zoom');e.value="+JSON.stringify(value)+";e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await setZoom('fit');
  await until("(()=>{const v=document.querySelector('#lab-preview'),h=v.firstElementChild;return h?.dataset.zoomProbe==='same'&&Number(v.dataset.zoom)>0&&Number(v.dataset.zoom)<=1&&!document.querySelector('#lab-apply').disabled;})()");
  await setZoom('75');
  await until("(()=>{const v=document.querySelector('#lab-preview'),h=v.firstElementChild,c=h?.shadowRoot.querySelector('[data-component-canvas]');return h?.dataset.zoomProbe==='same'&&Number(v.dataset.zoom)===.75&&Math.abs(c.getBoundingClientRect().width/parseFloat(c.style.width)-.75)<.02;})()");
  if(!await exec("document.querySelector('#lab-preview > div').shadowRoot.querySelector('[data-component-canvas]').style.width==="+JSON.stringify(measuredElement)+"&&document.querySelector('#lab-canvas-x').value==='3'&&!document.querySelector('#lab-apply').disabled&&document.querySelector('#lab-undo').disabled"))throw Error('Zoom changed draft or history');
  // Actual Electron mouse events against the measured shadow DOM at 75% zoom.
  const point=await exec("(()=>{const el=document.querySelector('#lab-preview > div').shadowRoot.querySelector('[data-content-slot][data-lab-draggable]');el.scrollIntoView({block:'center',inline:'center'});const r=el.getBoundingClientRect();return {x:Math.round(r.left+8),y:Math.round(r.top+8)};})()");
  win.webContents.sendInputEvent({type:'mouseMove',...point});
  win.webContents.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1});
  win.webContents.sendInputEvent({type:'mouseMove',x:point.x+19,y:point.y+4,button:'left'});
  win.webContents.sendInputEvent({type:'mouseUp',x:point.x+19,y:point.y+4,button:'left',clickCount:1});
  await until("Number(document.querySelector('#lab-canvas-x')?.value)>3 && !document.querySelector('#lab-apply').disabled");
  const draggedX=await exec("Number(document.querySelector('#lab-canvas-x').value)");
  // Real keyboard input on a focusable measured Canvas child, including remeasurement.
  await exec("document.querySelector('#lab-preview > div').shadowRoot.querySelector('[data-content-slot][data-lab-draggable]').focus()");
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Left'});
  win.webContents.sendInputEvent({type:'keyUp',keyCode:'Left'});
  await until("Math.abs(Number(document.querySelector('#lab-canvas-x')?.value)-("+draggedX+"-.1))<.0001 && !document.querySelector('#lab-apply').disabled");
  await exec("document.querySelector('#lab-undo').click()");
  await until("Number(document.querySelector('#lab-canvas-x')?.value)==="+draggedX+" && document.querySelector('#lab-apply').disabled");

  await exec("document.querySelector('#lab-undo').click()");
  await until("document.querySelector('#lab-canvas-x')?.value==='3' && document.querySelector('#lab-apply').disabled");
  await exec("document.querySelector('#lab-redo').click()");
  await until("Number(document.querySelector('#lab-canvas-x')?.value)==="+draggedX+" && document.querySelector('#lab-apply').disabled");
  await exec("document.querySelector('#lab-measure').click()");
  await until("!document.querySelector('#lab-apply').disabled");
  const originalWidth=await exec("Number(document.querySelector('#lab-canvas-content-width').value)");
  const handlePoint=await exec("(()=>{const h=document.querySelector('#lab-preview > div').shadowRoot.querySelector('[data-content-slot] [data-lab-resize-handle]');h.scrollIntoView({block:'center',inline:'center'});const r=h.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()");
  win.webContents.sendInputEvent({type:'mouseMove',...handlePoint});
  win.webContents.sendInputEvent({type:'mouseDown',...handlePoint,button:'left',clickCount:1});
  win.webContents.sendInputEvent({type:'mouseMove',x:handlePoint.x-8,y:handlePoint.y,button:'left'});
  win.webContents.sendInputEvent({type:'mouseUp',x:handlePoint.x-8,y:handlePoint.y,button:'left',clickCount:1});
  await until("Number(document.querySelector('#lab-canvas-content-width')?.value)<"+originalWidth+" && !document.querySelector('#lab-apply').disabled");
  const resizedWidth=await exec("Number(document.querySelector('#lab-canvas-content-width').value)");
  const expectedWidth=Math.round((originalWidth-8*25.4/96/.75)*10)/10;
  if(Math.abs(resizedWidth-expectedWidth)>.2)throw Error('Scaled resize did not preserve physical dimensions: '+resizedWidth+' vs '+expectedWidth);
  await setZoom('100');
  await until("Number(document.querySelector('#lab-preview').dataset.zoom)===1&&Number(document.querySelector('#lab-canvas-content-width').value)==="+resizedWidth+"&&!document.querySelector('#lab-apply').disabled");
  await exec("document.querySelector('#lab-undo').click()");
  await until("Number(document.querySelector('#lab-canvas-content-width')?.value)==="+originalWidth+" && document.querySelector('#lab-apply').disabled");
  await exec("document.querySelector('#lab-redo').click()");
  await until("Number(document.querySelector('#lab-canvas-content-width')?.value)==="+resizedWidth+" && document.querySelector('#lab-apply').disabled");
  await exec("document.querySelector('#lab-measure').click()");
  await until("!document.querySelector('#lab-apply').disabled");
  await exec("document.querySelector('#lab-apply').click()");
  await until("!document.querySelector('#open').disabled && !document.querySelector('#lab-measure')");
  await exec("document.querySelector('#preview-book').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-component-canvas]')"+")");
  if(!await exec("Math.abs(parseFloat(document.querySelector('#preview > div').shadowRoot.querySelector('[data-component-canvas] [data-content-slot]').style.left)-"+draggedX+"*96/25.4)<.02"))throw Error('Dragged coordinate not persisted');
  if(!await exec("Math.abs(parseFloat(document.querySelector('#preview > div').shadowRoot.querySelector('[data-content-slot]').style.width)-"+resizedWidth+"*96/25.4)<.02 && !document.querySelector('#preview > div').shadowRoot.querySelector('[data-lab-resize-handle]')"))throw Error('Resized width not persisted or editor handle leaked');
  // Reopen saved Canvas, select its sibling label, and align both to the selection's left edge.
  await exec("document.querySelector('#component-lab').click()");
  await until("!!document.querySelector('#lab-measure')");
  await exec("document.querySelector('[data-lab-node=content]').click()");
  await until("!!document.querySelector('#lab-align-left')");
  await exec("document.querySelector('#lab-measure').click()");
  await until("!document.querySelector('#lab-apply').disabled");
  const labelId=await exec("document.querySelector('#lab-preview > div').shadowRoot.querySelector('[data-component-canvas] > [data-fixed-label]').dataset.componentNode");
  await exec("Array.from(document.querySelectorAll('[data-lab-align-node]')).find(e=>e.dataset.labAlignNode==="+JSON.stringify(labelId)+").click()");
  await until("!document.querySelector('#lab-align-left').disabled");
  await exec("document.querySelector('#lab-align-left').click()");
  await until("document.querySelector('#lab-canvas-x')?.value==='0' && !document.querySelector('#lab-apply').disabled");
  await exec("document.querySelector('#lab-undo').click()");
  await until("Number(document.querySelector('#lab-canvas-x')?.value)==="+draggedX+" && document.querySelector('#lab-apply').disabled");
  await exec("document.querySelector('#lab-redo').click()");
  await until("document.querySelector('#lab-canvas-x')?.value==='0'");
  await exec("document.querySelector('#lab-measure').click()");
  await until("!document.querySelector('#lab-apply').disabled");
  await exec("document.querySelector('#lab-apply').click()");
  await until("!document.querySelector('#open').disabled && !document.querySelector('#lab-measure')");
  await exec("document.querySelector('#preview-book').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-component-canvas]')"+")");
  if(!await exec("(()=>{const c=document.querySelector('#preview > div').shadowRoot.querySelector('[data-component-canvas]');return c.querySelector('[data-content-slot]').style.left===c.querySelector('[data-fixed-label]').style.left;})()"))throw Error('Aligned positions not persisted');
  // Exercise the guide in a real pointer gesture, then cancel without committing.
  await exec("document.querySelector('#component-lab').click()");
  await until("!!document.querySelector('#lab-measure')");
  await exec("document.querySelector('[data-lab-node=content]').click()");
  await until("!!document.querySelector('#lab-smart-snap')");
  await exec("document.querySelector('#lab-measure').click()");
  await until("!document.querySelector('#lab-apply').disabled");
  const snapPoint=await exec("(()=>{const e=document.querySelector('#lab-preview > div').shadowRoot.querySelector('[data-content-slot]');e.scrollIntoView({block:'center',inline:'center'});const r=e.getBoundingClientRect();return {x:Math.round(r.left+8),y:Math.round(r.top+4)};})()");
  win.webContents.sendInputEvent({type:'mouseMove',...snapPoint});
  win.webContents.sendInputEvent({type:'mouseDown',...snapPoint,button:'left',clickCount:1});
  win.webContents.sendInputEvent({type:'mouseMove',x:snapPoint.x+2,y:snapPoint.y,button:'left'});
  await until("Array.from(document.querySelector('#lab-preview > div').shadowRoot.querySelectorAll('[data-lab-snap-guide]')).some(e=>e.style.display==='block')");
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
  win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
  win.webContents.sendInputEvent({type:'mouseUp',x:snapPoint.x+2,y:snapPoint.y,button:'left',clickCount:1});
  await until("document.querySelector('#lab-canvas-x')?.value==='0' && document.querySelector('#lab-undo').disabled && !document.querySelector('#lab-apply').disabled && Array.from(document.querySelector('#lab-preview > div').shadowRoot.querySelectorAll('[data-lab-snap-guide]')).every(e=>e.style.display==='none')");
  await exec("document.querySelector('#lab-add').click()");
  await until("!!document.querySelector('#lab-rect-height') && !!document.querySelector('#lab-canvas-y')");
  await exec("(()=>{const e=document.querySelector('#lab-canvas-y');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'40');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await until("document.querySelector('#lab-canvas-y')?.value==='40'");
  await exec("document.querySelector('#lab-measure').click()");
  await until("!document.querySelector('#lab-apply').disabled");
  await exec("Array.from(document.querySelectorAll('[data-lab-align-node]')).filter(e=>!e.checked).forEach(e=>e.click())");
  await until("!document.querySelector('#lab-align-distribute-y').disabled");
  await exec("document.querySelector('#lab-align-distribute-y').click()");
  await until("!document.querySelector('#lab-apply').disabled");
  if(!await exec("(()=>{const c=document.querySelector('#lab-preview > div').shadowRoot.querySelector('[data-component-canvas]');const a=Array.from(c.children).filter(e=>e.dataset.componentNode).map(e=>({y:parseFloat(e.style.top),h:parseFloat(e.style.height)})).sort((a,b)=>a.y-b.y);return a.length===3&&Math.abs((a[1].y-a[0].y-a[0].h)-(a[2].y-a[1].y-a[1].h))<.02;})()"))throw Error('Unequal measured distribution gaps');
  await exec("document.querySelector('#lab-apply').click()");
  await until("!document.querySelector('#open').disabled && !document.querySelector('#lab-measure')");
  await exec("document.querySelector('#preview-book').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-component-canvas]')"+")");
  if(!await exec("!document.querySelector('#preview > div').shadowRoot.querySelector('[data-lab-snap-guide]')"))throw Error('Smart guide leaked to paper');
  // Duplicate a decorative rectangle in the saved Canvas, then protect its draft.
  await exec("document.querySelector('#component-lab').click()");
  await until("!!document.querySelector('#lab-measure')");
  await exec("document.querySelector('[data-lab-node=content]').click()");
  await until("document.querySelector('#lab-duplicate').disabled");
  await exec("document.querySelector('#lab-measure').click()");
  await until("!document.querySelector('#lab-apply').disabled");
  const directRectId=await exec("Array.from(document.querySelector('#lab-preview > div').shadowRoot.querySelector('[data-component-canvas]').children).find(e=>e.dataset.componentNode&&!e.hasAttribute('data-content-slot')&&!e.hasAttribute('data-fixed-label')&&!e.hasAttribute('data-component-group')).dataset.componentNode");
  await exec("Array.from(document.querySelectorAll('[data-lab-node]')).find(e=>e.dataset.labNode==="+JSON.stringify(directRectId)+").click()");
  await until("!document.querySelector('#lab-duplicate').disabled && !!document.querySelector('#lab-canvas-y')");
  const originalId=await exec("document.querySelector('[data-lab-node].active').dataset.labNode");
  await exec("document.querySelector('#lab-duplicate').click()");
  await until("document.querySelector('[data-lab-node].active').dataset.labNode!=="+JSON.stringify(originalId));
  const copyId=await exec("document.querySelector('[data-lab-node].active').dataset.labNode");
  await exec("document.querySelector('#lab-lock').click()");
  await until("document.querySelector('#lab-lock').getAttribute('aria-pressed')==='true'");
  await exec("document.querySelector('#lab-undo').click()");
  await until("document.querySelector('#lab-status').textContent.includes('ロック中')");
  await exec("document.querySelector('#lab-measure').click()");
  await until("!document.querySelector('#lab-apply').disabled");
  const lockY=await exec("document.querySelector('#lab-canvas-y').value");
  await exec("Array.from(document.querySelector('#lab-preview > div').shadowRoot.querySelectorAll('[data-lab-draggable]')).find(e=>e.dataset.componentNode==="+JSON.stringify(copyId)+").focus()");
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Up'});
  win.webContents.sendInputEvent({type:'keyUp',keyCode:'Up'});
  if(!await exec("document.querySelector('#lab-canvas-y').value==="+JSON.stringify(lockY)+" && !document.querySelector('#lab-apply').disabled && Array.from(document.querySelector('#lab-preview > div').shadowRoot.querySelectorAll('[data-lab-draggable]')).find(e=>e.dataset.componentNode==="+JSON.stringify(copyId)+").dataset.labLocked==='true'"))throw Error('Locked geometry changed');
  await exec("document.querySelector('#lab-lock').click()");
  await until("document.querySelector('#lab-lock').getAttribute('aria-pressed')==='false'");
  await exec("document.querySelector('#lab-undo').click()");
  await until("!Array.from(document.querySelectorAll('[data-lab-node]')).some(e=>e.dataset.labNode==="+JSON.stringify(copyId)+")");
  await exec("document.querySelector('#lab-redo').click()");
  await until("Array.from(document.querySelectorAll('[data-lab-node]')).some(e=>e.dataset.labNode==="+JSON.stringify(copyId)+")");
  await exec("document.querySelector('#lab-measure').click()");
  await until("!document.querySelector('#lab-apply').disabled");
  await exec("document.querySelector('#lab-apply').click()");
  await until("!document.querySelector('#open').disabled && !document.querySelector('#lab-measure')");
  await exec("document.querySelector('#preview-book').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-component-canvas]')"+")");
  if(!await exec("Array.from(document.querySelector('#preview > div').shadowRoot.querySelectorAll('[data-component-node]')).some(e=>e.dataset.componentNode==="+JSON.stringify(copyId)+") && !document.querySelector('#preview > div').shadowRoot.querySelector('[data-lab-locked]')"))throw Error('Duplicate not persisted or lock marker leaked');
  // Import into the current project, add an image to the saved Canvas, then apply.
  await exec("document.querySelector('#image-manager').click()");
  await until("!!document.querySelector('#import-image')");
  await exec("document.querySelector('#image-copy').click()");
  await until("!document.querySelector('#import-image').disabled");
  await exec("document.querySelector('#import-image').click()");
  await until("!!document.querySelector('[data-project-image] img') && document.querySelector('[data-project-image] img').naturalWidth===2 && !document.querySelector('#open').disabled");
  await exec("document.querySelector('#image-manager').click()");
  await exec("document.querySelector('#component-lab').click()");
  await until("!!document.querySelector('#lab-add-image')");
  await exec("document.querySelector('[data-lab-node=content]').click()");
  await until("!document.querySelector('#lab-add-image').disabled");
  await exec("document.querySelector('#lab-add-image').click()");
  await until("!!document.querySelector('#lab-image-fit')");
  await exec("(()=>{const e=document.querySelector('#lab-image-fit');e.value='cover';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await exec("(()=>{const e=document.querySelector('#lab-image-alt');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Test illustration');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await exec("document.querySelector('#lab-measure').click()");
  await until("!document.querySelector('#lab-apply').disabled && !!document.querySelector('#lab-preview > div').shadowRoot.querySelector('[data-component-image] canvas')");
  if(!await exec("(()=>{const c=document.querySelector('#lab-preview > div').shadowRoot.querySelector('[data-component-image] canvas');return c.getAttribute('aria-label')==='Test illustration'&&c.getContext('2d').getImageData(0,0,1,1).data[0]===255;})()"))throw Error('Image preview pixels or alt mismatch');
  await exec("document.querySelector('#lab-apply').click()");
  await until("!document.querySelector('#open').disabled && !document.querySelector('#lab-measure')");
  await exec("document.querySelector('#preview-book').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-component-image] canvas')"+")");
  if(!await exec("document.querySelector('#preview > div').shadowRoot.querySelector('[data-component-image] canvas').getAttribute('aria-label')==='Test illustration'"))throw Error('Image absent from saved paper');
  if(!(await readFile(join(smokeRoot,'new-book','themes','default','theme.yaml'),'utf8')).includes(imageId))throw Error('Stable image ID not saved');
  await exec("document.querySelector('#component-lab').click()");
  await until("!!document.querySelector('#lab-add-image')");
  await exec("Array.from(document.querySelectorAll('[data-lab-node]')).find(e=>e.dataset.labNode.startsWith('image-')).click()");
  await until("!!document.querySelector('#lab-image-ratio')");
  await exec("document.querySelector('#lab-image-ratio').click()");
  await exec("(()=>{const e=document.querySelector('#lab-image-width');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'30');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await until("document.querySelector('#lab-image-width').value==='30' && document.querySelector('#lab-image-height').value==='15'");
  await exec("(()=>{const e=document.querySelector('#lab-crop-left');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'50');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await until("document.querySelector('#lab-crop-left').value==='50'");
  await exec("document.querySelector('#lab-undo').click()");
  await until("document.querySelector('#lab-crop-left').value==='0'");
  await exec("document.querySelector('#lab-redo').click()");
  await until("document.querySelector('#lab-crop-left').value==='50'");
  await exec("document.querySelector('#lab-measure').click()");
  await until("!document.querySelector('#lab-apply').disabled");
  if(!await exec("(()=>{const c=document.querySelector('#lab-preview > div').shadowRoot.querySelector('[data-component-image] canvas');return c.getContext('2d').getImageData(0,0,1,1).data[2]===255;})()"))throw Error('Crop did not display blue source pixel');
  await exec("document.querySelector('#lab-apply').click()");
  await until("!document.querySelector('#open').disabled && !document.querySelector('#lab-measure')");
  await exec("document.querySelector('#preview-book').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-component-image] canvas')"+")");
  if(!await exec("document.querySelector('#preview > div').shadowRoot.querySelector('[data-component-image] canvas').getContext('2d').getImageData(0,0,1,1).data[2]===255"))throw Error('Saved crop not rendered');
  if(!(await readFile(join(smokeRoot,'new-book','assets','images',imageId+'.png'))).equals(tinyPng()))throw Error('Source image modified by crop');
  // Dynamic labels resolve sample context separately from actual manuscript context.
  await exec("document.querySelector('#component-lab').click()");
  await until("!!document.querySelector('#lab-add-dynamic')");
  await exec("document.querySelector('[data-lab-node=content]').click()");
  await until("!document.querySelector('#lab-add-dynamic').disabled");
  await exec("document.querySelector('#lab-add-dynamic').click()");
  await until("!!document.querySelector('#lab-dynamic-field')");
  await exec("document.querySelector('#lab-measure').click()");
  await until("!document.querySelector('#lab-apply').disabled");
  if(!await exec("Array.from(document.querySelector('#lab-preview > div').shadowRoot.querySelectorAll('[data-fixed-label]')).some(e=>e.dataset.componentNode.startsWith('dynamic-')&&e.textContent==='第3章')"))throw Error('Dynamic sample context mismatch');
  await exec("document.querySelector('#lab-apply').click()");
  await until("!document.querySelector('#open').disabled && !document.querySelector('#lab-measure')");
  await exec("document.querySelector('#preview-book').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"Array.from(document.querySelector('#preview > div')?.shadowRoot?.querySelectorAll('[data-fixed-label]')??[]).some(e=>e.dataset.componentNode.startsWith('dynamic-')&&e.textContent==='第1章')"+")");
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"Array.from(document.querySelector('#preview > div')?.shadowRoot?.querySelectorAll('[data-fixed-label]')??[]).some(e=>e.dataset.componentNode.startsWith('dynamic-')&&e.textContent==='第1章')"+")");
  const themeText=await readFile(join(smokeRoot,'new-book','themes','default','theme.yaml'),'utf8');
  if(!themeText.includes('type: dynamic')||!themeText.includes('field: chapter-number'))throw Error('Dynamic definition not persisted');
  // Register the measured design, modify the draft, then load an independent copy.
  await exec("document.querySelector('#component-lab').click()");
  await until("!!document.querySelector('#lab-library-name')");
  await exec("document.querySelector('#lab-measure').click()");
  await until("!document.querySelector('#lab-apply').disabled");
  const setLibraryNameJs=name=>"(()=>{const e=document.querySelector('#lab-library-name');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+JSON.stringify(name)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()";
  await exec(setLibraryNameJs('章見出し'));
  await until("!document.querySelector('#lab-library-add').disabled");
  await exec("document.querySelector('#lab-library-add').click()");
  await until("document.querySelector('#lab-library-select').options.length===2 && !document.querySelector('#open').disabled");
  await exec("(()=>{const e=document.querySelector('#lab-library-select');e.value=e.options[1].value;e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until("document.querySelector('#lab-library-name').value==='章見出し'");
  await exec(setLibraryNameJs('再利用部品'));
  await exec("document.querySelector('#lab-library-rename').click()");
  await until("document.querySelector('#lab-library-select').options[1].textContent==='再利用部品' && !document.querySelector('#open').disabled");
  await exec("Array.from(document.querySelectorAll('[data-lab-node]')).find(e=>e.dataset.labNode.startsWith('dynamic-')).click()");
  await until("!!document.querySelector('#lab-dynamic-prefix')");
  await exec("(()=>{const e=document.querySelector('#lab-dynamic-prefix');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'変更');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await until("document.querySelector('#lab-dynamic-prefix').value==='変更'");
  await exec("document.querySelector('#lab-library-load').click()");
  await until("document.querySelector('#lab-apply').disabled && document.querySelector('#lab-status').textContent.includes('コピー')");
  await exec("document.querySelector('#lab-measure').click()");
  await until("!document.querySelector('#lab-apply').disabled");
  if(!await exec("Array.from(document.querySelector('#lab-preview > div').shadowRoot.querySelectorAll('[data-fixed-label]')).some(e=>e.dataset.componentNode.startsWith('dynamic-')&&e.textContent==='第3章')"))throw Error('Library copy did not restore original design');
  await exec("document.querySelector('#lab-cancel').click()");
  await until("!document.querySelector('#lab-measure')");
  await exec("document.querySelector('#component-lab').click()");
  await until("document.querySelector('#lab-library-select')?.options[1]?.textContent==='再利用部品'");
  const libraryText=await readFile(join(smokeRoot,'new-book','themes','default','theme.yaml'),'utf8');
  if(!libraryText.includes('previewComponentLibrary:')||!libraryText.includes('再利用部品')||!libraryText.includes('field: chapter-number'))throw Error('Library not persisted');
  await exec("document.querySelector('#lab-cancel').click()");
  await until("!document.querySelector('#lab-measure')");
  // Bind the measured library entry to the currently selected H1 design.
  await exec("document.querySelector('#component-lab').click()");
  await until("document.querySelector('#lab-library-select')?.options[1]?.textContent==='再利用部品'");
  await exec("(()=>{const e=document.querySelector('#lab-library-select');e.value=e.options[1].value;e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await exec("document.querySelector('#lab-library-load').click()");
  await exec("document.querySelector('#lab-measure').click()");
  await until("!document.querySelector('#lab-library-bind').disabled");
  await exec("document.querySelector('#lab-library-bind').click()");
  await until("!document.querySelector('#lab-measure') && !document.querySelector('#open').disabled");
  await exec("document.querySelector('#preview-book').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"Array.from(document.querySelector('#preview > div')?.shadowRoot?.querySelectorAll('[data-fixed-label]')??[]).some(e=>e.dataset.componentNode.startsWith('dynamic-')&&e.textContent==='第1章')"+")");
  const sharedYaml=await readFile(join(smokeRoot,'new-book','themes','default','theme.yaml'),'utf8');
  if(!/bindings:\s*\n\s*['"]?1['"]?: component-/.test(sharedYaml))throw Error('Shared H1 binding not persisted');
  await exec("document.querySelector('#component-lab').click()");
  await until("document.querySelector('#lab-current-binding')?.textContent.includes('共有参照：再利用部品')");
  if(!await exec("document.querySelector('#lab-library-delete').disabled && document.querySelector('#lab-library-impact').textContent.includes('H1')"))throw Error('Shared usage or delete guard missing');
  await exec("document.querySelector('#lab-measure').click()");
  await until("!document.querySelector('#lab-apply').disabled");
  if(!await exec("document.querySelector('#lab-apply').textContent.includes('独立コピー')"))throw Error('Detach action unclear');
  await exec("document.querySelector('#lab-apply').click()");
  await until("!document.querySelector('#lab-measure') && !document.querySelector('#open').disabled");
  await exec("document.querySelector('#component-lab').click()");
  await until("document.querySelector('#lab-current-binding')?.textContent.includes('独立デザイン')");
  await exec("document.querySelector('#lab-cancel').click()");
  await until("!document.querySelector('#lab-measure')");
  // Paragraph styling must preserve line fragmentation and not change heading components.
  await exec("document.querySelector('#paragraph-lab').click()");
  await until("!!document.querySelector('#paragraph-measure')");
  await until("document.querySelector('#paragraph-preview')?.dataset.previewPhase==='ready'&&!!document.querySelector('#paragraph-preview > div')?.shadowRoot?.querySelector('[data-fragmentable-frame]')&&!document.querySelector('#paragraph-apply').disabled");
  await exec("(()=>{const e=document.querySelector('#paragraph-sample');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,('本文の分割を検証する文章です。'.repeat(55)+'\\n\\n').repeat(3)+'本文の分割を検証する文章です。'.repeat(55));e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await until("!document.querySelector('#paragraph-apply').disabled && document.querySelector('#paragraph-preview > div').shadowRoot.querySelectorAll('[data-page]').length>1");
  if(!await exec("(()=>{const root=document.querySelector('#paragraph-preview > div').shadowRoot;return Array.from(root.querySelectorAll('[data-fragmentable-frame]')).map(e=>e.querySelector('[data-content-slot]').textContent).join('')===document.querySelector('#paragraph-sample').value;})()"))throw Error('Paragraph frame lost source text');
  // Opt in to BCM math in a disposable paragraph sample; retain the literal mode by default.
  await until("!document.querySelector('#paragraph-sample-fields').hidden&&document.querySelector('#paragraph-zoom').value==='100'");
  await exec("document.querySelector('#paragraph-sample-toggle').click()");
  await until("document.querySelector('#paragraph-sample-fields').hidden&&!document.querySelector('#paragraph-apply').disabled");
  await exec("(()=>{const e=document.querySelector('#paragraph-zoom');e.value='50';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until("Number(document.querySelector('#paragraph-preview').dataset.zoom)===.5");
  await exec("(()=>{const e=document.querySelector('#paragraph-zoom');e.value='100';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until("Number(document.querySelector('#paragraph-preview').dataset.zoom)===1");
  const plainParagraphSample=await exec("document.querySelector('#paragraph-sample').value");
  const setLabSample=(selector,value)=>exec("(()=>{const e=document.querySelector("+JSON.stringify(selector)+");Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await setLabSample('#paragraph-sample','係数 $\\frac{1}{2}$ です。');
  await exec("document.querySelector('#paragraph-sample-bcm').click()");
  await until("document.querySelector('#paragraph-apply').disabled && document.querySelector('#paragraph-preview').dataset.previewConfirmed==='false'");
  await exec("document.querySelector('#paragraph-measure').click()");
  await until("!!document.querySelector('#paragraph-preview > div')?.shadowRoot?.querySelector('[data-inline-math] math mfrac')");
  await setLabSample('#paragraph-sample','式 $x');
  await until("document.querySelector('#paragraph-apply').disabled && document.querySelector('#paragraph-preview').dataset.previewPhase==='error' && document.querySelector('#paragraph-status').textContent.includes('Invalid inline math')");
  await exec("document.querySelector('#paragraph-sample-bcm').click()");
  await setLabSample('#paragraph-sample',plainParagraphSample);
  await until("!document.querySelector('#paragraph-apply').disabled && document.querySelector('#paragraph-preview > div').shadowRoot.querySelectorAll('[data-page]').length>1");
  await exec("document.querySelector('#paragraph-apply').click()");
  await until("!document.querySelector('#paragraph-measure') && !document.querySelector('#open').disabled");
  await exec("document.querySelector('#preview-book').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-fragmentable-frame]')"+")");
  if(!await exec("!!document.querySelector('#preview > div').shadowRoot.querySelector('[data-fixed-label]')"))throw Error('Heading component lost after paragraph save');
  const paragraphYaml=await readFile(join(smokeRoot,'new-book','themes','default','theme.yaml'),'utf8');
  if(!paragraphYaml.includes('previewParagraph:'))throw Error('Paragraph design not persisted');
  // Register the paragraph design in the same catalog, then bind and detach it.
  await exec("document.querySelector('#paragraph-lab').click()");
  await until("!!document.querySelector('#paragraph-library-select')");
  if(!await exec("(()=>{const q=s=>document.querySelector(s),a=q('.lab-layers').getBoundingClientRect(),b=q('.lab-canvas').getBoundingClientRect(),c=q('.lab-inspector').getBoundingClientRect();return a.width>0&&b.width>0&&c.width>0&&a.right<=b.left&&b.right<=c.left&&q('.lab-layers').contains(q('#paragraph-library-select'))&&q('.lab-inspector').contains(q('#paragraph-padding'))&&q('.lab-canvas').contains(q('#paragraph-preview'));})()"))throw Error('Paragraph editor pane order or controls incorrect');
  if(!await exec("document.querySelector('#paragraph-padding').closest('[data-property-tab]').dataset.propertyTab==='layout'&&document.querySelector('#paragraph-size').closest('[data-property-tab]').dataset.propertyTab==='appearance'"))throw Error('Paragraph inspector categories incorrect');
  if(!await exec("document.querySelector('#paragraph-library-select').options.length===1"))throw Error('Heading library entries exposed in paragraph lab');
  await exec("document.querySelector('#paragraph-measure').click()");
  await until("!document.querySelector('#paragraph-apply').disabled");
  await exec("(()=>{const e=document.querySelector('#paragraph-library-name');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'共通本文');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await until("!document.querySelector('#paragraph-library-add').disabled");
  await exec("document.querySelector('#paragraph-library-add').click()");
  await until("document.querySelector('#paragraph-library-select').options.length===2 && !document.querySelector('#open').disabled");
  await exec("(()=>{const e=document.querySelector('#paragraph-library-select');e.value=e.options[1].value;e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until("!document.querySelector('#paragraph-library-bind').disabled");
  await exec("document.querySelector('#paragraph-library-bind').click()");
  await until("!document.querySelector('#paragraph-measure') && !document.querySelector('#open').disabled");
  await exec("document.querySelector('#preview-book').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-fragmentable-frame]')"+")");
  await exec("document.querySelector('#component-lab').click()");
  await until("!!document.querySelector('#lab-library-select')");
  if(!await exec("document.querySelector('#lab-library-select').options.length===2 && document.querySelector('#lab-library-select').options[1].textContent==='再利用部品'"))throw Error('Paragraph library entry exposed in heading lab');
  await exec("document.querySelector('#lab-cancel').click()");
  await until("!document.querySelector('#lab-measure')");
  await exec("document.querySelector('#paragraph-lab').click()");
  await until("document.querySelector('#paragraph-current-binding')?.textContent==='共有参照：共通本文'");
  if(!await exec("document.querySelector('#paragraph-library-delete').disabled && document.querySelector('#paragraph-apply').textContent.includes('独立コピー')"))throw Error('Paragraph binding protection or detach unavailable');
  await exec("document.querySelector('#paragraph-measure').click()");
  await until("!document.querySelector('#paragraph-apply').disabled");
  await exec("document.querySelector('#paragraph-apply').click()");
  await until("!document.querySelector('#paragraph-measure') && !document.querySelector('#open').disabled");
  await exec("document.querySelector('#paragraph-lab').click()");
  await until("document.querySelector('#paragraph-current-binding')?.textContent.includes('独立デザイン')");
  await exec("document.querySelector('#paragraph-cancel').click()");
  await until("!document.querySelector('#paragraph-measure')");
  // Insert a semantic study template without replacing the existing manuscript.
  const originalStudySource=await exec("document.querySelector('#source').value");
  await exec("(()=>{const e=document.querySelector('#study-kind');e.value='warning';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await exec("document.querySelector('#study-append').click()");
  await until("document.querySelector('#source').value.includes(':::callout{kind=\"warning\"}')");
  const newStudySource=await exec("document.querySelector('#source').value");
  if(!newStudySource.startsWith(originalStudySource))throw Error('Study insertion modified existing source');
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"Array.from(document.querySelector('#preview > div')?.shadowRoot?.querySelectorAll('[data-fixed-label]')??[]).some(e=>e.dataset.componentNode==='study-label'&&e.textContent==='注意')"+")");
  await exec("document.querySelector('#preview > div').shadowRoot.querySelector('[data-component-node=study-label]').click()");
  if(!await exec("(()=>{const e=document.querySelector('#source');return e.value.slice(e.selectionStart,e.selectionEnd)==='注意の本文を入力してください。';})()"))throw Error('Study block source selection includes markup or loses body');
  await exec("document.querySelector('#save').click()");
  await until("document.querySelector('#save').disabled && !document.querySelector('#open').disabled");
  await exec("(()=>{const e=document.querySelector('#study-design-kind');e.value='warning';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await exec("document.querySelector('#study-design-lab').click()");
  await until("!!document.querySelector('#lab-study-title')");
  await exec("document.querySelector('[data-lab-node=study-label]').click()");
  await until("!!document.querySelector('#lab-dynamic-prefix')");
  await exec("(()=>{const e=document.querySelector('#lab-dynamic-prefix');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'確認：');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await exec("document.querySelector('#lab-measure').click()");
  await until("!document.querySelector('#lab-apply').disabled");
  await exec("(()=>{const e=document.querySelector('#lab-library-name');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'注意書き共通');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await until("!document.querySelector('#lab-library-add').disabled");
  await exec("document.querySelector('#lab-library-add').click()");
  await until("document.querySelector('#lab-library-select').options.length===2 && !document.querySelector('#open').disabled");
  await exec("(()=>{const e=document.querySelector('#lab-library-select');e.value=e.options[1].value;e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until("!document.querySelector('#lab-library-bind').disabled");
  await exec("document.querySelector('#lab-library-bind').click()");
  await until("!document.querySelector('#lab-measure') && !document.querySelector('#open').disabled");
  await exec("document.querySelector('#preview-book').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"Array.from(document.querySelector('#preview > div')?.shadowRoot?.querySelectorAll('[data-fixed-label]')??[]).some(e=>e.dataset.componentNode==='study-label'&&e.textContent==='確認：注意')"+")");
  const studyYaml=await readFile(join(smokeRoot,'new-book','themes','default','theme.yaml'),'utf8');
  if(!studyYaml.includes('previewStudy:')||!studyYaml.includes('usage: study'))throw Error('Study shared design not persisted');
  // Create a new named library component without assigning any built-in study kind.
  await exec("(()=>{const e=document.querySelector('#study-design-kind');e.value='custom';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await exec("document.querySelector('#study-design-lab').click()");
  await until("!!document.querySelector('#lab-library-name') && !document.querySelector('#lab-library-bind')");
  await exec("(()=>{const e=document.querySelector('#lab-library-name');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'用語解説');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await exec("document.querySelector('#lab-measure').click()");
  await until("!document.querySelector('#lab-library-add').disabled");
  if(!await exec("Array.from(document.querySelector('#lab-preview > div').shadowRoot.querySelectorAll('[data-fixed-label]')).some(e=>e.textContent==='用語解説：サンプル')"))throw Error('Custom component sample did not use its name');
  await exec("document.querySelector('#lab-library-add').click()");
  await until("Array.from(document.querySelector('#lab-library-select').options).some(e=>e.textContent==='用語解説') && !document.querySelector('#open').disabled");
  const customId=await exec("Array.from(document.querySelector('#lab-library-select').options).find(e=>e.textContent==='用語解説').value");
  await exec("document.querySelector('#lab-cancel').click()");
  await until("!document.querySelector('#lab-measure')");
  const catalogThemeBefore=await readFile(join(smokeRoot,'new-book','themes','default','theme.yaml'),'utf8');
  await exec("(()=>{const e=document.querySelector('#component-filter');e.value='registered';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until("!!document.querySelector('[data-catalog-edit=registered-"+customId+"]')");
  await exec("document.querySelector('[data-catalog-edit=registered-"+customId+"]').click()");
  await until("document.querySelector('#lab-library-select')?.value==="+JSON.stringify(customId)+"&&document.querySelector('#lab-library-name').value==='用語解説'&&!document.querySelector('#lab-library-bind')&&document.querySelector('#lab-library-replace').disabled");
  await exec("document.querySelector('#lab-measure').click()");
  await until("!document.querySelector('#lab-library-replace').disabled&&Array.from(document.querySelector('#lab-preview > div').shadowRoot.querySelectorAll('[data-fixed-label]')).some(e=>e.textContent==='用語解説：サンプル')");
  await exec("document.querySelector('#lab-cancel').click()");
  await until("!document.querySelector('#lab-measure')");
  if(await readFile(join(smokeRoot,'new-book','themes','default','theme.yaml'),'utf8')!==catalogThemeBefore)throw Error('Opening registered component changed saved theme');
  await exec("(()=>{const e=document.querySelector('#component-filter');e.value='all';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await exec("document.querySelector('[data-catalog-edit=heading-3]').click()");
  await until("document.querySelector('#lab-measure')&&document.querySelector('.component-lab header').textContent.includes('H3')");
  await exec("document.querySelector('#lab-cancel').click()");
  await until("!document.querySelector('#lab-measure')");
  // Restore the previous H1 target for the legacy quick-select regressions.
  await exec("(()=>{const e=document.querySelector('#lab-level');e.value='1';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until("document.querySelector('#lab-level').value==='1'");
  await exec("(()=>{const e=document.querySelector('#study-kind');e.value="+JSON.stringify(customId)+";e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await exec("document.querySelector('#study-append').click()");
  await until("document.querySelector('#source').value.includes("+JSON.stringify('name="'+customId+'"')+")");
  const setStructuredSource=value=>exec("(()=>{const e=document.querySelector('#source');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  const setStudyValue=(name,value)=>exec("(()=>{const e=[...document.querySelectorAll('[data-study-value]')].find(e=>e.dataset.studyValue==="+JSON.stringify(name)+");Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  const customBefore=await exec("document.querySelector('#source').value");
  await exec("document.querySelector('#editor-view-structured').click()");
  await until("document.querySelector('[data-study-kind=custom]')?.textContent.includes('用語解説')&&!document.querySelector('[data-study-kind=custom] [data-study-edit]').disabled");
  await exec("document.querySelector('[data-study-kind=custom] [data-study-links]').click()");
  await until("!!document.querySelector('#structured-study-target')&&!!document.querySelector('#structured-study-generate-id')");
  await exec("document.querySelector('#structured-study-generate-id').click()");
  const customStudyIdentity=await exec("document.querySelector('#structured-study-id').value");
  await exec("document.querySelector('#structured-study-link-apply').click()");
  await until("!document.querySelector('#study-link-editor')&&document.querySelector('#source').value.includes("+JSON.stringify('#'+customStudyIdentity)+")");
  if(!await exec("document.querySelector('#source').value.includes("+JSON.stringify('name="'+customId+'"')+")"))throw Error('Custom component definition identity changed');
  await exec("document.querySelector('#structured-undo').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(customBefore));

  await exec("document.querySelector('[data-study-kind=custom] [data-study-edit]').click()");
  await setStudyValue('content','登録部品の内容を変更しました。');
  await until("!document.querySelector('#structured-study-apply').disabled");
  await exec("document.querySelector('#structured-study-apply').click()");
  await until("!document.querySelector('#structured-study-apply')&&document.querySelector('#source').value.includes('登録部品の内容を変更しました。')");
  const customAfter=await exec("document.querySelector('#source').value");
  if(customBefore===customAfter||!customAfter.includes('name="'+customId+'"')||!customAfter.includes('登録部品の内容を変更しました。'))throw Error('Custom component content edit failed');
  await exec("document.querySelector('#editor-view-source').click()");
  await setStructuredSource(customBefore);
  await until("document.querySelector('#source').value==="+JSON.stringify(customBefore));

  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"Array.from(document.querySelector('#preview > div')?.shadowRoot?.querySelectorAll('[data-fixed-label]')??[]).some(e=>e.textContent==='用語解説')"+")");
  await exec("document.querySelector('#save').click()");
  await until("document.querySelector('#save').disabled && !document.querySelector('#open').disabled");
  await exec("document.querySelector('#study-design-lab').click()");
  await until("Array.from(document.querySelector('#lab-library-select')?.options??[]).some(e=>e.textContent==='用語解説')");
  await exec("(()=>{const e=document.querySelector('#lab-library-select');e.value="+JSON.stringify(customId)+";e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await exec("(()=>{const e=document.querySelector('#lab-library-name');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'用語集');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await exec("document.querySelector('#lab-library-rename').click()");
  await until("Array.from(document.querySelector('#lab-library-select').options).some(e=>e.textContent==='用語集') && !document.querySelector('#open').disabled");
  await exec("document.querySelector('#lab-cancel').click()");
  await until("!document.querySelector('#lab-measure')");
  await exec("document.querySelector('#preview-book').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"Array.from(document.querySelector('#preview > div')?.shadowRoot?.querySelectorAll('[data-fixed-label]')??[]).some(e=>e.textContent==='用語集')"+")");
  // Add a number field to the warning design without changing its manuscript.
  await exec("(()=>{const e=document.querySelector('#study-design-kind');e.value='warning';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await exec("document.querySelector('#study-design-lab').click()");
  await until("!!document.querySelector('#lab-study-title')");
  await exec("document.querySelector('[data-lab-node=study-label]').click()");
  await until("!!document.querySelector('#lab-dynamic-field')");
  await exec("(()=>{const e=document.querySelector('#lab-dynamic-field');e.value='study-number';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await exec("document.querySelector('#lab-measure').click()");
  await until("!document.querySelector('#lab-apply').disabled");
  if(!await exec("Array.from(document.querySelector('#lab-preview > div').shadowRoot.querySelectorAll('[data-fixed-label]')).some(e=>e.dataset.componentNode==='study-label'&&e.textContent==='3.2')"))throw Error('Study numbering sample did not resolve');
  await exec("document.querySelector('#lab-apply').click()");
  await until("!document.querySelector('#lab-measure') && !document.querySelector('#open').disabled");
  await exec("(()=>{const e=document.querySelector('#study-kind');e.value='warning';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await exec("document.querySelector('#study-append').click()");
  await until("document.querySelector('#source').value.split(':::callout{kind=\\\"warning\\\"}').length===3");
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"(()=>{const nodes=Array.from(document.querySelector('#preview > div')?.shadowRoot?.querySelectorAll('[data-fixed-label]')??[]).filter(e=>e.dataset.componentNode==='study-label').map(e=>e.textContent);return nodes.some(t=>/^\\d+\\.1$/.test(t))&&nodes.some(t=>/^\\d+\\.2$/.test(t));})()"+")");
  const readNumbers="Array.from(document.querySelector('#preview > div').shadowRoot.querySelectorAll('[data-fixed-label]')).filter(e=>e.dataset.componentNode==='study-label'&&/^\\d+\\.\\d+$/.test(e.textContent)).map(e=>e.textContent)";
  const partialNumbers=await exec(readNumbers);
  await exec("document.querySelector('#preview-book').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-fixed-label]')"+")");
  if(JSON.stringify(await exec(readNumbers))!==JSON.stringify(partialNumbers))throw Error('Study number differs between selected manuscript and book');
  // Insert an identified question and linked explanation through the source editor.
  await exec("(()=>{const e=document.querySelector('#study-kind');e.value='exercise';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until("!!document.querySelector('#study-instance-id')");
  await exec("document.querySelector('#study-generate-id').click()");
  const questionId=await exec("document.querySelector('#study-instance-id').value");
  if(!/^q-[a-f0-9-]+$/.test(questionId))throw Error('Question instance ID was not generated');
  await exec("document.querySelector('#study-append').click()");
  await until("document.querySelector('#source').value.includes("+JSON.stringify('#'+questionId)+")");
  await exec("(()=>{const e=document.querySelector('#study-kind');e.value='explanation';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until("!!document.querySelector('#study-answer-to')");
  await exec("(()=>{const e=document.querySelector('#study-answer-to');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+JSON.stringify(questionId)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await exec("document.querySelector('#study-append').click()");
  await until("document.querySelector('#source').value.includes("+JSON.stringify('answer-to="'+questionId+'"')+")");
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"Array.from(document.querySelector('#preview > div')?.shadowRoot?.querySelectorAll('[data-fixed-label]')??[]).some(e=>/^解説 \\d+\\.1$/.test(e.textContent))"+")");
  const answerLabel=await exec("Array.from(document.querySelector('#preview > div').shadowRoot.querySelectorAll('[data-fixed-label]')).find(e=>/^解説 \\d+\\.1$/.test(e.textContent)).textContent");
  await exec("document.querySelector('#preview-book').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"Array.from(document.querySelector('#preview > div')?.shadowRoot?.querySelectorAll('[data-fixed-label]')??[]).some(e=>e.textContent==="+JSON.stringify(answerLabel)+")"+")");
  // Create a new custom multi-slot component and insert it without modifying old instances.
  await exec("(()=>{const e=document.querySelector('#study-design-kind');e.value='custom';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await exec("document.querySelector('#study-design-lab').click()");
  await until("!!document.querySelector('#lab-add-slot')");
  await exec("document.querySelector('#lab-add-slot').click()");
  await until("!!document.querySelector('#lab-slot-name')");
  await exec("(()=>{const e=document.querySelector('#lab-slot-name');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'hint');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await until("!!document.querySelector('[data-lab-slot-sample=hint]')");
  await exec("(()=>{const e=document.querySelector('[data-lab-slot-sample=hint]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'ヒントのサンプル。');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await exec("(()=>{const e=document.querySelector('#lab-library-name');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'複数領域問題');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await exec("document.querySelector('#lab-measure').click()");
  await until("!document.querySelector('#lab-library-add').disabled");
  if(!await exec("document.querySelector('#lab-preview > div').shadowRoot.querySelector('[data-named-slot=hint]').textContent==='ヒントのサンプル。'"))throw Error('Independent slot sample did not render');
  const plainStudySample=await exec("document.querySelector('#lab-sample').value");
  await setLabSample('#lab-sample','**問題** $x^2$ です。');
  await setLabSample('[data-lab-slot-sample=hint]','ヒント $\\sqrt{x}$ です。');
  await exec("document.querySelector('#lab-sample-bcm').click()");
  await until("document.querySelector('#lab-library-add').disabled && document.querySelector('#lab-preview').dataset.previewConfirmed==='false'");
  await exec("document.querySelector('#lab-measure').click()");
  await until("!!document.querySelector('#lab-preview > div')?.shadowRoot?.querySelector('[data-content-slot] [data-inline-math] math msup') && !!document.querySelector('#lab-preview > div')?.shadowRoot?.querySelector('[data-named-slot=hint] [data-inline-math] math msqrt')");
  await setLabSample('[data-lab-slot-sample=hint]','ヒント $x');
  await until("document.querySelector('#lab-library-add').disabled && document.querySelector('#lab-preview').dataset.previewPhase==='error' && document.querySelector('#lab-status').textContent.includes('Invalid inline math')");
  // Numbered sample wrappers share a disposable chapter, including cross-slot references.
  await exec("document.querySelector('#lab-multiline-sample').click()");
  await setLabSample('#lab-sample','問題。\n\n:::layout{#eq-lab-main numbered="true"}\n$$\nx\n$$\n:::');
  await setLabSample('[data-lab-slot-sample=hint]','参照 :ref{target="eq-lab-main" format="label-number"}。\n\n:::layout{#eq-lab-hint numbered="true"}\n$$\ny\n$$\n:::');
  await exec("document.querySelector('#lab-measure').click()");
  await until("(()=>{const root=document.querySelector('#lab-preview > div')?.shadowRoot;const a=root?.querySelector('[data-content-slot] [data-equation-number]'),b=root?.querySelector('[data-named-slot=hint] [data-equation-number]');return !!a&&!!b&&a.textContent.includes('1.1')&&b.textContent.includes('1.2')&&root.textContent.includes('式 (1.1)');})()");
  await until("!document.querySelector('#lab-library-add').disabled");
  await setLabSample('[data-lab-slot-sample=hint]','参照 :ref{target="missing" format="number"}。');
  await until("document.querySelector('#lab-library-add').disabled&&document.querySelector('#lab-preview').dataset.previewPhase==='error'&&document.querySelector('#lab-status').textContent.includes('Invalid numbered study sample')");
  await exec("document.querySelector('#lab-multiline-sample').click()");
  await exec("document.querySelector('#lab-sample-bcm').click()");
  await setLabSample('#lab-sample',plainStudySample);
  await setLabSample('[data-lab-slot-sample=hint]','ヒントのサンプル。');
  await until("!document.querySelector('#lab-library-add').disabled");
  if(!await exec("document.querySelector('#lab-duplicate').disabled"))throw Error('Duplicate semantic slot allowed');
  await exec("document.querySelector('#lab-library-add').click()");
  await until("Array.from(document.querySelector('#lab-library-select').options).some(e=>e.textContent==='複数領域問題') && !document.querySelector('#open').disabled");
  const multiId=await exec("Array.from(document.querySelector('#lab-library-select').options).find(e=>e.textContent==='複数領域問題').value");
  await exec("document.querySelector('#lab-cancel').click()");
  await until("!document.querySelector('#lab-measure')");
  await exec("(()=>{const e=document.querySelector('#study-kind');e.value="+JSON.stringify(multiId)+";e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await exec("document.querySelector('#study-append').click()");
  await until("document.querySelector('#source').value.includes(':::slot{name=\\\"hint\\\"}')");
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-named-slot=hint]')"+")");
  await exec("document.querySelector('#preview > div').shadowRoot.querySelector('[data-named-slot=hint]').click()");
  if(!await exec("(()=>{const e=document.querySelector('#source');return e.value.slice(e.selectionStart,e.selectionEnd)==='追加の原稿を入力してください。';})()"))throw Error('Named slot source selection is not independent');
  await exec("document.querySelector('#save').click()");
  await until("document.querySelector('#save').disabled && !document.querySelector('#open').disabled");
  // Optional slots and their conditional groups disappear only in instances that omit them.
  await exec("document.querySelector('#study-design-lab').click()");
  await until("!!document.querySelector('#lab-add-slot')");
  await exec("document.querySelector('#lab-add-slot').click()");
  await until("!!document.querySelector('#lab-slot-name')");
  await exec("(()=>{const e=document.querySelector('#lab-slot-name');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'extra');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await exec("document.querySelector('#lab-slot-optional').click()");
  await until("!!document.querySelector('[data-lab-slot-omit=extra]')");
  await exec("document.querySelector('#lab-group').click()");
  await until("!!document.querySelector('#lab-group-optional')");
  await exec("document.querySelector('#lab-group-optional').click()");
  await exec("(()=>{const e=document.querySelector('#lab-library-name');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'任意領域問題');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await exec("document.querySelector('#lab-measure').click()");
  await until("!document.querySelector('#lab-library-add').disabled");
  const presentHeight=await exec("parseFloat(document.querySelector('#lab-preview > div').shadowRoot.querySelector('[data-block]').style.height)");
  await exec("document.querySelector('[data-lab-slot-omit=extra]').click()");
  await exec("document.querySelector('#lab-measure').click()");
  await until("!document.querySelector('#lab-library-add').disabled");
  if(!await exec("(()=>{const root=document.querySelector('#lab-preview > div').shadowRoot;return !root.querySelector('[data-named-slot=extra]')&&!root.querySelector('[data-component-group]')&&parseFloat(root.querySelector('[data-block]').style.height)<"+presentHeight+";})()"))throw Error('Omitted group still consumes space');
  await exec("document.querySelector('#lab-library-add').click()");
  await until("Array.from(document.querySelector('#lab-library-select').options).some(e=>e.textContent==='任意領域問題') && !document.querySelector('#open').disabled");
  const optionalId=await exec("Array.from(document.querySelector('#lab-library-select').options).find(e=>e.textContent==='任意領域問題').value");
  await exec("document.querySelector('#lab-cancel').click()");
  await until("!document.querySelector('#lab-measure')");
  await exec("(()=>{const e=document.querySelector('#study-kind');e.value="+JSON.stringify(optionalId)+";e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  const beforeOptional=await exec("document.querySelector('#source').value.length");
  const beforeStructuredInsert=await exec("document.querySelector('#source').value");
  await exec("document.querySelector('#editor-view-structured').click()");
  const openStructuredInsert=()=>exec("(()=>{const e=document.querySelector('#structured-insert-toggle');if(e.getAttribute('aria-expanded')==='false')e.click();})()");
  await openStructuredInsert();
  await until("!document.querySelector('#structured-insert-panel').hidden&&!!document.querySelector('#structured-insert-kind optgroup[label=登録教材部品]')&&[...document.querySelector('#structured-insert-kind').options].some(o=>o.value==="+JSON.stringify(optionalId)+")");
  await exec("(()=>{const e=document.querySelector('#structured-insert-kind');e.value="+JSON.stringify(multiId)+";e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until("document.querySelector('#structured-insertion-fields')?.textContent.includes('hint')");
  await exec("(()=>{const e=document.querySelector('.structured-block .structured-block-menu');if(!e.open)e.querySelector('summary').click();e.querySelector('[data-block-insert]').click();})()");
  await until("document.querySelector('#structured-insert-position').value==='0'&&document.querySelector('#source').value==="+JSON.stringify(beforeStructuredInsert));
  await exec("document.querySelector('#structured-append').click()");
  await until("document.querySelector('#source').value.trimStart().startsWith("+JSON.stringify('::::component{name="'+multiId+'"')+")&&!!document.querySelector('.structured-block:first-child [data-study-field=hint]')");
  await exec("document.querySelector('#structured-undo').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(beforeStructuredInsert));
  await exec("(()=>{const e=document.querySelector('#structured-insert-kind');e.value="+JSON.stringify(optionalId)+";e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await openStructuredInsert();
  await until("!document.querySelector('#structured-insert-panel').hidden&&!!document.querySelector('#structured-optional-slots')&&!document.querySelector('#structured-optional-slots').checked&&!document.querySelector('#structured-insertion-fields').textContent.includes('extra')");
  await exec("document.querySelector('#structured-append').click()");
  await until("document.querySelector('#source').value.slice("+beforeOptional+").includes("+JSON.stringify(optionalId)+")");
  if(await exec("document.querySelector('#source').value.slice("+beforeOptional+").includes('name=\"extra\"')"))throw Error('Structured insert included optional slot by default');
  await openStructuredInsert();
  await until("!document.querySelector('#structured-insert-panel').hidden&&!!document.querySelector('#structured-optional-slots')");
  await exec("document.querySelector('#structured-optional-slots').click()");
  await until("document.querySelector('#structured-insertion-fields').textContent.includes('extra')");
  await exec("document.querySelector('#structured-append').click()");
  await until("document.querySelector('#source').value.slice("+beforeOptional+").includes(':::slot{name=\"extra\"}')&&!!document.querySelector('[data-study-field=extra]')");
  await exec("document.querySelector('#editor-view-source').click()");
  await until("!document.querySelector('#source').hidden");
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"document.querySelector('#preview > div')?.shadowRoot?.querySelectorAll('[data-named-slot=extra]').length===1"+")");
  // Restore original draft and retain the legacy source insertion regression below.
  await setStructuredSource(beforeStructuredInsert);
  await until("document.querySelector('#source').value==="+JSON.stringify(beforeStructuredInsert));
  await exec("document.querySelector('#study-append').click()");
  await until("document.querySelector('#source').value.slice("+beforeOptional+").includes("+JSON.stringify(optionalId)+")");
  if(await exec("document.querySelector('#source').value.slice("+beforeOptional+").includes('name=\\\"extra\\\"')"))throw Error('Optional slot included by default');
  await exec("document.querySelector('#study-include-optional').click()");
  await exec("document.querySelector('#study-append').click()");
  await until("document.querySelector('#source').value.includes(':::slot{name=\\\"extra\\\"}')");
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"document.querySelector('#preview > div')?.shadowRoot?.querySelectorAll('[data-named-slot=extra]').length===1"+")");
  await exec("document.querySelector('#save').click()");
  await until("document.querySelector('#save').disabled && !document.querySelector('#open').disabled");
  // Verify multiline named-slot samples, persisted style and exact source selection.
  await exec("document.querySelector('#study-design-lab').click()");
  await until("!!document.querySelector('#lab-multiline-sample')");
  await exec("document.querySelector('#lab-add-slot').click()");
  await until("!!document.querySelector('#lab-slot-paragraph-gap')");
  await exec("document.querySelector('#lab-multiline-sample').click()");
  const sampleMulti='第一段落。\n\n第二段落。';
  await exec("(()=>{const e=document.querySelector('[data-lab-slot-sample=slot-1]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,"+JSON.stringify(sampleMulti)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await exec("(()=>{const e=document.querySelector('#lab-slot-paragraph-gap');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'2');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await exec("document.querySelector('#lab-measure').click()");
  await until("Array.from(document.querySelector('#lab-preview > div')?.shadowRoot?.querySelectorAll('[data-named-slot=slot-1]')??[]).some(e=>e.textContent==="+JSON.stringify(sampleMulti)+")");
  await exec("document.querySelector('#lab-cancel').click()");
  await until("!document.querySelector('#lab-measure')");
  await exec("(()=>{const e=document.querySelector('#source'),s=e.value,last=s.lastIndexOf('追加の原稿を入力してください。');if(last<0)throw Error('missing placeholder');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,s.slice(0,last)+"+JSON.stringify(sampleMulti)+"+s.slice(last+'追加の原稿を入力してください。'.length));e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-named-slot=extra]')?.textContent==="+JSON.stringify(sampleMulti)+")");
  await exec("document.querySelector('#preview > div').shadowRoot.querySelector('[data-named-slot=extra]').click()");
  if(!await exec("(()=>{const e=document.querySelector('#source');return e.value.slice(e.selectionStart,e.selectionEnd)==="+JSON.stringify(sampleMulti)+";})()"))throw Error('Multiline named slot selection lost source');
  // The earlier imported static regular face cannot supply a genuine 700 weight.
  // Use the bundled variable face for the existing bold/italic regression.
  await exec("(()=>{const e=document.querySelector('#body-font');e.value='BCFont_NotoSansJP';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until("document.querySelector('#body-font').value==='BCFont_NotoSansJP' && (document.querySelector('#workspace-layout-state').dataset.phase==='stale'&&document.querySelector('#preview > div')?.dataset.paperFreshness!=='current')");
  // Replace the final named slot body with styled logical text and select its exact raw envelope.
  const richRaw='**第一段落**。\n\n*第二段落*。',richLogical='第一段落。\n\n第二段落。';
  await exec("(()=>{const e=document.querySelector('#source'),s=e.value,last=s.lastIndexOf("+JSON.stringify(sampleMulti)+");if(last<0)throw Error('missing multiline body');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,s.slice(0,last)+"+JSON.stringify(richRaw)+"+s.slice(last+"+sampleMulti.length+"));e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-named-slot=extra]')?.textContent==="+JSON.stringify(richLogical)+")");
  if(!await exec("(()=>{const s=document.querySelector('#preview > div').shadowRoot.querySelector('[data-named-slot=extra]');return Array.from(s.querySelectorAll('[data-inline-style]')).some(e=>e.style.fontWeight==='700'&&e.textContent==='第一段落')&&Array.from(s.querySelectorAll('[data-inline-style]')).some(e=>e.style.fontStyle==='italic'&&e.textContent==='第二段落');})()"))throw Error('Inline styles were not rendered');
  await exec("document.querySelector('#preview > div').shadowRoot.querySelector('[data-named-slot=extra]').click()");
  if(!await exec("(()=>{const e=document.querySelector('#source');return e.value.slice(e.selectionStart,e.selectionEnd)==="+JSON.stringify(richRaw)+";})()"))throw Error('Styled slot raw selection lost delimiters');
  // Named slot math: insert into an existing styled body with an active paragraph frame,
  // select the atom from paper and edit only that formula. Restore the fixture for later tests.
  const beforeSlotMath=await exec("document.querySelector('#source').value");
  const slotMathAt=beforeSlotMath.lastIndexOf('*第二段落*。')+'*第二段落*。'.length;
  await exec("(()=>{const e=document.querySelector('#source');e.focus();e.setSelectionRange("+slotMathAt+","+slotMathAt+");document.querySelector('#source-inline-math').click();})()");
  await until("document.querySelector('#math-formula')?.value==='x^2'");
  await exec("document.querySelector('#math-apply').click()");
  const insertedSlotMath=beforeSlotMath.slice(0,slotMathAt)+'$x^2$'+beforeSlotMath.slice(slotMathAt);
  await until("document.querySelector('#source').value==="+JSON.stringify(insertedSlotMath));
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-named-slot=extra] [data-inline-math] math msup')"+")");
  await exec("document.querySelector('#preview > div').shadowRoot.querySelector('[data-named-slot=extra] [data-inline-math]').click()");
  if(!await exec("(()=>{const e=document.querySelector('#source');return e.value.slice(e.selectionStart,e.selectionEnd)==='$x^2$';})()"))throw Error('Named slot math selected incorrect source');
  await exec("document.querySelector('#source-inline-math').click()");
  await until("document.querySelector('#math-formula')?.value==='x^2'");
  await setInlineDraft('\\frac{a}{b}');
  await until("!!document.querySelector('#math-draft-preview math mfrac')");
  await exec("document.querySelector('#math-apply').click()");
  const changedSlotMath=beforeSlotMath.slice(0,slotMathAt)+'$\\frac{a}{b}$'+beforeSlotMath.slice(slotMathAt);
  await until("document.querySelector('#source').value==="+JSON.stringify(changedSlotMath));
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-named-slot=extra] [data-inline-math] math mfrac')"+")");
  // Insert an independent equation at the internal blank of the named slot.
  const displayAt=beforeSlotMath.lastIndexOf('\n\n*第二段落*。')+1;
  if(displayAt<=0)throw Error('Missing named slot blank line');
  await setInlineMathSource(beforeSlotMath);
  await until("document.querySelector('#source').value==="+JSON.stringify(beforeSlotMath));
  await exec("(()=>{const e=document.querySelector('#source');e.focus();e.setSelectionRange("+displayAt+","+displayAt+");document.querySelector('#source-math').click();})()");
  await until("document.querySelector('#math-formula')?.value==='x^2' && document.querySelector('#math-numbered')?.checked===false");
  await exec("document.querySelector('#math-apply').click()");
  const insertedDisplay=beforeSlotMath.slice(0,displayAt)+'\n$$\nx^2\n$$\n'+beforeSlotMath.slice(displayAt);
  await until("document.querySelector('#source').value==="+JSON.stringify(insertedDisplay));
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-named-slot=extra] [data-slot-display-math] math[display=block] msup')"+")");
  await exec("document.querySelector('#preview > div').shadowRoot.querySelector('[data-named-slot=extra] [data-slot-display-math]').click()");
  if(!await exec("(()=>{const e=document.querySelector('#source');return e.value.slice(e.selectionStart,e.selectionEnd)==="+JSON.stringify('$$\nx^2\n$$')+";})()"))throw Error('Component display formula selection mismatch');
  await exec("document.querySelector('#source-math').click()");
  await until("document.querySelector('#math-formula')?.value==='x^2'");
  await setInlineDraft('\\frac{a}{b}');
  await until("!!document.querySelector('#math-draft-preview math mfrac')");
  await exec("document.querySelector('#math-apply').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(insertedDisplay.replace('$$\nx^2\n$$',()=> '$$\n\\frac{a}{b}\n$$')));
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-named-slot=extra] [data-slot-display-math] math mfrac')"+")");
  await setInlineMathSource(beforeSlotMath);
  await until("document.querySelector('#source').value==="+JSON.stringify(beforeSlotMath)+" && (document.querySelector('#workspace-layout-state').dataset.phase==='stale'&&document.querySelector('#preview > div')?.dataset.paperFreshness!=='current')");
  // A numbered formula can be inserted in the named slot in a single operation.
  await exec("(()=>{const e=document.querySelector('#source');e.focus();e.setSelectionRange("+displayAt+","+displayAt+");document.querySelector('#source-math').click();})()");
  await until("document.querySelector('#math-numbered')?.checked===false");
  await exec("document.querySelector('#math-numbered').click()");
  await until("document.querySelector('#math-numbered')?.checked===true&&!!document.querySelector('#math-equation-id')");
  await exec("document.querySelector('#math-cancel').click()");
  if(await exec("document.querySelector('#source').value")!==beforeSlotMath)throw Error('Cancel numbered component insertion changed source');
  await exec("document.querySelector('#source-math').click()");
  await until("document.querySelector('#math-numbered')?.checked===false");
  await exec("document.querySelector('#math-numbered').click()");
  await until("document.querySelector('#math-numbered')?.checked===true&&!!document.querySelector('#math-equation-id')");
  const insertedSlotEqId=(await exec("document.querySelector('#math-equation-id').textContent")).match(/eq-[a-f0-9-]+/)?.[0];
  if(!insertedSlotEqId)throw Error('Missing new component equation ID');
  await exec("document.querySelector('#math-apply').click()");
  await until("document.querySelector('#source').value.includes("+JSON.stringify('#'+insertedSlotEqId+' numbered="true"')+")&&!document.querySelector('#math-formula')");
  await until("(()=>{const e=document.querySelector('#source');return e.value.slice(e.selectionStart,e.selectionEnd)==='x^2';})()");
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-named-slot=extra] [data-slot-display-math] [data-equation-number]')"+")");
  await setInlineMathSource(beforeSlotMath);
  await until("document.querySelector('#source').value==="+JSON.stringify(beforeSlotMath)+" && (document.querySelector('#workspace-layout-state').dataset.phase==='stale'&&document.querySelector('#preview > div')?.dataset.paperFreshness!=='current')");
  // Numbered component equation: paper selection includes the wrapper; editing changes only TeX.
  const nestedNumbered='::::callout{kind="note"}\n:::layout{#eq-gui-nested numbered="true"}\n$$\nx^2\n$$\n:::\n::::\n';
  const nestedNumberedSource=beforeSlotMath+'\n\n'+nestedNumbered;
  await setInlineMathSource(nestedNumberedSource);
  await until("document.querySelector('#source').value==="+JSON.stringify(nestedNumberedSource));
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-slot-display-math] [data-equation-number]')"+")");
  await exec("document.querySelector('#preview > div').shadowRoot.querySelector('[data-slot-display-math] [data-equation-number]').click()");
  await exec("document.querySelector('#source-math').click()");
  await until("document.querySelector('#math-formula')?.value==='x^2'&&document.querySelector('#math-equation-id')?.textContent.includes('eq-gui-nested')");
  await setInlineDraft('z^2');
  await exec("document.querySelector('#math-apply').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(beforeSlotMath+'\n\n'+nestedNumbered.replace('x^2','z^2')));
  // Numbering toolbar: enable on a plain three-colon callout, disable, and re-enable the same ID.
  const bareNested=':::callout{kind="note"}\n$$\nz^2\n$$\n:::\n';
  const bareNestedSource=beforeSlotMath+'\n\n'+bareNested;
  await setInlineMathSource(bareNestedSource);
  await until("document.querySelector('#source').value==="+JSON.stringify(bareNestedSource));
  await exec("(()=>{const e=document.querySelector('#source'),p=e.value.lastIndexOf('z^2');e.focus();e.setSelectionRange(p,p+3);document.querySelector('#source-equation-numbering').click();})()");
  await until("document.querySelector('#source').value.includes("+JSON.stringify('::::callout{kind="note"}\n:::layout{#eq-')+")");
  const enabledNestedSource=await exec("document.querySelector('#source').value");
  const nestedId=enabledNestedSource.match(/:::layout\{#(eq-[a-f0-9-]+) numbered="true"\}/)?.[1];
  if(!nestedId||enabledNestedSource!==beforeSlotMath+'\n\n::::callout{kind="note"}\n:::layout{#'+nestedId+' numbered="true"}\n$$\nz^2\n$$\n:::\n::::\n')throw Error('Component numbering changed unrelated text');
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-slot-display-math] [data-equation-number]')"+")");
  await exec("document.querySelector('#preview > div').shadowRoot.querySelector('[data-slot-display-math] [data-equation-number]').click()");
  await exec("document.querySelector('#source-equation-numbering').click()");
  const disabledNestedSource=enabledNestedSource.replace('#'+nestedId+' numbered="true"','#'+nestedId+' numbered="false"');
  await until("document.querySelector('#source').value==="+JSON.stringify(disabledNestedSource));
  await exec("(()=>{const e=document.querySelector('#source'),p=e.value.lastIndexOf('z^2');e.focus();e.setSelectionRange(p,p+3);document.querySelector('#source-equation-numbering').click();})()");
  await until("document.querySelector('#source').value==="+JSON.stringify(enabledNestedSource));
  // The existing reference picker also works in component text.
  const refCallout=':::callout{kind="note"}\n参照先。\n:::\n',nestedRefSource=enabledNestedSource+'\n'+refCallout;
  await setInlineMathSource(nestedRefSource);
  await until("document.querySelector('#source').value==="+JSON.stringify(nestedRefSource));
  await exec("(()=>{const e=document.querySelector('#source'),p=e.value.lastIndexOf('参照先。')+3;e.focus();e.setSelectionRange(p,p);document.querySelector('#source-equation-reference').click();})()");
  await until("!!document.querySelector('#equation-reference-editor')");
  await exec("(()=>{const e=document.querySelector('#equation-reference-target');e.value="+JSON.stringify(nestedId)+";e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until("document.querySelector('#equation-reference-target')?.value==="+JSON.stringify(nestedId));
  await exec("document.querySelector('#equation-reference-apply').click()");
  const nestedRefToken=':ref{target="'+nestedId+'" format="label-number"}';
  await until("document.querySelector('#source').value==="+JSON.stringify(nestedRefSource.replace('参照先。',()=> '参照先'+nestedRefToken+'。')));
  await exec("document.querySelector('#preview-book').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"(()=>{const root=document.querySelector('#preview > div')?.shadowRoot,n=root?.querySelector('[data-slot-display-math] [data-equation-number]');return !!n&&root.textContent.includes('参照先式 '+n.textContent);})()"+")");
  // Inline math and plain-text styling may coexist with a resolved reference.
  const refBeforeInline=await exec("document.querySelector('#source').value");
  await exec("(()=>{const e=document.querySelector('#source'),p=e.value.lastIndexOf('参照先')+3;e.focus();e.setSelectionRange(p,p);document.querySelector('#source-inline-math').click();})()");
  await until("document.querySelector('#math-formula')?.value==='x^2'");
  await exec("document.querySelector('#math-apply').click()");
  const refWithInline=refBeforeInline.replace('参照先'+nestedRefToken,()=> '参照先$x^2$'+nestedRefToken);
  await until("document.querySelector('#source').value==="+JSON.stringify(refWithInline));
  await exec("(()=>{const e=document.querySelector('#source'),p=e.value.lastIndexOf('参照先');e.focus();e.setSelectionRange(p,p+3);})()");
  await until("!document.querySelector('#source-bold').disabled");
  await exec("document.querySelector('#source-bold').click()");
  const refWithStyle=refWithInline.replace('参照先$x^2$',()=> '**参照先**$x^2$');
  await until("document.querySelector('#source').value==="+JSON.stringify(refWithStyle));
  await exec("document.querySelector('#preview-book').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"(()=>{const root=document.querySelector('#preview > div')?.shadowRoot,n=root?.querySelector('[data-slot-display-math] [data-equation-number]');return !!n&&root.textContent.includes('式 '+n.textContent)&&Array.from(root.querySelectorAll('[data-inline-style]')).some(e=>e.textContent==='参照先'&&e.style.fontWeight==='700');})()"+")");



  await setInlineMathSource(beforeSlotMath);
  await until("document.querySelector('#source').value==="+JSON.stringify(beforeSlotMath)+" && (document.querySelector('#workspace-layout-state').dataset.phase==='stale'&&document.querySelector('#preview > div')?.dataset.paperFreshness!=='current')");
  // Apply/remove/replace formatting using the actual toolbar and textarea selection.
  const beforeFormat=await exec("document.querySelector('#source').value");
  await exec("(()=>{const e=document.querySelector('#source'),p=e.value.lastIndexOf('第一段落');e.focus();e.setSelectionRange(p,p+'第一段落'.length);})()");
  await until("!document.querySelector('#source-bold').disabled");
  await exec("document.querySelector('#source-bold').click()");
  await until("document.querySelector('#source').value.includes('第一段落。')&&!document.querySelector('#source').value.includes('**第一段落**')");
  if(!await exec("document.querySelector('#workspace-layout-state').dataset.phase==='stale'&&document.querySelector('#preview > div')?.dataset.paperFreshness==='previous'&&document.querySelector('#preview > div').inert"))throw Error('Formatting did not invalidate preview');
  await until("(()=>{const e=document.querySelector('#source');return e.value.slice(e.selectionStart,e.selectionEnd)==='第一段落';})()");
  await exec("document.querySelector('#source').dispatchEvent(new KeyboardEvent('keydown',{key:'i',ctrlKey:true,bubbles:true,cancelable:true}))");
  await until("document.querySelector('#source').value.includes('*第一段落*')");
  await until("(()=>{const e=document.querySelector('#source');return e.value.slice(e.selectionStart,e.selectionEnd)==='第一段落';})()");
  await exec("document.querySelector('#source-bold').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(beforeFormat));
  await until("(()=>{const e=document.querySelector('#source');return e.value.slice(e.selectionStart,e.selectionEnd)==='第一段落';})()");
  await exec("(()=>{const e=document.querySelector('#source'),p=e.value.indexOf('answer-to');e.focus();e.setSelectionRange(p,p+9);})()");
  await until("!document.querySelector('#source-bold').disabled");
  await exec("document.querySelector('#source-bold').click()");
  if(!await exec("document.querySelector('#source').value==="+JSON.stringify(beforeFormat)))throw Error('Formatting changed a protected directive header');
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-named-slot=extra] [data-inline-style]')?.style.fontWeight==='700'"+")");
  // Combine additional typed styles through actual toolbar controls.
  await exec("(()=>{const e=document.querySelector('#source'),p=e.value.lastIndexOf('第一段落');e.focus();e.setSelectionRange(p,p+'第一段落'.length);})()");
  await until("!document.querySelector('#source-underline').disabled");
  await exec("document.querySelector('#source-underline').click()");
  await until("document.querySelector('#source').value.includes(':style{text=\\\"第一段落\\\" weight=\\\"700\\\" underline=\\\"true\\\"}')");
  await until("(()=>{const e=document.querySelector('#source');return e.value.slice(e.selectionStart,e.selectionEnd)==='第一段落';})()");
  await exec("document.querySelector('#source-italic').click()");
  await until("document.querySelector('#source').value.includes('weight=\\\"700\\\" italic=\\\"true\\\" underline=\\\"true\\\"')");
  await until("(()=>{const e=document.querySelector('#source');return e.value.slice(e.selectionStart,e.selectionEnd)==='第一段落';})()");
  await exec("document.querySelector('#source-apply-color').click()");
  await until("document.querySelector('#source').value.includes('color=\\\"#c2410c\\\"')");
  await until("(()=>{const e=document.querySelector('#source');return e.value.slice(e.selectionStart,e.selectionEnd)==='第一段落';})()");
  await exec("document.querySelector('#source-apply-font').click()");
  await until("document.querySelector('#source').value.includes('font=\\\"system-monospace\\\"')");
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"(()=>{const s=document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-named-slot=extra] [data-inline-style]');return s?.textContent==='第一段落'&&s.style.fontFamily==='monospace'&&s.style.fontWeight==='400'&&s.style.fontStyle==='italic'&&s.style.textDecorationLine==='underline'&&s.style.color==='rgb(194, 65, 12)';})()"+")");
  await exec("document.querySelector('#preview > div').shadowRoot.querySelector('[data-named-slot=extra]').click()");
  if(!await exec("(()=>{const e=document.querySelector('#source'),s=e.value.slice(e.selectionStart,e.selectionEnd);return s.startsWith(':style{')&&s.includes('font=\\\"system-monospace\\\"')&&s.endsWith('*第二段落*。');})()"))throw Error('Composite inline raw source range mismatch');
  // Exercise size and script controls on a new plain line without disturbing the composite regression.
  const metricBase=await exec("document.querySelector('#source').value");
  const metricSource=metricBase.replace(/\\n*$/,'')+'\n\nx2 と H2O。大文字。\n';
  await exec("(()=>{const e=document.querySelector('#source');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,"+JSON.stringify(metricSource)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await until("document.querySelector('#source').value==="+JSON.stringify(metricSource));
  await exec("(()=>{const e=document.querySelector('#source'),p=e.value.lastIndexOf('x2')+1;e.focus();e.setSelectionRange(p,p+1);})()");
  await until("!document.querySelector('#source-super').disabled");
  await exec("document.querySelector('#source-super').click()");
  await until("document.querySelector('#source').value.includes('x^2^')");
  await exec("(()=>{const e=document.querySelector('#source'),p=e.value.lastIndexOf('H2O')+1;e.focus();e.setSelectionRange(p,p+1);})()");
  await until("!document.querySelector('#source-sub').disabled");
  await exec("document.querySelector('#source-sub').click()");
  await until("document.querySelector('#source').value.includes('H~2~O')");
  await exec("(()=>{const e=document.querySelector('#source'),p=e.value.lastIndexOf('大文字');e.focus();e.setSelectionRange(p,p+3);})()");
  await until("!document.querySelector('#source-apply-size').disabled");
  await exec("document.querySelector('#source-apply-size').click()");
  await until("document.querySelector('#source').value.includes('font-size=\\\"4.2mm\\\"')");
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"(()=>{const spans=[...document.querySelector('#preview > div')?.shadowRoot?.querySelectorAll('[data-inline-style]')??[]];return spans.some(s=>s.textContent==='2'&&s.style.verticalAlign==='super')&&spans.some(s=>s.textContent==='2'&&s.style.verticalAlign==='sub')&&spans.some(s=>s.textContent==='大文字'&&Math.abs(parseFloat(s.style.fontSize)-4.2*96/25.4)<.01);})()"+")");
  // Toggle an isolated styled line without losing text or changing existing list counters.
  const beforeList=await exec("document.querySelector('#source').value");
  await exec("(()=>{const e=document.querySelector('#source'),p=e.value.lastIndexOf('x^2^');e.focus();e.setSelectionRange(p,p+1);document.querySelector('#source-list-ordered').click();})()");
  await until("document.querySelector('#source').value.includes('1. x^2^')");
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-list-marker]')?.textContent==='1.'"+")");
  await exec("document.querySelector('#preview > div').shadowRoot.querySelector('[data-list-body]').click()");
  if(!await exec("(()=>{const e=document.querySelector('#source');return e.value.slice(e.selectionStart,e.selectionEnd).startsWith('x^2^');})()"))throw Error('List body selection includes marker');
  await exec("document.querySelector('#source-list-bullet').click()");
  await until("document.querySelector('#source').value.includes('- x^2^')");
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-list-marker]')?.textContent==='•'"+")");
  await exec("document.querySelector('#preview > div').shadowRoot.querySelector('[data-list-body]').click()");
  await exec("document.querySelector('#source-list-bullet').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(beforeList));
  // Raw manuscript lists must render derived markers and map back to marker-free text.
  const listBase=await exec("document.querySelector('#source').value");
  const listSource=listBase.replace(/\n*$/,'')+'\n\n3. **第一項**\n   - 子項目\n1. 第二項\n\n- 箇条書き\n';
  await exec("(()=>{const e=document.querySelector('#source');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,"+JSON.stringify(listSource)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await until("document.querySelector('#source').value==="+JSON.stringify(listSource));
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"(()=>{const root=document.querySelector('#preview > div')?.shadowRoot;return [...root?.querySelectorAll('[data-list-marker]')??[]].map(e=>e.textContent).join('|')==='3.|◦|4.|•';})()"+")");
  await exec("document.querySelector('#preview > div').shadowRoot.querySelector('[data-list-item=ordered]').click()");
  if(!await exec("(()=>{const e=document.querySelector('#source');return e.value.slice(e.selectionStart,e.selectionEnd)==='**第一項**';})()"))throw Error('List item did not select exact marker-free inline source');
  // Move the second root item under the preceding ordered item, then restore it.
  await exec("(()=>{const e=document.querySelector('#source'),p=e.value.lastIndexOf('第二項');e.focus();e.setSelectionRange(p,p+3);document.querySelector('#source-list-indent').click();})()");
  await until("document.querySelector('#source').value.includes('   1. 第二項')");
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"(()=>{const root=document.querySelector('#preview > div')?.shadowRoot;return [...root?.querySelectorAll('[data-list-item]')??[]].some(e=>e.dataset.listDepth==='1'&&e.querySelector('[data-list-body]')?.textContent==='第二項');})()"+")");
  await exec("(()=>{const e=document.querySelector('#source'),p=e.value.lastIndexOf('第二項');e.focus();e.setSelectionRange(p,p+3);document.querySelector('#source-list-outdent').click();})()");
  await until("document.querySelector('#source').value==="+JSON.stringify(listSource));
  // Batch conversion of an isolated whole run, including styled source.
  const batchText='**第一行**\n第二行\n第三行。',batchSource=listSource+'\n## リスト編集\n\n'+batchText+'\n';
  await exec("(()=>{const e=document.querySelector('#source');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,"+JSON.stringify(batchSource)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await until("document.querySelector('#source').value==="+JSON.stringify(batchSource));
  await exec("(()=>{const e=document.querySelector('#source'),p=e.value.lastIndexOf("+JSON.stringify(batchText)+");e.focus();e.setSelectionRange(p,p+"+batchText.length+");document.querySelector('#source-list-bullet').click();})()");
  const bulletBatch='- **第一行**\n- 第二行\n- 第三行。';
  await until("document.querySelector('#source').value.includes("+JSON.stringify(bulletBatch)+")");
  await until("(()=>{const e=document.querySelector('#source');return e.value.slice(e.selectionStart,e.selectionEnd)==="+JSON.stringify(bulletBatch)+";})()");
  await exec("document.querySelector('#source-list-ordered').click()");
  const orderedBatch='1. **第一行**\n2. 第二行\n3. 第三行。';
  await until("document.querySelector('#source').value.includes("+JSON.stringify(orderedBatch)+")");
  await until("(()=>{const e=document.querySelector('#source');return e.value.slice(e.selectionStart,e.selectionEnd)==="+JSON.stringify(orderedBatch)+";})()");
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"(()=>{const root=document.querySelector('#preview > div')?.shadowRoot;return [...root?.querySelectorAll('[data-list-marker]')??[]].slice(-3).map(e=>e.textContent).join('|')==='1.|2.|3.';})()"+")");
  await exec("document.querySelector('#source-list-ordered').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(batchSource));
  // Insert and re-edit an independent formula through the actual GUI.
  const mathBase=await exec("document.querySelector('#source').value");
  await exec("(()=>{const e=document.querySelector('#source');e.focus();e.setSelectionRange(e.value.length,e.value.length);document.querySelector('#source-math').click();})()");
  await until("!!document.querySelector('#math-editor')");
  await exec("Array.from(document.querySelectorAll('#math-editor button')).find(b=>b.textContent==='極限').click()");
  await until("!!document.querySelector('#math-draft-preview math munder') && !!document.querySelector('#math-draft-preview math mfrac')");
  await exec("Array.from(document.querySelectorAll('#math-editor button')).find(b=>b.textContent==='可変括弧').click()");
  await until("document.querySelectorAll('#math-draft-preview math mo[fence=true]').length===2");
  await exec("Array.from(document.querySelectorAll('#math-editor button')).find(b=>b.textContent==='ベクトル').click()");
  await until("document.querySelectorAll('#math-draft-preview math mover[accent=true]').length===2");
  await exec("Array.from(document.querySelectorAll('#math-editor button')).find(b=>b.textContent==='行列').click()");
  await until("document.querySelectorAll('#math-draft-preview math mtable mtr').length===2");
  await exec("Array.from(document.querySelectorAll('#math-editor button')).find(b=>b.textContent==='場合分け').click()");
  await until("document.querySelectorAll('#math-draft-preview math mtable mtr').length===2 && document.querySelectorAll('#math-draft-preview math mo[fence=true]').length===1");
  await exec("Array.from(document.querySelectorAll('#math-editor button')).find(b=>b.textContent==='途中式').click()");
  await until("document.querySelectorAll('#math-draft-preview math mtd[columnalign=right]').length===2");
  await exec("Array.from(document.querySelectorAll('#math-editor button')).find(b=>b.textContent==='分数').click()");
  await until("!!document.querySelector('#math-draft-preview math mfrac')");
  const mathFormula='\\frac{a}{b}';
  await exec("document.querySelector('#math-apply').click()");
  await until("(()=>{const e=document.querySelector('#source');return e.value.slice(e.selectionStart,e.selectionEnd)==="+JSON.stringify(mathFormula)+";})()");
  const insertedMath=await exec("document.querySelector('#source').value");
  if(!insertedMath.startsWith(mathBase)||!insertedMath.includes('$$\n'+mathFormula+'\n$$'))throw Error('Math insertion changed original manuscript');
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-display-math] math mfrac')"+")");
  await exec("document.querySelector('#preview > div').shadowRoot.querySelector('[data-display-math]').click()");
  if(!await exec("(()=>{const e=document.querySelector('#source');return e.value.slice(e.selectionStart,e.selectionEnd)==="+JSON.stringify(mathFormula)+";})()"))throw Error('Formula source range mismatch');
  await exec("document.querySelector('#source-math').click()");
  await until("document.querySelector('#math-formula')?.value==="+JSON.stringify(mathFormula));
  const setMathInput=value=>exec("(()=>{const e=document.querySelector('#math-formula');Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await setMathInput('\\input{secret}');
  await until("document.querySelector('#math-apply')?.disabled===true&&!document.querySelector('#math-draft-preview math')");
  await exec("document.querySelector('#math-cancel').click()");
  if(await exec("document.querySelector('#source').value")!==insertedMath)throw Error('Cancel changed source');
  await exec("document.querySelector('#source-math').click()");
  await until("!!document.querySelector('#math-editor')");
  const changedFormula=['\\begin{aligned}','  x&=\\sqrt{x^2+1} \\\\','  &=y','\\end{aligned}'].join('\n');
  if(!await exec("document.querySelector('#math-formula').tagName==='TEXTAREA'"))throw Error('Display formula editor must accept multiple lines');
  await setMathInput(changedFormula);
  await until("!!document.querySelector('#math-draft-preview math msqrt') && document.querySelectorAll('#math-draft-preview math mtable mtr').length===2");
  await exec("document.querySelector('#math-apply').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(insertedMath.replace(mathFormula,changedFormula)));
  if(!await exec("document.querySelector('#workspace-layout-state').dataset.phase==='stale'&&document.querySelector('#preview > div')?.dataset.paperFreshness==='previous'&&document.querySelector('#preview > div').inert"))throw Error('Old formula preview was not invalidated');
  await exec("document.querySelector('#preview-book').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-display-math] math msqrt') && document.querySelector('#preview > div').shadowRoot.querySelectorAll('[data-display-math] math mtable mtr').length===2"+")");
  await exec("document.querySelector('#preview > div').shadowRoot.querySelector('[data-display-math]').click()");
  await exec("document.querySelector('#source-math').click()");
  await until("document.querySelector('#math-formula')?.value==="+JSON.stringify(changedFormula));
  // Simulate an intervening source edit: draft must not overwrite it.
  const staleSource=insertedMath.replace(mathFormula,changedFormula)+'\n追記。\n';
  await exec("(()=>{const e=document.querySelector('#source');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,"+JSON.stringify(staleSource)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await until("document.querySelector('#math-apply')?.disabled===true");
  await exec("document.querySelector('#math-cancel').click()");
  if(await exec("document.querySelector('#source').value")!==staleSource)throw Error('Stale draft changed manuscript');
  // Numbered display math uses a persistent generated ID; the paper is the entry point for re-edit.
  await exec("(()=>{const e=document.querySelector('#source');e.focus();e.setSelectionRange(e.value.length,e.value.length);document.querySelector('#source-math').click();})()");
  await until("document.querySelector('#math-numbered')?.checked===false");
  await exec("document.querySelector('#math-numbered').click()");
  await until("document.querySelector('#math-numbered')?.checked===true&&!!document.querySelector('#math-equation-id')");
  const equationId=(await exec("document.querySelector('#math-equation-id').textContent")).replace('数式ID：','');
  if(!/^eq-[a-f0-9-]{36}$/.test(equationId))throw Error('Invalid generated equation ID');
  await exec("document.querySelector('#math-apply').click()");
  const numberedSource=staleSource+'\n:::layout{#'+equationId+' numbered="true"}\n$$\nx^2\n$$\n:::\n\n';
  await until("document.querySelector('#source').value==="+JSON.stringify(numberedSource));
  await exec("document.querySelector('#preview-button').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-equation-number]')"+")");
  await exec("document.querySelector('#preview > div').shadowRoot.querySelector('[data-equation-number]').click()");
  await exec("document.querySelector('#source-math').click()");
  await until("document.querySelector('#math-formula')?.value==='x^2'&&document.querySelector('#math-numbered')?.checked===true&&document.querySelector('#math-numbered')?.disabled===true");
  await setMathInput('y^2');
  await exec("document.querySelector('#math-apply').click()");
  const editedNumbered=numberedSource.replace('\nx^2\n$$\n:::', ()=>'\ny^2\n$$\n:::');
  await until("document.querySelector('#source').value==="+JSON.stringify(editedNumbered));
  await until("(()=>{const e=document.querySelector('#source');return e.value.slice(e.selectionStart,e.selectionEnd)==='y^2';})()");
  await exec("document.querySelector('#preview-book').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"!!document.querySelector('#preview > div')?.shadowRoot?.querySelector('[data-equation-number]')"+")");
  // Insert a reference to the generated persistent ID, never to its displayed number.
  await exec("(()=>{const e=document.querySelector('#source'),p=e.value.lastIndexOf('追記。')+2;e.focus();e.setSelectionRange(p,p);document.querySelector('#source-equation-reference').click();})()");
  await until("document.querySelector('#equation-reference-target')?.value==="+JSON.stringify(equationId));
  await exec("document.querySelector('#equation-reference-cancel').click()");
  if(await exec("document.querySelector('#source').value")!==editedNumbered)throw Error('Cancel reference changed source');
  await exec("document.querySelector('#source-equation-reference').click()");
  await until("!!document.querySelector('#equation-reference-editor')");
  await exec("document.querySelector('#equation-reference-apply').click()");
  const equationToken=':ref{target="'+equationId+'" format="label-number"}',referenced=editedNumbered.replace('追記。',()=> '追記'+equationToken+'。');
  await until("document.querySelector('#source').value==="+JSON.stringify(referenced));
  await until("(()=>{const e=document.querySelector('#source');return e.value.slice(e.selectionStart,e.selectionEnd)==="+JSON.stringify(equationToken)+";})()");
  await exec("document.querySelector('#preview-book').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"(()=>{const root=document.querySelector('#preview > div')?.shadowRoot,n=root?.querySelector('[data-equation-number]');return !!n&&root.textContent.includes('式 '+n.textContent);})()"+")");
  // Numbering cannot be removed while a reference points to that equation.
  await exec("document.querySelector('#preview > div').shadowRoot.querySelector('[data-equation-number]').click()");
  await exec("document.querySelector('#source-equation-numbering').click()");
  await until("document.querySelector('#status').textContent.includes('Book validation failed')&&!document.querySelector('#source-equation-numbering').disabled");
  if(await exec("document.querySelector('#source').value")!==referenced)throw Error('Referenced equation was modified');
  await exec("(()=>{const e=document.querySelector('#source');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,"+JSON.stringify(editedNumbered)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await until("document.querySelector('#source').value==="+JSON.stringify(editedNumbered));
  await exec("(()=>{const e=document.querySelector('#source'),p=e.value.lastIndexOf('y^2');e.focus();e.setSelectionRange(p,p+3);document.querySelector('#source-equation-numbering').click();})()");
  const numberingOff=editedNumbered.replace('numbered="true"','numbered="false"');
  await until("document.querySelector('#source').value==="+JSON.stringify(numberingOff));
  await until("(()=>{const e=document.querySelector('#source');return e.value.slice(e.selectionStart,e.selectionEnd)==='y^2';})()");
  await exec("document.querySelector('#source-equation-numbering').click()");
  await until("document.querySelector('#source').value==="+JSON.stringify(editedNumbered));
  await exec("document.querySelector('#preview-book').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"(()=>{const root=document.querySelector('#preview > div')?.shadowRoot,math=[...root?.querySelectorAll('math')??[]];return math.length>0&&math.every(m=>m.style.fontFamily.includes('BCFont_STIXTwoMath'))&&[...document.fonts].some(f=>f.family.replace(/[\"']/g,'')==='BCFont_STIXTwoMath'&&f.status==='loaded');})()"+")");
  const bundledTheme=await readFile(join(smokeRoot,'new-book','themes','default','theme.yaml'),'utf8');
  if(!bundledTheme.includes('stix-two-math'))throw Error('Bundled math theme role missing');
  // Import a genuine math font through the same permission-gated project font manager.
  if(!process.env.BC_TEST_MATH_FONT)throw Error('Missing math font fixture');
  if(!await exec("!!document.querySelector('#font-license')"))await exec("document.querySelector('#font-manager').click()");
  await until("!!document.querySelector('#font-license')");
  await exec("(()=>{for(const [id,value] of [['font-license','TeX Gyre Math fixture'],['font-license-text','Disposable CI fixture, installed TeX Gyre Math license recorded for testing']]){const e=document.getElementById(id);Object.getOwnPropertyDescriptor((e.tagName==='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement).prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));}if(!document.querySelector('#font-copy').checked)document.querySelector('#font-copy').click();})()");
  await until("!document.querySelector('#import-font').disabled");
  await exec("document.querySelector('#import-font').click()");
  await until("!document.querySelector('#open').disabled && document.querySelector('#math-font').options.length===3");
  const mathAlias=await exec("[...document.querySelector('#math-font').options].find(o=>/^BCFont_[a-f0-9]{64}$/.test(o.value)).value");
  const oldTextFonts=await exec("[document.querySelector('#body-font').value,document.querySelector('#heading-font').value]");
  await exec("(()=>{const e=document.querySelector('#math-font');e.value="+JSON.stringify(mathAlias)+";e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until("!document.querySelector('#save-theme').disabled && (document.querySelector('#workspace-layout-state').dataset.phase==='stale'&&document.querySelector('#preview > div')?.dataset.paperFreshness!=='current')");
  await exec("document.querySelector('#preview-book').click()");
  await until("document.querySelector(\'#workspace-layout-state\').dataset.phase===\'ready\' && ("+"(()=>{const math=[...document.querySelector('#preview > div')?.shadowRoot?.querySelectorAll('math')??[]];return math.length>0&&math.every(m=>m.style.fontFamily.includes("+JSON.stringify(mathAlias)+"));})()"+")");
  if(JSON.stringify(await exec("[document.querySelector('#body-font').value,document.querySelector('#heading-font').value]"))!==JSON.stringify(oldTextFonts))throw Error('Math role changed text fonts');
  await exec("document.querySelector('#preview > div').shadowRoot.querySelector('[data-equation-number]').click()");
  await exec("document.querySelector('#source-math').click()");
  await until("document.querySelector('#math-draft-preview math')?.style.fontFamily.includes("+JSON.stringify(mathAlias)+")");
  await exec("document.querySelector('#math-cancel').click()");
  await exec("document.querySelector('#save-theme').click()");
  await until("!document.querySelector('#save-theme').disabled===false && document.querySelector('#status').textContent.includes('テーマを保存しました')");
  const fontTheme=await readFile(join(smokeRoot,'new-book','themes','default','theme.yaml'),'utf8');
  if(!fontTheme.includes('math:')||!fontTheme.includes('font-'+mathAlias.slice(7)))throw Error('Math role not persisted');
  console.log('PASS bundled STIX math and independent imported math font; GUI component display math; Lab BCM math samples; GUI named slot math insert and paper re-edit; GUI equation numbering toggle and reference guard; GUI equation reference selection and insertion; GUI numbered equation insertion and re-edit; GUI inline math insert, update, cancel and stale guard; inline math atom source mapping; GUI math insertion, update, cancel and stale guard; batch list conversion; list indent and outdent; manuscript list markers and exact source selection; inline physical size and scripts; combined style controls and stable font override; source toolbar and shortcut toggles, selection and protected source; inline style rendering and exact raw envelope; multiline source, sample and exact named selection; optional slot omission, conditional group height, insertion and mixed occurrences; named slot editing, template, paper and exact source selection; identified question and linked explanation, source insertion and partial/book consistency; study numbering sample, chapter sequence and selected/book consistency; independently created custom component, direct insertion, rename and paper; custom study design, typed library and actual paper; study template, real paper and source selection; typed paragraph library, binding, usage filter and detach; paragraph frame fragmentation and theme/heading coexistence; shared binding, paper, impact and detach; named library registration, rename, independent draft copy and persistence; dynamic sample and manuscript context, theme and paper; image ratio lock, non-destructive crop and history; image component asset, actual pixels, theme and paper; component duplication and lock guards; Canvas smart guide cancellation and equal-gap distribution; Canvas multi-selection, alignment, history and persisted geometry; Canvas resize, undo/redo and persisted width; Canvas actual mouse drag, undo/redo and persisted paper; Canvas numeric coordinates and actual paper rendering; nested component grouping and actual book preview; H1-specific fixed label and independent font; Component Lab measure, discard, apply and actual book rendering; book settings save and physical whole-book preview; imported project font, license metadata, theme selection, actual font rendering; Electron project creation, theme save/reopen, Electron sandbox, project open/read, React editing, bundled Noto, independent font roles, stale invalidation, measured preview, source selection and save');
  closing=true;win.destroy();await rm(smokeRoot,{recursive:true,force:true,maxRetries:10,retryDelay:100});app.exit(0);
}
app.on('window-all-closed',()=>{if(!SMOKE)app.quit();});
if(!SMOKE&&!app.requestSingleInstanceLock())app.quit();
else run().catch(async e=>{console.error(e);if(SMOKE&&!PACKAGE_SMOKE&&smokeRoot)await rm(smokeRoot,{recursive:true,force:true,maxRetries:10,retryDelay:100}).catch(()=>{});app.exit(1);});
