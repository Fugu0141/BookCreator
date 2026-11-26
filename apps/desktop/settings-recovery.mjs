// Typed settings snapshots are deliberately separate from manuscript records.
import {recoveryStore,recoveryKey,recoveryStatus} from './manuscript-recovery.mjs';
const kinds=['typography','book-settings'];
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
function checkKind(kind){if(!kinds.includes(kind))fail('RECOVERY_INPUT','Unsupported settings recovery kind');}
function publicCandidate(record,value,status){return {version:record.version,baseRevision:record.baseRevision,updatedAt:record.updatedAt,value,status};}
export function settingsRecovery(userData){
  const store=recoveryStore(userData,'settings');
  // A workspace object is supplied by the main process only.
  async function context(workspace,kind){
    checkKind(kind);
    const base=await workspace.recoverySettings(kind);
    const key=recoveryKey(workspace.manifestPath,kind,base.identity);
    return {key,base};
  }
  async function inspect(workspace,kind){
    const {key,base}=await context(workspace,kind),record=await store.get(key);
    if(!record)return {baseRevision:base.revision,saved:base.value,candidate:null};
    let value;
    try{value=JSON.parse(record.text);}
    catch{fail('RECOVERY_CORRUPT','Invalid settings recovery JSON');}
    const status=recoveryStatus(record,{revision:base.revision,text:JSON.stringify(base.value)});
    let candidateStatus=status;
    // A missing font or a changed manuscript mapping must never silently
    // convert a previous draft into something that can be applied.
    try{
      const normalized=await workspace.validateRecoverySettings(kind,value);
      if(JSON.stringify(normalized)!==record.text)candidateStatus='unsupported';
    }catch{candidateStatus='unsupported';}
    return {baseRevision:base.revision,saved:base.value,candidate:publicCandidate(record,value,candidateStatus)};
  }
  return {
    inspect,
    async put(workspace,kind,baseRevision,value,expectedVersion=null){
      const {key,base}=await context(workspace,kind);
      if(base.revision!==baseRevision)fail('RECOVERY_CONFLICT','Settings baseline changed; reopen before recording');
      const normalized=await workspace.validateRecoverySettings(kind,value);
      const text=JSON.stringify(normalized);
      if(Buffer.byteLength(text,'utf8')>256*1024)fail('RECOVERY_LIMIT','Settings recovery snapshot too large');
      const existing=await store.get(key);
      // Even a valid new draft must not overwrite a candidate from a
      // different revision; it must first be explicitly resolved.
      if(existing&&existing.baseRevision!==baseRevision)fail('RECOVERY_CONFLICT','Resolve the previous settings recovery candidate first');
      const record=await store.put(key,{baseRevision,text},expectedVersion);
      return publicCandidate(record,normalized,'recoverable');
    },
    async remove(workspace,kind,expectedVersion){
      const {key}=await context(workspace,kind);
      return store.remove(key,expectedVersion);
    }
  };
}
