// Windows x64 portable development package, built from locally installed Electron.
// No installer, auto-update, signing or public release; no source projects included.
import {cp,mkdir,lstat,readdir,rename,rm,writeFile,readFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../..');
if(process.platform!=='win32'||process.arch!=='x64')throw Error('Build on Windows x64');
const electronExe=require('electron');
if(typeof electronExe!=='string'||!electronExe.toLowerCase().endsWith('electron.exe'))throw Error('Expected installed Windows Electron');
const output=join(root,'dist-windows','BookCreator');
await mkdir(output,{recursive:false}).catch(async e=>{
  if(e.code!=='ENOENT')throw e;
  await mkdir(dirname(output),{recursive:true});await mkdir(output);
});
try{
  // Electron runtime includes Chromium, Node.js and third-party license notices.
  await cp(dirname(electronExe),output,{recursive:true,force:true});
  await rename(join(output,'electron.exe'),join(output,'BookCreator.exe'));
  await rm(join(output,'resources','default_app.asar'),{force:true});
  const appDir=join(output,'resources','app'),desktop=join(appDir,'apps','desktop');
  await mkdir(desktop,{recursive:true});
  const pkg=JSON.parse(await readFile(join(here,'package.json'),'utf8'));
  await writeFile(join(appDir,'package.json'),JSON.stringify({name:'bookcreator-desktop',productName:'BookCreator',version:pkg.version,private:true,type:'module',main:'apps/desktop/main.mjs'},null,2));
  for(const file of ['main.mjs','workspace.mjs','project-catalog.mjs','manuscript-recovery.mjs','settings-recovery.mjs','component-recovery.mjs','preview-read-lane.mjs','benchmark-fixture.mjs','benchmark-runner.mjs','recovery-hub.mjs','book-settings.mjs','project-fonts.mjs','project-images.mjs','bundled-math-font.mjs','preload.cjs','index.html','trial-pdf-output.mjs','trial-pdf-inspection.mjs','print.html','trial-print-plan.mjs','trial-print-window.mjs','style.css']){
    await cp(join(here,file),join(desktop,file));
  }
  await mkdir(join(desktop,'tests'));
  await cp(join(here,'tests','png-fixture.mjs'),join(desktop,'tests','png-fixture.mjs'));
  await cp(join(here,'build'),join(desktop,'build'),{recursive:true});
  const dist=join(appDir,'dist');await mkdir(dist);
  for(const entry of await readdir(join(root,'dist'),{withFileTypes:true})){
    if(entry.isFile()&&/^[a-z][a-z0-9-]*\.js$/.test(entry.name))await cp(join(root,'dist',entry.name),join(dist,entry.name));
  }
  const yamlDir=dirname(require.resolve('yaml/package.json'));
  await mkdir(join(appDir,'node_modules'));
  await cp(yamlDir,join(appDir,'node_modules','yaml'),{recursive:true});
  // pdf-lib and its pure-JavaScript runtime dependencies, including their license files.
  for(const name of ['pdf-lib','@pdf-lib/standard-fonts','@pdf-lib/upng','pako','tslib']){
    // Some dependencies (tslib) do not export package.json. Walk up
    // from the resolved entry point and validate the package name.
    let from=dirname(require.resolve(name));
    for(;;){
      let manifest;
      try{manifest=JSON.parse(await readFile(join(from,'package.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
      if(manifest?.name===name)break;
      const parent=dirname(from);if(parent===from)throw Error('Cannot locate dependency '+name);
      from=parent;
    }
    const to=join(appDir,'node_modules',name);
    await mkdir(dirname(to),{recursive:true});
    await cp(from,to,{recursive:true});
  }
  for(const file of ['BookCreator.exe','resources/app/apps/desktop/build/renderer.js','resources/app/apps/desktop/print.html','resources/app/apps/desktop/build/print-renderer.js','resources/app/apps/desktop/build/fonts/STIXTwoMath-Regular.ttf','resources/app/apps/desktop/build/NotoSansJP-LICENSE.txt','resources/app/apps/desktop/build/STIXTwoMath-LICENSE.txt','resources/app/dist/preview-component.js']){
    if(!(await lstat(join(output,file))).isFile())throw Error('Missing package file: '+file);
  }
  await writeFile(join(output,'README-START.txt'),'\uFEFFBookCreator Windows x64 開発プレビュー\r\n\r\nZIPをすべて展開し、BookCreator.exe をダブルクリックしてください。\r\n他のファイルや resources フォルダーは移動・削除しないでください。\r\nNode.js、Git のインストールは不要です。\r\n新規書籍はアプリの「新規作成」から、アプリ外の書き込み可能なフォルダーに作成してください。\r\n開発版・未署名・正式出版非対応です。重要な原稿にはバックアップを取ってください。\r\n更新時は新しいZIPを別フォルダーに展開し、旧版は動作確認後に整理してください。\r\n');
  console.log('Portable package: '+output);
}catch(e){await rm(output,{recursive:true,force:true});throw e;}
