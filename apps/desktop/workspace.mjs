import {open,lstat,realpath,rename,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname,join,resolve,relative,isAbsolute,basename} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {parseDocument,visit,isAlias} from 'yaml';

const MAX_SOURCE=4*1024*1024,MAX_MANIFEST=256*1024;
const hash=b=>createHash('sha256').update(b).digest('hex');
const decode=b=>new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(b);
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const validId=v=>typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(v);
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function relativeParts(path){
  if(typeof path!=='string'||!path||path.length>1024||/[\\:\u0000-\u001f\u007f]/.test(path)||path.startsWith('/'))fail('PATH','Invalid project-relative path');
  const parts=path.split('/');
  if(parts.some(p=>!p||p==='.'||p==='..'||/[<>|"*?]/.test(p)||/[ .]$/.test(p)||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))fail('PATH','Unsupported or unsafe path component');
  return parts;
}
async function inside(root,path){
  let current=root;
  for(const part of relativeParts(path)){
    current=join(current,part);
    const s=await lstat(current);
    if(s.isSymbolicLink())fail('PATH','Symbolic links are not supported');
  }
  const canonical=await realpath(current),rel=relative(root,canonical);
  if(!rel||isAbsolute(rel)||rel==='..'||rel.startsWith('..'+(process.platform==='win32'?'\\':'/')))fail('PATH','Path escapes project root');
  return canonical;
}
async function readRegular(path,limit){
  const f=await open(path,constants.O_RDONLY|constants.O_NONBLOCK|(constants.O_NOFOLLOW??0));
  try{
    const s=await f.stat();if(!s.isFile()||s.size>limit)fail('INPUT','Expected a bounded regular file');
    const bytes=Buffer.alloc(limit+1);let used=0;
    while(used<bytes.length){const r=await f.read(bytes,used,bytes.length-used,null);if(!r.bytesRead)break;used+=r.bytesRead;}
    if(used>limit)fail('INPUT','Input too large');
    return {bytes:bytes.subarray(0,used),mode:s.mode&0o777};
  }finally{await f.close();}
}
function parseManifest(raw){
  const doc=parseDocument(raw,{uniqueKeys:true,strict:true,schema:'core'});
  if(doc.errors.length||doc.warnings.length)fail('MANIFEST','Invalid or unsupported YAML');
  let nodes=0;
  visit(doc,(_key,node,path)=>{
    if(++nodes>10000||path.length>32||isAlias(node)||node?.tag||node?.anchor)fail('MANIFEST','Unsupported YAML tag, alias, anchor or complexity');
  });
  const m=doc.toJS({maxAliasCount:0});
  if(!record(m)||m.schemaVersion!==1||m.documentFormat?.name!=='bcm'||m.documentFormat?.version!==1)fail('FORMAT','Unsupported book format (not editable in this PoC)');
  if(typeof m.title!=='string'||!m.title.trim()||typeof m.language!=='string'||typeof m.theme!=='string'||!record(m.page)||!Array.isArray(m.sections)||!m.sections.length||m.sections.length>512)fail('MANIFEST','Required book metadata is missing or invalid');
  relativeParts(m.theme);
  const ids=new Set(),paths=new Set(),sections=[];
  for(const s of m.sections){
    if(!record(s)||!validId(s.id)||ids.has(s.id)||!['manuscript','cover','blank'].includes(s.type))fail('MANIFEST','Invalid or duplicate section ID');
    ids.add(s.id);
    if(s.type!=='manuscript'){sections.push({id:s.id,type:s.type,editable:false});continue;}
    if(!['front-matter','body','back-matter'].includes(s.role)||typeof s.path!=='string'||!s.path.toLowerCase().endsWith('.md'))fail('MANIFEST','Invalid manuscript section');
    const parts=relativeParts(s.path);
    const folded=parts.join('/').normalize('NFC').toLowerCase();
    if(paths.has(folded))fail('MANIFEST','Duplicate or colliding manuscript path');
    paths.add(folded);
    const startOn=s.startOn??m.page.defaultSectionStart??'page';
    if(!['page','continuous','left','right','spread-start','spread-end'].includes(startOn))fail('MANIFEST','Invalid section start');
    sections.push({id:s.id,type:s.type,path:s.path,role:s.role,startOn,editable:true});
  }
  return {title:m.title,language:m.language,sections};
}
function sourceInfo(bytes){
  const raw=decode(bytes),bom=raw.startsWith('\uFEFF'),text=bom?raw.slice(1):raw;
  const crlf=(text.match(/\r\n/g)??[]).length;
  const rest=text.replace(/\r\n/g,'');
  const mixed=rest.includes('\r')||(crlf>0&&rest.includes('\n'));
  return {text:text.replace(/\r\n|\r/g,'\n'),bom,eol:crlf?'\r\n':'\n',editable:!mixed};
}
export async function openWorkspace(manifestPath){
  if(basename(manifestPath)!=='book.yaml'||(await lstat(manifestPath)).isSymbolicLink())fail('MANIFEST','Select a regular book.yaml file');
  const root=await realpath(dirname(resolve(manifestPath)));
  const manifest=await inside(root,'book.yaml');
  const m=await readRegular(manifest,MAX_MANIFEST);
  const summary=parseManifest(decode(m.bytes));
  const manifestHash=hash(m.bytes),seen=new Set(),files=new Map();
  for(const s of summary.sections){
    if(!s.editable)continue;
    const path=await inside(root,s.path);
    const stat=await lstat(path);
    if(!stat.isFile())fail('PATH','Manuscript must be a regular file');
    // Reject hard links and duplicate file identities for this early writer.
    const identity=String(stat.dev)+':'+String(stat.ino);
    if(stat.nlink!==1||seen.has(identity))fail('PATH','Linked or duplicate manuscript file');
    seen.add(identity);files.set(s.id,{path,relativePath:s.path});
  }
  let busy=false;
  async function checkManifest(){
    const latest=await readRegular(await inside(root,'book.yaml'),MAX_MANIFEST);
    if(hash(latest.bytes)!==manifestHash)fail('CONFLICT','book.yaml changed externally; reopen the project');
  }
  async function current(id){
    const f=files.get(id);if(!f)fail('SECTION','Unknown or non-manuscript section');
    const path=await inside(root,f.relativePath);
    if(path!==f.path||(await lstat(path)).nlink!==1)fail('PATH','Manuscript identity changed');
    const r=await readRegular(path,MAX_SOURCE);
    return {f,...r,info:sourceInfo(r.bytes),revision:hash(r.bytes)};
  }
  return {
    summary:structuredClone(summary),
    async read(id){
      await checkManifest();
      const r=await current(id);
      return {id,text:r.info.text,revision:r.revision,editable:r.info.editable};
    },
    async save(id,expectedRevision,text){
      if(busy)fail('BUSY','Another write is in progress');
      if(typeof text!=='string'||text.length>MAX_SOURCE||/\r|[\p{Cs}\u0000]/u.test(text)||typeof expectedRevision!=='string'||!/^[a-f0-9]{64}$/.test(expectedRevision))fail('INPUT','Invalid save request');
      busy=true;let temp;
      try{
        await checkManifest();
        const r=await current(id);
        if(r.revision!==expectedRevision)fail('CONFLICT','Manuscript changed externally; your edits were not saved');
        if(!r.info.editable)fail('FORMAT','Mixed or legacy line endings are read-only in this PoC');
        const bytes=Buffer.from((r.info.bom?'\uFEFF':'')+text.replace(/\n/g,r.info.eol),'utf8');
        if(bytes.length>MAX_SOURCE)fail('INPUT','Manuscript too large');
        if(bytes.equals(r.bytes))return {id,revision:r.revision};
        temp=join(dirname(r.f.path),'.bookcreator-'+randomUUID()+'.tmp');
        const handle=await open(temp,'wx',r.mode);
        try{await handle.writeFile(bytes);await handle.chmod(r.mode);await handle.sync();}finally{await handle.close();}
        await checkManifest();
        const before=await current(id);
        if(before.revision!==expectedRevision)fail('CONFLICT','Manuscript changed before replacement');
        await rename(temp,r.f.path);temp=undefined;
        return {id,revision:hash(bytes)};
      }finally{if(temp)await unlink(temp).catch(()=>{});busy=false;}
    }
  };
}
