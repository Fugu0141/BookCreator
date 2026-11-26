import {startPreviewServer} from '../demo/preview-server.mjs';
import {loadBundledMathFont} from '../apps/desktop/bundled-math-font.mjs';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';

const dir=await mkdtemp(join(tmpdir(),'bc-math-pdf-'));
let server,chrome,socket;
const pending=new Map();
let sequence=0;
const timeout=ms=>AbortSignal.timeout(ms);
async function waitFor(fn,description){
  const until=Date.now()+30000;
  while(Date.now()<until){
    try{const result=await fn();if(result)return result;}catch{}
    await delay(100);
  }
  throw Error('Timed out: '+description);
}
function command(method,params={}){
  return new Promise((resolve,reject)=>{
    const id=++sequence;
    const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},30000);
    pending.set(id,{resolve,reject,timer});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const result=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);
  return result.result.value;
}
const run=(bin,args)=>execFileSync(bin,args,{encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024});
function inspectPgm(buffer){
  // pdftoppm -gray emits a binary P5 image with a newline-terminated header.
  const m=/^P5\s+(\d+)\s+(\d+)\s+255\r?\n/.exec(buffer.subarray(0,128).toString('latin1'));
  assert.ok(m,'Invalid grayscale raster');
  const w=Number(m[1]),h=Number(m[2]),pixels=buffer.subarray(m[0].length);
  assert.equal(pixels.length,w*h);
  let dark=0,edge=0;
  const inset=Math.floor(100*4/25.4); // 4mm safety border at 100dpi
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    if(pixels[y*w+x]<180){dark++;if(x<inset||y<inset||x>=w-inset||y>=h-inset)edge++;}
  }
  assert.ok(dark>100,'Unexpected blank printed page');
  assert.equal(edge,0,'Ink reaches outer 4mm safety margin');
  return {w,h,dark};
}
try{
  const {font}=await loadBundledMathFont();
  server=await startPreviewServer(0);
  const args=['--headless','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--disable-background-networking','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'];
  if(process.env.CHROME_NO_SANDBOX==='1')args.unshift('--no-sandbox');
  chrome=spawn(process.env.CHROME_BIN??'google-chrome',args,{stdio:'ignore'});
  let launchError;
  chrome.once('error',e=>{launchError=e;});
  const port=await waitFor(async()=>{
    if(launchError||chrome.exitCode!==null)throw Error('Chrome launch failed');
    const raw=await readFile(join(dir,'DevToolsActivePort'),'utf8');
    return Number(raw.split('\n')[0])||undefined;
  },'Chrome DevTools port');
  const tab=await waitFor(async()=>{
    const tabs=await (await fetch('http://127.0.0.1:'+port+'/json/list',{signal:timeout(3000)})).json();
    return tabs.find(t=>t.type==='page');
  },'Chrome page');
  socket=new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('WebSocket timeout')),10000);
    socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
    socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('WebSocket connection failed'));},{once:true});
  });
  socket.addEventListener('message',event=>{
    const m=JSON.parse(event.data),p=pending.get(m.id);
    if(!p)return;
    clearTimeout(p.timer);pending.delete(m.id);
    if(m.error)p.reject(Error(JSON.stringify(m.error)));else p.resolve(m.result);
  });
  await command('Page.enable');
  await command('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/demo/math-pdf.html'});
  await waitFor(()=>evaluate('typeof window.renderMathPdfFixture==="function"'),'print fixture module');
  const report=await evaluate('window.renderMathPdfFixture('+JSON.stringify(font.toString('base64'))+')');
  assert.equal(report.publicationReady,false);
  assert.ok(report.pages>=3&&report.pages<=12&&report.mathCount>=10);
  const printed=await command('Page.printToPDF',{displayHeaderFooter:false,printBackground:true,preferCSSPageSize:true,scale:1});
  const pdf=join(dir,'textbook.pdf');
  await writeFile(pdf,Buffer.from(printed.data,'base64'));
  const info=run('pdfinfo',[pdf]),text=run('pdftotext',['-layout',pdf,'-']),fonts=run('pdffonts',[pdf]);
  assert.equal(Number(/^Pages:\s+(\d+)/m.exec(info)?.[1]),report.pages,'PDF page count differs from layout');
  const dimensions=/^Page size:\s+([\d.]+) x ([\d.]+) pts/m.exec(info);
  assert.ok(dimensions&&Math.abs(Number(dimensions[1])-160*72/25.4)<2&&Math.abs(Number(dimensions[2])-200*72/25.4)<2,'Unexpected physical paper size');
  const compact=text.replace(/\s/g,'');
  for(const label of report.labels)assert.ok(compact.includes(label),'Missing printed number '+label);
  for(const word of ['二次方程式','微分','行列','判別式'])assert.ok(compact.includes(word),'Missing Japanese text '+word);
  assert.ok(!text.includes('\uFFFD'),'Replacement glyph in PDF text extraction');
  const fontRows=fonts.split('\n').slice(2).filter(s=>s.trim());
  assert.ok(fontRows.some(s=>/STIXTwoMath/i.test(s)&&/\byes\s+(?:yes|no)\s+(?:yes|no)\s+\d+\s+\d+\s*$/.test(s)),'STIX Two Math not embedded: '+fonts);
  assert.ok(fontRows.every(s=>/\byes\s+(?:yes|no)\s+(?:yes|no)\s+\d+\s+\d+\s*$/.test(s)),'Nonembedded PDF font: '+fonts);
  run('pdftoppm',['-r','100','-gray',pdf,join(dir,'page')]);
  const rasters=(await readdir(dir)).filter(s=>/^page-\d+\.pgm$/.test(s));
  assert.equal(rasters.length,report.pages);
  for(const raster of rasters)inspectPgm(await readFile(join(dir,raster)));
  console.log('PASS experimental math PDF preflight '+JSON.stringify({...report,embeddedMathFont:true,paper:'160x200mm',rasterPages:rasters.length}));
}finally{
  if(socket)socket.close();
  for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('CDP closed'));}
  if(chrome&&chrome.exitCode===null){chrome.kill('SIGKILL');await new Promise(resolve=>{if(chrome.exitCode!==null)resolve();else chrome.once('close',resolve);});}
  if(server)await new Promise(resolve=>server.close(resolve));
  await rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
