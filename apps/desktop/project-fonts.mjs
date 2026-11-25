import {lstat,open,mkdir,readdir,rename,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,extname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const MAX=20*1024*1024, MAX_TOTAL=64*1024*1024, MAX_FACES=16;
const digest=b=>createHash('sha256').update(b).digest('hex');
const bad=(message)=>{throw Object.assign(Error(message),{code:'FONT'});};
const validHash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
async function regular(path,limit){
  const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink())bad('Expected a regular non-symlink font resource');
  const f=await open(path,constants.O_RDONLY|constants.O_NONBLOCK|(constants.O_NOFOLLOW??0));
  try{
    const info=await f.stat();if(!info.isFile()||info.size>limit)bad('Font resource too large or invalid');
    const b=Buffer.alloc(limit+1);let used=0;
    while(used<b.length){const r=await f.read(b,used,b.length-used,null);if(!r.bytesRead)break;used+=r.bytesRead;}
    if(used>limit)bad('Font resource exceeds limit');return b.subarray(0,used);
  }finally{await f.close();}
}
async function directory(path,create=false){
  if(create)await mkdir(path).catch(e=>{if(e.code!=='EEXIST')throw e;});
  const s=await lstat(path);if(!s.isDirectory()||s.isSymbolicLink())bad('Unsafe font directory');
}
function label(v,max=160){return typeof v==='string'&&v.trim()&&v.length<=max&&!/[\p{Cc}\p{Cf}\p{Cs}]/u.test(v);}
// Bounded structural preflight only; the Chromium sandbox performs actual font decoding.
export function inspectStaticFont(bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length<12||bytes.length>MAX)bad('Invalid SFNT size');
  const magic=bytes.readUInt32BE(0),format=magic===0x00010000?'ttf':magic===0x4f54544f?'otf':null;
  if(!format)bad('Only single static TTF/OTF faces are supported');
  const n=bytes.readUInt16BE(4),header=12+16*n;
  if(n<1||n>128||header>bytes.length)bad('Invalid SFNT directory');
  const tables=new Map(),ranges=[];
  for(let i=0;i<n;i++){
    const p=12+16*i,tag=bytes.toString('ascii',p,p+4),offset=bytes.readUInt32BE(p+8),length=bytes.readUInt32BE(p+12);
    if(tables.has(tag)||offset<header||offset%4!==0||offset>bytes.length||length>bytes.length-offset)bad('Invalid SFNT table bounds');
    tables.set(tag,bytes.subarray(offset,offset+length));if(length)ranges.push([offset,offset+length]);
  }
  ranges.sort((a,b)=>a[0]-b[0]);if(ranges.some((r,i)=>i>0&&r[0]<ranges[i-1][1]))bad('Overlapping font tables');
  for(const tag of ['head','hhea','hmtx','maxp','cmap','name','OS/2','post'])if(!tables.has(tag))bad('Missing font table: '+tag);
  if(format==='ttf'&&(!tables.has('glyf')||!tables.has('loca'))||format==='otf'&&!tables.has('CFF '))bad('Unsupported outline type');
  if(['fvar','gvar','CFF2','COLR','CPAL','CBDT','CBLC','sbix','SVG ','MATH'].some(t=>tables.has(t)))bad('Variable, color and math fonts are not supported yet');
  const os=tables.get('OS/2'),head=tables.get('head'),names=tables.get('name');
  if(os.length<64||head.length<54||names.length<6||tables.get('cmap').length<4||head.readUInt32BE(12)!==0x5f0f3cf5)bad('Malformed font metadata');
  const weight=os.readUInt16BE(4),fsType=os.readUInt16BE(8),selection=os.readUInt16BE(62);
  if(weight<100||weight>900||selection&0x201||head.readUInt16BE(44)&2)bad('Only upright static font faces (weight 100–900) are supported');
  const count=names.readUInt16BE(2),start=names.readUInt16BE(4);
  if(count>4096||6+count*12>names.length||start<6+count*12||start>names.length)bad('Invalid font name table');
  const values=[];
  for(let i=0;i<count;i++){
    const p=6+i*12,platform=names.readUInt16BE(p),language=names.readUInt16BE(p+4),id=names.readUInt16BE(p+6),length=names.readUInt16BE(p+8),offset=names.readUInt16BE(p+10);
    if(offset+length>names.length-start)bad('Invalid name record bounds');
    if(![1,2,16,17].includes(id)||![0,3].includes(platform)||length%2||length>512)continue;
    const value=new TextDecoder('utf-16be',{fatal:true}).decode(names.subarray(start+offset,start+offset+length)).trim();
    if(label(value))values.push({id,value,score:language===0x411?2:language===0x409?1:0});
  }
  const pick=ids=>{for(const id of ids){const v=values.filter(x=>x.id===id).sort((a,b)=>b.score-a.score)[0];if(v)return v.value;}};
  const family=pick([16,1]),style=pick([17,2]);
  if(!family||!style)bad('No supported Unicode family/subfamily name');
  return {format,family,style,weight,fsType};
}
function permission(v){
  if(!record(v)||v.copyAllowed!==true||typeof v.embedAllowed!=='boolean'||!label(v.license,120)||typeof v.licenseText!=='string'||!v.licenseText.trim()||v.licenseText.length>16000||/[\p{Cs}\u0000]/u.test(v.licenseText))bad('Explicit permission and license text are required');
  return {license:v.license.trim(),licenseText:v.licenseText,copyAllowed:true,embedAllowed:v.embedAllowed};
}
export function fontAlias(id){if(!validHash(id))bad('Invalid font ID');return 'BCFont_'+id;}
export function projectFonts(root){
  const folder=join(root,'fonts','imported');
  async function list({includeBytes=false}={}){
    try{await directory(join(root,'fonts'));await directory(folder);}catch(e){if(e.code==='ENOENT')return [];throw e;}
    const entries=await readdir(folder,{withFileTypes:true});
    if(entries.length>MAX_FACES)bad('Font catalog entry limit exceeded');
    let total=0;const result=[];
    for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
      if(!entry.isDirectory()||!validHash(entry.name))bad('Unexpected font catalog entry');
      const id=entry.name,dir=join(folder,id);
      await directory(dir);
      const m=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await regular(join(dir,'face.json'),64*1024)));
      if(m.schemaVersion!==1||m.id!==id||!['ttf','otf'].includes(m.format))bad('Invalid font catalog metadata');
      const rights=permission(m),bytes=await regular(join(dir,'font.'+m.format),MAX);
      if((total+=bytes.length)>MAX_TOTAL||digest(bytes)!==id)bad('Font catalog hash or size mismatch');
      const meta=inspectStaticFont(bytes);
      if(['format','family','style','weight','fsType'].some(k=>meta[k]!==m[k]))bad('Font metadata mismatch');
      const info={id:'font-'+id,sha256:id,alias:fontAlias(id),...meta,...rights};
      result.push(includeBytes?{...info,bytes}:info);
    }
    return result;
  }
  async function add(path,rights){
    const allowed=permission(rights),ext=extname(path).toLowerCase();
    if(!['.ttf','.otf'].includes(ext))bad('Select a TTF or OTF file');
    const bytes=await regular(path,MAX),meta=inspectStaticFont(bytes),id=digest(bytes);
    if('.'+meta.format!==ext)bad('Font extension does not match format');
    const existing=await list({includeBytes:true});
    const duplicate=existing.find(x=>x.sha256===id);
    if(duplicate)return {duplicate:true,id:duplicate.id};
    if(existing.length>=MAX_FACES||existing.reduce((n,f)=>n+f.bytes.length,0)+bytes.length>MAX_TOTAL)bad('Project font limit exceeded');
    // Restricted-license bit is a conservative copy gate; fsType is not a legal license.
    if(meta.fsType&2)bad('Font declares restricted embedding; import not supported in this prototype');
    await directory(join(root,'fonts'),true);await directory(folder,true);
    const dir=join(folder,id);await mkdir(dir);
    const binary=join(dir,'font.'+meta.format),metadata=join(dir,'face.json');
    const write=async(path,data)=>{const f=await open(path,'wx',0o644);try{await f.writeFile(data);await f.sync();}finally{await f.close();}};
    // Metadata last. Never overwrite; partial writes require explicit manual recovery.
    try{await write(binary,bytes);await write(metadata,JSON.stringify({schemaVersion:1,id,...meta,...allowed},null,2)+'\n');}
    catch(e){bad('Font import incomplete; inspect fonts/imported/'+id+': '+e.message);}
    return {duplicate:false,id:'font-'+id};
  }
  return {list,add};
}
