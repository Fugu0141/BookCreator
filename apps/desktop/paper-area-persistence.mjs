import {open,lstat,realpath,mkdir,rename,unlink,link} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {validatePaperAreaDocument,encodePaperAreaDocument,decodePaperAreaDocument} from './paper-area-store.mjs';
const LIMIT=8_000_000,empty={schemaVersion:1,entries:[]};
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const safeId=id=>typeof id==='string'&&/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(id);
// This is a project-owned experimental intent file, NOT a production layout.
// Fixed paths only; a caller cannot choose the target file.
export function paperAreaPersistence(root,{checkManifest,readManuscript}){
  const dir=join(root,'layouts'),path=join(dir,'paper-area.json');
  let busy=false;
  async function checkDir(create=false){
    if(await realpath(root)!==root)fail('PATH','Project root changed');
    let s;
    try{s=await lstat(dir);}catch(e){
      if(e.code!=='ENOENT')throw e;
      if(!create)return false;
      try{await mkdir(dir,{mode:0o755});}catch(e){if(e.code!=='EEXIST')throw e;}
      s=await lstat(dir);
    }
    if(!s.isDirectory()||s.isSymbolicLink()||await realpath(dir)!==dir)fail('PATH','Unsafe layout directory');
    return true;
  }
  async function readAll(){
    if(!await checkDir())return {revision:null,document:validatePaperAreaDocument(empty)};
    let st;
    try{st=await lstat(path);}catch(e){if(e.code==='ENOENT')return {revision:null,document:validatePaperAreaDocument(empty)};throw e;}
    if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1)fail('PATH','Unsafe paper area file');
    const f=await open(path,constants.O_RDONLY|constants.O_NONBLOCK|(constants.O_NOFOLLOW??0));
    let bytes;
    try{
      const s=await f.stat();
      if(!s.isFile()||s.nlink!==1||s.size>LIMIT||s.ino!==st.ino||s.dev!==st.dev)fail('INPUT','Unsafe paper area file');
      const buffer=Buffer.alloc(LIMIT+1);let used=0;
      while(used<buffer.length){const r=await f.read(buffer,used,buffer.length-used,null);if(!r.bytesRead)break;used+=r.bytesRead;}
      if(used>LIMIT)fail('INPUT','Paper area file too large');
      bytes=buffer.subarray(0,used);
    }finally{await f.close();}
    return {revision:hash(bytes),document:decodePaperAreaDocument(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),mode:st.mode&0o777};
  }
  const scoped=(all,id)=>({revision:all.revision,document:validatePaperAreaDocument({schemaVersion:1,entries:all.document.entries.filter(e=>e.documentId===id)})});
  async function verifySource(id,revision){
    if(!safeId(id)||typeof revision!=='string'||!/^[a-f0-9]{64}$/.test(revision))fail('INPUT','Invalid manuscript lease');
    await checkManifest();
    const source=await readManuscript(id);
    if(source.revision!==revision||!source.info.editable)fail('CONFLICT','Manuscript changed or is read-only');
    return source;
  }
  return {
    async readBook(){await checkManifest();const {revision,document}=await readAll();await checkManifest();return {revision,document};},
    async read(id){
      if(!safeId(id))fail('INPUT','Invalid manuscript identity');
      await checkManifest();await readManuscript(id);
      return scoped(await readAll(),id);
    },
    async save(id,sourceRevision,expectedRevision,value,verifyBook){
      if(busy)fail('BUSY','Another paper area write is in progress');
      busy=true;let temp;
      try{
        const doc=validatePaperAreaDocument(value);
        if(doc.entries.some(e=>e.documentId!==id))fail('INPUT','Cross-manuscript paper area edit');
        await verifySource(id,sourceRevision);
        await verifyBook?.();
        const old=await readAll();
        if(!verifyBook&&(doc.entries.some(e=>e.bookFixed||e.bookPreferred)||old.document.entries.some(e=>e.documentId===id&&(e.bookFixed||e.bookPreferred))))fail('INPUT','Absolute page locks require full-book verification');
        if(old.revision!==expectedRevision)fail('CONFLICT','Paper area file changed externally');
        const merged=validatePaperAreaDocument({schemaVersion:1,entries:[...old.document.entries.filter(e=>e.documentId!==id),...doc.entries]});
        if(encodePaperAreaDocument(merged)===encodePaperAreaDocument(old.document))return scoped(old,id);
        const bytes=Buffer.from(encodePaperAreaDocument(merged),'utf8');
        if(bytes.length>LIMIT)fail('INPUT','Paper area file too large');
        await checkDir(true);temp=join(dir,'.paper-area-'+randomUUID()+'.tmp');
        const f=await open(temp,'wx',old.mode??0o644);
        try{await f.writeFile(bytes);await f.chmod(old.mode??0o644);await f.sync();}finally{await f.close();}
        await verifySource(id,sourceRevision);
        await verifyBook?.();
        if((await readAll()).revision!==expectedRevision)fail('CONFLICT','Paper area file changed before replacement');
        // For a first save, link refuses to overwrite an unexpected new file.
        // Existing-file replacement uses the same checked atomic rename pattern
        // as the manuscript writer.
        if(old.revision===null){await link(temp,path);await unlink(temp);}else await rename(temp,path);
        temp=undefined;
        return scoped({revision:hash(bytes),document:merged},id);
      }finally{if(temp)await unlink(temp).catch(()=>{});busy=false;}
    }
  };
}
