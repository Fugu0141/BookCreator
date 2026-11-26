// A component work-in-progress is not a registered component or binding.
import {createHash} from 'node:crypto';
import {recoveryStore,recoveryKey} from './manuscript-recovery.mjs';
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
// Canonical field order is part of the persisted identity contract.
export function componentRecoveryKey(manifestPath,themePath,{usage,level,entryId}){
  const identity=createHash('sha256').update(JSON.stringify({usage,level,entryId})).digest('hex');
  return recoveryKey(manifestPath,'component-'+identity,themePath);
}
export function componentRecovery(userData){
  const store=recoveryStore(userData,'components');
  async function context(workspace,target){
    const base=await workspace.componentRecoveryContext(target);
    const key=componentRecoveryKey(workspace.manifestPath,base.identity,base.target);
    return {base,key};
  }
  function candidate(record,value,status){return {version:record.version,baseRevision:record.baseRevision,updatedAt:record.updatedAt,value,status};}
  return {
    async inspect(workspace,target){
      const {base,key}=await context(workspace,target),record=await store.get(key);
      if(!record)return {baseRevision:base.revision,available:base.available,candidate:null};
      let value;
      try{value=JSON.parse(record.text);}catch{fail('RECOVERY_CORRUPT','Invalid component recovery JSON');}
      let status=base.revision===record.baseRevision?'recoverable':'diverged';
      try{
        const normalized=await workspace.validateComponentRecovery(base.target,value);
        if(JSON.stringify(normalized)!==record.text)status='unsupported';
      }catch{status='unsupported';}
      return {baseRevision:base.revision,available:base.available,candidate:candidate(record,value,status)};
    },
    async put(workspace,target,baseRevision,value,expectedVersion=null){
      const {base,key}=await context(workspace,target);
      if(!base.available||base.revision!==baseRevision)fail('RECOVERY_CONFLICT','Component target or theme revision changed');
      const normalized=await workspace.validateComponentRecovery(base.target,value),text=JSON.stringify(normalized);
      if(Buffer.byteLength(text,'utf8')>256*1024)fail('RECOVERY_LIMIT','Component recovery draft too large');
      const existing=await store.get(key);
      if(existing&&existing.baseRevision!==baseRevision)fail('RECOVERY_CONFLICT','Resolve previous component recovery draft first');
      const record=await store.put(key,{baseRevision,text},expectedVersion);
      return candidate(record,normalized,'recoverable');
    },
    async remove(workspace,target,expectedVersion){
      const {key}=await context(workspace,target);
      return store.remove(key,expectedVersion);
    }
  };
}
