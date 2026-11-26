// Test the exact staged Pages files at the repository subpath, not localhost root.
import {createServer} from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
const profile=await mkdtemp(join(tmpdir(),'bc-pages-'));
const server=createServer(async(req,res)=>{
  const prefix='/BookCreator/',url=new URL(req.url,'http://localhost');
  const path=url.pathname.slice(prefix.length)||'index.html';
  if(req.method!=='GET'||!url.pathname.startsWith(prefix)||!(path==='index.html'||/^(?:app\/dist|bcm\/dist|engine\/dist|demo|fixtures)\/[a-z0-9-]+\.(?:js|mjs)$/.test(path))){res.writeHead(404).end();return;}
  try{
    const data=await readFile(new URL('../dist-pages/'+path,import.meta.url));
    res.writeHead(200,{'Content-Type':path.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8'}).end(data);
  }catch{res.writeHead(404).end();}
});
try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const args=['--headless','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--disable-background-networking','--user-data-dir='+profile,'--dump-dom','--virtual-time-budget=10000','http://127.0.0.1:'+server.address().port+'/BookCreator/?smoke=1'];
  if(process.env.CHROME_NO_SANDBOX==='1')args.unshift('--no-sandbox');
  const child=spawn(process.env.CHROME_BIN??'google-chrome',args);
  let stdout='',stderr='';
  child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
  const timer=setTimeout(()=>child.kill('SIGKILL'),40000);
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);}).finally(()=>clearTimeout(timer));
  const result=/<pre id="smoke"[^>]*>([^<]*)<\/pre>/.exec(stdout)?.[1];
  if(code!==0||!result?.startsWith('PASS '))throw Error('Pages smoke failed: '+(result??stderr.slice(-2000)));
  console.log('PASS Pages repository-subpath '+result);
}finally{
  server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
