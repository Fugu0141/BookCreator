// Loopback-only developer server with an explicit asset allowlist. No manuscript file access.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const entries=new Map();
const add=(prefix,root,files)=>{for(const f of files)entries.set(prefix+f,new URL(root+f,import.meta.url));};
add('/demo/','../demo/',['preview.html','preview.mjs']);
add('/app/dist/','../dist/',['index.js','manuscript-poc.js','browser-preview.js','preview-typography.js','preview-component.js','study-blocks.js']);
add('/bcm/dist/','../../BookCreator_Markdown/dist/',['index.js','document.js','block-ids.js','validation.js']);
add('/engine/dist/','../../BookCreator_LayoutEngine/dist/',['index.js','tree.js','pagination.js','inspector.js','browser-measurement.js','browser-lines.js','preview-font.js','image-crop.js']);
export function startPreviewServer(port=4173){
  const server=createServer(async(req,res)=>{
    try{
      const path=new URL(req.url,'http://127.0.0.1').pathname;
      const file=entries.get(path==='/'?'/demo/preview.html':path);
      if(req.method!=='GET'||!file){res.writeHead(404).end();return;}
      const data=await readFile(file);
      res.writeHead(200,{'Content-Type':file.pathname.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; base-uri 'none'; frame-ancestors 'none'"}).end(data);
    }catch{res.writeHead(500).end();}
  });
  return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>resolve(server));});
}
