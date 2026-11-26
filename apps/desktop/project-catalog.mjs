import {readFile,writeFile,rename,unlink,lstat} from 'node:fs/promises';
import {join,basename,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
const MAX=100,MAX_BYTES=1024*1024;
const validId=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id);
function validate(value){
  if(value?.schemaVersion!==1||!Array.isArray(value.entries)||value.entries.length>MAX)throw Error('Invalid project catalog');
  const ids=new Set(),paths=new Set();
  for(const e of value.entries){
    if(!validId(e?.id)||ids.has(e.id)||typeof e.path!=='string'||e.path.length>4096||!isAbsolute(e.path)||basename(e.path)!=='book.yaml'||paths.has(e.path)||typeof e.title!=='string'||!e.title.trim()||e.title.length>200||typeof e.lastOpened!=='string'||!Number.isFinite(Date.parse(e.lastOpened))||typeof e.favorite!=='boolean')throw Error('Invalid project catalog entry');
    ids.add(e.id);paths.add(e.path);
  }
  return value.entries;
}
// Only the main process owns manifest paths. Renderer may select registered IDs only.
export function projectCatalog(userData){
  const path=join(userData,'project-catalog.json');
  async function read(){
    try{
      const st=await lstat(path);
      if(!st.isFile()||st.isSymbolicLink()||st.size>MAX_BYTES)throw Error('Unsafe project catalog file');
      return validate(JSON.parse(await readFile(path,'utf8')));
    }catch(e){if(e.code==='ENOENT')return [];throw e;}
  }
  async function write(entries){
    validate({schemaVersion:1,entries});
    const temp=join(userData,'.project-catalog-'+randomUUID()+'.tmp');
    try{await writeFile(temp,JSON.stringify({schemaVersion:1,entries},null,2),{flag:'wx',mode:0o600});await rename(temp,path);}
    finally{await unlink(temp).catch(()=>{});}
  }
  const publicList=entries=>entries.map(e=>({...e}));
  return {
    async list(){return publicList(await read());},
    async pathFor(id){if(!validId(id))throw Error('Invalid project ID');const entry=(await read()).find(e=>e.id===id);if(!entry)throw Error('Project not registered');return entry.path;},
    async remember(manifest,title){
      let entries=await read();
      const previous=entries.find(e=>e.path===manifest);
      const entry={id:previous?.id??randomUUID(),path:manifest,title,lastOpened:new Date().toISOString(),favorite:previous?.favorite??false};
      entries=[entry,...entries.filter(e=>e.id!==entry.id)];
      if(entries.length>MAX){
        const index=entries.findLastIndex(e=>!e.favorite&&e.id!==entry.id);
        if(index<0)throw Error('Project list is full of favorites; remove an entry first');
        entries.splice(index,1);
      }
      await write(entries);return publicList(entries);
    },
    async favorite(id,value){
      if(!validId(id)||typeof value!=='boolean')throw Error('Invalid favorite request');
      const entries=await read(),entry=entries.find(e=>e.id===id);if(!entry)throw Error('Project not registered');
      entry.favorite=value;await write(entries);return publicList(entries);
    },
    async forget(id){
      if(!validId(id))throw Error('Invalid project ID');
      const entries=await read();if(!entries.some(e=>e.id===id))throw Error('Project not registered');
      const next=entries.filter(e=>e.id!==id);await write(next);return publicList(next);
    }
  };
}
