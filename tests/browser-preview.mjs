import {startPreviewServer} from '../demo/preview-server.mjs';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const profile=await mkdtemp(join(tmpdir(),'bookcreator-preview-'));
const server=await startPreviewServer(0);
try{
  const args=['--headless','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--disable-background-networking','--user-data-dir='+profile,'--dump-dom','--virtual-time-budget=20000','http://127.0.0.1:'+server.address().port+'/?smoke=1'];
  if(process.env.CHROME_NO_SANDBOX==='1')args.unshift('--no-sandbox');
  const child=spawn(process.env.CHROME_BIN??'google-chrome',args);
  let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
  const timeout=setTimeout(()=>child.kill('SIGKILL'),60000);
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);}).finally(()=>clearTimeout(timeout));
  const match=/<pre id="smoke"[^>]*>([^<]*)<\/pre>/.exec(stdout);
  if(code!==0||!match?.[1].startsWith('PASS '))throw Error('BookCreator preview failed: '+(match?.[1]??'missing smoke marker')+'; Chrome: '+stderr.slice(-1500));
  console.log(match[1]);
}finally{server.close();await rm(profile,{recursive:true,force:true});}
