import {projectFonts} from './project-fonts.mjs';
import {open,lstat,realpath,rename,unlink,mkdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname,join,resolve,relative,isAbsolute,basename} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {parseDocument,visit,isAlias,stringify} from 'yaml';

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
function safeYaml(raw){
  const doc=parseDocument(raw,{uniqueKeys:true,strict:true,schema:'core'});
  if(doc.errors.length||doc.warnings.length)fail('MANIFEST','Invalid or unsupported YAML');
  let nodes=0;
  visit(doc,(_key,node,path)=>{
    if(++nodes>10000||path.length>32||isAlias(node)||node?.tag||node?.anchor)fail('MANIFEST','Unsupported YAML tag, alias, anchor or complexity');
  });
  return doc;
}
function parseManifest(raw){
  const m=safeYaml(raw).toJS({maxAliasCount:0});
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
  return {title:m.title,language:m.language,sections,themePath:m.theme};
}

const FACE_IDS=new Map([['noto-sans-jp','BCFont_NotoSansJP'],['system-serif','serif'],['system-sans','sans-serif'],['system-monospace','monospace']]);
const DEFAULT_ROLES={body:{font:'noto-sans-jp',weight:400},heading:{font:'noto-sans-jp',weight:700}};
function checkedRoles(value,faces=[]){
  if(!record(value)||Object.keys(value).some(k=>!['body','heading'].includes(k)))fail('THEME','Unsupported typography role');
  const result={};
  for(const role of ['body','heading']){
    const v=value[role];
    if(!record(v)||Object.keys(v).some(k=>!['font','weight'].includes(k))||!(FACE_IDS.has(v.font)?[400,500,600,700].includes(v.weight):faces.some(f=>f.id===v.font&&f.weight===v.weight)))fail('THEME','Unsupported font ID or weight');
    result[role]={font:v.font,weight:v.weight};
  }
  return result;
}
function readTypography(doc,faces){
  const t=doc.toJS({maxAliasCount:0});
  if(!record(t)||t.schemaVersion!==1)fail('THEME','Unsupported theme format');
  if(t.extends!==undefined||t.parent!==undefined)fail('THEME','Theme inheritance is not supported by this editor');
  if(t.typography===undefined)return null;
  if(!record(t.typography)||t.typography.schemaVersion!==1||Object.keys(t.typography).some(k=>!['schemaVersion','roles'].includes(k)))fail('THEME','Unsupported typography schema');
  return checkedRoles(t.typography.roles,faces);
}
async function writeNew(path,text){
  const f=await open(path,'wx',0o644);
  try{await f.writeFile(text,'utf8');await f.sync();}finally{await f.close();}
}
export async function createProject(parent,options){
  if(!record(options)||typeof options.title!=='string'||!options.title.trim()||options.title.length>200||/[\p{Cc}\p{Cs}]/u.test(options.title)||
    typeof options.folder!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(options.folder)||!['A4','A5','B5'].includes(options.size))
    fail('INPUT','Invalid new project title, folder or page size');
  relativeParts(options.folder);
  const dir=await realpath(parent),root=join(dir,options.folder);
  // An existing directory or file is never overwritten.
  await mkdir(root,{mode:0o755});
  try{
    for(const name of ['manuscript','assets','fonts','layouts','themes'])await mkdir(join(root,name));
    await mkdir(join(root,'themes','default'));
    await writeNew(join(root,'manuscript','chapter-01.md'),'# はじめに\n\nここから原稿を書き始めます。\n');
    await writeNew(join(root,'themes','default','theme.yaml'),stringify({schemaVersion:1,id:'default',name:'Default',tokens:{color:{accent:'#315b86',text:'#222222'}},typography:{schemaVersion:1,roles:DEFAULT_ROLES},components:{},bindings:{},repeats:[]}));
    await writeNew(join(root,'.gitignore'),'.bookcreator/\ndist/\n');
    // Publish the manifest last. Partial creation remains visible for manual recovery.
    await writeNew(join(root,'book.yaml'),stringify({schemaVersion:1,documentFormat:{name:'bcm',version:1},title:options.title.trim(),language:'ja',theme:'themes/default/theme.yaml',page:{size:options.size,binding:'left',firstInteriorSide:'right',defaultSectionStart:'page',margin:{top:'18mm',bottom:'20mm',inner:'23mm',outer:'18mm'}},sections:[{id:'chapter-01',type:'manuscript',role:'body',path:'manuscript/chapter-01.md'}]}));
    return await openWorkspace(join(root,'book.yaml'));
  }catch(e){fail('CREATE','Project creation incomplete; inspect the newly created folder '+root+' ('+String(e.message??e)+')');}
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
  const fontStore=projectFonts(root);
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
  async function readTheme(){
    let path;
    try{path=await inside(root,summary.themePath);}catch(e){if(e.code==='ENOENT')return {editable:false,roles:null,revision:null,message:'Theme file missing; preview defaults only'};throw e;}
    const st=await lstat(path);if(!st.isFile()||st.nlink!==1||path===manifest||[...files.values()].some(f=>f.path===path))fail('THEME','Unsafe theme file');
    const r=await readRegular(path,MAX_MANIFEST),doc=safeYaml(decode(r.bytes));
    try{return {editable:true,roles:readTypography(doc,await fontStore.list()),revision:hash(r.bytes),path,doc,...r};}
    catch(e){if(e.code==='THEME')return {editable:false,roles:null,revision:null,message:e.message};throw e;}
  }
  function publicTheme(t){return {editable:t.editable,roles:t.roles,revision:t.revision,...(t.message?{message:t.message}:{})};}
  return {
    summary:structuredClone(summary),
    async fonts(includeBytes=false){await checkManifest();return fontStore.list({includeBytes});},
    async importFont(path,rights){if(busy)fail('BUSY','Another write is in progress');busy=true;try{await checkManifest();return await fontStore.add(path,rights);}finally{busy=false;}},
    async typography(){await checkManifest();return publicTheme(await readTheme());},
    async saveTypography(expectedRevision,roles){
      if(busy)fail('BUSY','Another write is in progress');
      if(typeof expectedRevision!=='string'||!/^[a-f0-9]{64}$/.test(expectedRevision))fail('INPUT','Invalid theme revision');
      busy=true;let temp;
      try{
        await checkManifest();const value=checkedRoles(roles,await fontStore.list());const t=await readTheme();
        if(!t.editable||t.revision!==expectedRevision)fail('CONFLICT','Theme changed or is not editable; changes were not saved');
        if(JSON.stringify(t.roles)===JSON.stringify(value))return publicTheme(t);
        // Edit only the recognized subtree; YAML formatting may be normalized on serialization.
        t.doc.set('typography',{schemaVersion:1,roles:value});
        const info=sourceInfo(t.bytes);
        if(!info.editable)fail('FORMAT','Mixed theme line endings are read-only');
        const bytes=Buffer.from((info.bom?'\uFEFF':'')+t.doc.toString().replace(/\n/g,info.eol),'utf8');
        if(bytes.length>MAX_MANIFEST)fail('INPUT','Theme too large');
        temp=join(dirname(t.path),'.bookcreator-'+randomUUID()+'.tmp');
        const f=await open(temp,'wx',t.mode);
        try{await f.writeFile(bytes);await f.chmod(t.mode);await f.sync();}finally{await f.close();}
        await checkManifest();const current=await readTheme();
        if(!current.editable||current.path!==t.path||current.revision!==expectedRevision)fail('CONFLICT','Theme changed before replacement');
        await rename(temp,t.path);temp=undefined;
        return {editable:true,roles:value,revision:hash(bytes)};
      }finally{if(temp)await unlink(temp).catch(()=>{});busy=false;}
    },
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
