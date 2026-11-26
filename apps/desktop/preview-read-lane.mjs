// Read-only background work never owns the foreground workspace lock.
// A foreground operation invalidates any overlapping snapshot, even if it fails.
export function createPreviewReadLane(){
  let epoch=0,active=null;
  const conflict=()=>Object.assign(Error('Preview snapshot superseded; retry after the workspace operation'),{code:'PREVIEW_RETRY'});
  return {
    invalidate(){epoch++;},
    async read(identity,validate,load){
      const version=epoch;
      if(!validate())throw conflict();
      // At most one physical read. Equal requests can share its immutable result.
      if(active&&(active.version!==version||active.identity!==identity))throw conflict();
      if(!active){
        const entry={version,identity,promise:null};
        active=entry;
        entry.promise=Promise.resolve().then(()=>{
          if(epoch!==version||!validate())throw conflict();
          return load();
        }).finally(()=>{if(active===entry)active=null;});
      }
      const result=await active.promise;
      if(epoch!==version||!validate())throw conflict();
      return result;
    }
  };
}
