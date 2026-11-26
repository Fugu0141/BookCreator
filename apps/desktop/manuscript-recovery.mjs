// Local, private recovery snapshots. This module never reads or writes a manuscript.
// All callers must supply identities derived by the main process, never renderer paths.
import {mkdir,lstat,realpath,open,rename,unlink,readdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

const MAX_TEXT=4*1024*1024,MAX_RECORD=24*1024*1024,MAX_TOTAL=64*1024*1024,MAX_ENTRIES=128;
const sha=value=>createHash('sha256').update(value).digest('hex');
const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const validSection=value=>typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(value);
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export function recoveryKey(manifestPath,sectionId,sectionPath){
  if(typeof manifestPath!=='string'||!isAbsolute(manifestPath)||manifestPath.length>4096||!validSection(sectionId)||typeof sectionPath!=='string'||!sectionPath||sectionPath.length>1024)fail('RECOVERY_INPUT','Invalid recovery identity');
  // Include the manuscript mapping so a reused section ID cannot silently restore
  // a draft into a different manuscript. The paths are not stored in the record.
  return sha(JSON.stringify([manifestPath,sectionId,sectionPath]));
}
function validateDraft(value){
  if(!isRecord(value)||!validHash(value.baseRevision)||typeof value.text!=='string'||value.text.length>MAX_TEXT||Buffer.byteLength(value.text,'utf8')>MAX_TEXT||/\r|[\p{Cs}\u0000]/u.test(value.text))fail('RECOVERY_INPUT','Invalid recovery draft');
}
function validateRecord(value,key){
  if(!isRecord(value)||value.schemaVersion!==1||value.key!==key||!validHash(value.version)||typeof value.updatedAt!=='string'||!Number.isFinite(Date.parse(value.updatedAt)))fail('RECOVERY_CORRUPT','Invalid recovery record');
  validateDraft(value);
  if(value.version!==sha(JSON.stringify([value.key,value.baseRevision,value.text,value.updatedAt,value.nonce]))||typeof value.nonce!=='string'||!/^[a-f0-9-]{36}$/.test(value.nonce))fail('RECOVERY_CORRUPT','Recovery integrity mismatch');
  return value;
}
function validateKey(key){if(!validHash(key))fail('RECOVERY_INPUT','Invalid recovery key');}
function validateVersion(version){if(version!==null&&!validHash(version))fail('RECOVERY_INPUT','Invalid recovery version');}
export function recoveryStore(userData){
  // Serialize compare-and-swap operations within the single main process.
  let tail=Promise.resolve();
  function serial(fn){const next=tail.then(fn);tail=next.catch(()=>{});return next;}
  async function directory(){
    const parent=await realpath(userData),dir=join(parent,'manuscript-recovery-v1');
    await mkdir(dir,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});
    const st=await lstat(dir);
    if(!st.isDirectory()||st.isSymbolicLink()||await realpath(dir)!==dir)fail('RECOVERY_PATH','Unsafe recovery directory');
    return dir;
  }
  async function read(dir,key){
    const path=join(dir,key+'.json');
    try{
      const st=await lstat(path);
      if(!st.isFile()||st.isSymbolicLink()||st.size>MAX_RECORD)fail('RECOVERY_PATH','Unsafe recovery file');
      const file=await open(path,constants.O_RDONLY|constants.O_NONBLOCK|(constants.O_NOFOLLOW??0));
      try{
        const current=await file.stat();
        if(!current.isFile()||current.size>MAX_RECORD)fail('RECOVERY_PATH','Unsafe recovery file');
        const bytes=Buffer.alloc(MAX_RECORD+1);let used=0;
        while(used<bytes.length){const {bytesRead}=await file.read(bytes,used,bytes.length-used,null);if(!bytesRead)break;used+=bytesRead;}
        if(used>MAX_RECORD)fail('RECOVERY_LIMIT','Recovery record too large');
        return validateRecord(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,used))),key);
      }finally{await file.close();}
    }catch(e){if(e.code==='ENOENT')return null;throw e;}
  }
  async function quota(dir,key,bytes){
    let count=1,total=bytes;
    for(const entry of await readdir(dir,{withFileTypes:true})){
      if(!/^[a-f0-9]{64}\.json$/.test(entry.name)||entry.name===key+'.json')continue;
      const st=await lstat(join(dir,entry.name));
      if(!st.isFile()||st.isSymbolicLink())fail('RECOVERY_PATH','Unsafe recovery entry');
      count++;total+=st.size;
      if(count>MAX_ENTRIES||total>MAX_TOTAL)fail('RECOVERY_LIMIT','Recovery storage full; resolve existing drafts first');
    }
  }
  function checkExpected(current,expected){
    if((current?.version??null)!==expected)fail('RECOVERY_CONFLICT','Recovery draft has changed; reload before replacing or removing it');
  }
  return {
    get(key){return serial(async()=>{validateKey(key);return read(await directory(),key);});},
    put(key,draft,expectedVersion=null){return serial(async()=>{
      validateKey(key);validateDraft(draft);validateVersion(expectedVersion);
      const dir=await directory(),current=await read(dir,key);checkExpected(current,expectedVersion);
      if(current?.baseRevision===draft.baseRevision&&current.text===draft.text)return current;
      const updatedAt=new Date().toISOString(),nonce=randomUUID(),version=sha(JSON.stringify([key,draft.baseRevision,draft.text,updatedAt,nonce]));
      const record={schemaVersion:1,key,baseRevision:draft.baseRevision,text:draft.text,updatedAt,nonce,version};
      const bytes=Buffer.from(JSON.stringify(record),'utf8');
      if(bytes.length>MAX_RECORD)fail('RECOVERY_LIMIT','Recovery record too large');
      await quota(dir,key,bytes.length);
      const temp=join(dir,'.recovery-'+randomUUID()+'.tmp');
      try{
        const file=await open(temp,'wx',0o600);
        try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
        await rename(temp,join(dir,key+'.json'));
      }finally{await unlink(temp).catch(()=>{});}
      return record;
    });},
    remove(key,expectedVersion){return serial(async()=>{
      validateKey(key);validateVersion(expectedVersion);
      const dir=await directory(),current=await read(dir,key);checkExpected(current,expectedVersion);
      if(current)await unlink(join(dir,key+'.json'));
      return !!current;
    });}
  };
}
// A divergent base must never be automatically applied over the saved manuscript.
export function recoveryStatus(record,saved){
  if(!record)return 'none';
  validateDraft(record);
  if(!isRecord(saved)||!validHash(saved.revision)||typeof saved.text!=='string')fail('RECOVERY_INPUT','Invalid saved manuscript');
  if(record.text===saved.text)return 'already-saved';
  return record.baseRevision===saved.revision?'recoverable':'diverged';
}
