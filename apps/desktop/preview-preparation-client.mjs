// One in-flight preparation on the latest-only layout scheduler. Transport
// failures reject; semantic failures remain response values and never retry.
// Validate the transport envelope before passing values to renderer code.
// The engine still owns semantic validation of layout options and diagnostics.
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const count=value=>Number.isSafeInteger(value)&&value>=0;
function validResponse(response,job){
  if(!record(response)||response.id!==job.id)return false;
  if(response.type==='error')return record(response.error)&&typeof response.error.message==='string'&&(response.error.code===undefined||typeof response.error.code==='string');
  if(response.type!=='prepared'||!record(response.prepared)||!Array.isArray(response.prepared.diagnostics)||!Number.isFinite(response.preparationMs)||response.preparationMs<0)return false;
  const {options}=response.prepared;
  if(options!==undefined&&options!==null&&(!record(options)||!Array.isArray(options.sections)||options.revision!==job.rev||options.fingerprint!==job.fingerprint))return false;
  if(!job.retained)return response.work===null;
  const {work}=response;
  return record(work)&&record(work.scan)&&record(work.inline)&&
    ['hits','misses'].every(k=>count(work.scan[k]))&&
    ['hits','misses','bypasses'].every(k=>count(work.inline[k]));
}
export function createPreparationClient({spawn=()=>new Worker('/preview-preparation-worker.js'),timeoutMs=10000,schedule=setTimeout,unschedule=clearTimeout}={}){
  let worker=null,pending=null,sequence=0;
  function release(job){
    unschedule(job.timer);job.signal?.removeEventListener('abort',job.abort);
  }
  function dispose(error){
    const old=worker;worker=null;
    if(old){old.onmessage=old.onerror=old.onmessageerror=null;old.terminate();}
    const job=pending;pending=null;
    if(job){release(job);if(error)job.reject(error);else job.resolve(undefined);}
  }
  function ensure(){
    if(worker)return worker;
    const instance=spawn();worker=instance;
    instance.onmessage=event=>{
      if(worker!==instance)return;
      const job=pending,response=event.data;
      if(!job)return;
      if(!validResponse(response,job)){
        dispose(Error('Invalid preparation worker response'));return;
      }
      pending=null;release(job);job.resolve(response);
    };
    instance.onerror=()=>{if(worker===instance)dispose(Error('Preparation worker failed'));};
    instance.onmessageerror=()=>{if(worker===instance)dispose(Error('Preparation worker message failed'));};
    return instance;
  }
  return {
    prepare(payload,retained,signal){
      if(signal?.aborted)return Promise.resolve(undefined);
      if(pending)return Promise.reject(Error('Preparation worker already busy'));
      return new Promise((resolve,reject)=>{
        let instance;
        try{instance=ensure();}catch(e){reject(e);return;}
        const id=++sequence;
        const job={id,resolve,reject,timer:null,retained,signal,rev:payload.input?.rev,fingerprint:payload.input?.fingerprint};pending=job;
        // The synchronous worker parser cannot process an in-band cancel while busy.
        // Terminate only an in-flight obsolete job; idle workers retain their caches.
        job.abort=()=>{if(pending===job)dispose();};
        try{
          signal?.addEventListener('abort',job.abort,{once:true});
          if(signal?.aborted){job.abort();return;}
          job.timer=schedule(()=>{if(pending===job)dispose(Error('Preparation worker timed out'));},timeoutMs);
          instance.postMessage({...payload,type:'prepare',id,retained});
        }catch(e){dispose(e);}
      });
    },
    // A book/session reset must remove both work and cached source, including
    // messages queued before the reset. A fresh worker starts on demand.
    reset(){dispose();}
  };
}
