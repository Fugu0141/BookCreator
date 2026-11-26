import {createLayoutRequestGate} from './layout-request-gate.mjs';

// Framework-independent latest-only scheduler. Browser measurement is not
// assumed abortable: finish the running job, then run only the latest queued job.
export function createLayoutScheduler(){
  const gate=createLayoutRequestGate();
  let running=false,pending=null;
  function dropPending(){
    if(pending){pending.resolve(undefined);pending=null;}
  }
  function drain(){
    if(running||!pending)return;
    const entry=pending;
    pending=null;running=true;
    void (async()=>{
      try{
        if(gate.isCurrent(entry.id))entry.resolve(await entry.run(entry.id));
        else entry.resolve(undefined);
      }catch(error){entry.reject(error);}
      finally{running=false;drain();}
    })();
  }
  return {
    submit(run){
      const id=gate.begin();
      dropPending();
      return new Promise((resolve,reject)=>{
        pending={id,run,resolve,reject};
        drain();
      });
    },
    invalidate(){gate.invalidate();dropPending();},
    isCurrent(id){return gate.isCurrent(id);}
  };
}
