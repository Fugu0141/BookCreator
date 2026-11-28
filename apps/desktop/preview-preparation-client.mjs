// One in-flight preparation on the latest-only layout scheduler. Transport
// failures reject; semantic failures remain response values and never retry.
export function createPreparationClient({spawn=()=>new Worker('/preview-preparation-worker.js'),timeoutMs=10000,schedule=setTimeout,unschedule=clearTimeout}={}){
  let worker=null,pending=null,sequence=0;
  function dispose(error){
    const old=worker;worker=null;
    if(old){old.onmessage=old.onerror=old.onmessageerror=null;old.terminate();}
    const job=pending;pending=null;
    if(job){unschedule(job.timer);if(error)job.reject(error);else job.resolve(undefined);}
  }
  function ensure(){
    if(worker)return worker;
    const instance=spawn();worker=instance;
    instance.onmessage=event=>{
      if(worker!==instance)return;
      const job=pending,response=event.data;
      if(!job)return;
      if(!response||response.id!==job.id||!['prepared','error'].includes(response.type)){
        dispose(Error('Invalid preparation worker response'));return;
      }
      pending=null;unschedule(job.timer);job.resolve(response);
    };
    instance.onerror=()=>{if(worker===instance)dispose(Error('Preparation worker failed'));};
    instance.onmessageerror=()=>{if(worker===instance)dispose(Error('Preparation worker message failed'));};
    return instance;
  }
  return {
    prepare(payload,retained){
      if(pending)return Promise.reject(Error('Preparation worker already busy'));
      return new Promise((resolve,reject)=>{
        let instance;
        try{instance=ensure();}catch(e){reject(e);return;}
        const id=++sequence;
        const job={id,resolve,reject,timer:null};pending=job;
        try{
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
