import {createLayoutRequestGate} from './layout-request-gate.mjs';

// Framework-independent latest-only scheduler. Browser measurement is not
// assumed abortable: finish the running job, then run only the latest queued job.
export function createLayoutScheduler({scheduleHandoff=fn=>setTimeout(fn,0)}={}){
  const gate=createLayoutRequestGate();
  let running=false,pending=null,handoff=false;
  function dropPending(){
    if(pending){pending.resolve(undefined);pending=null;}
  }
  function drain(){
    if(running||handoff||!pending)return;
    const entry=pending;
    pending=null;running=true;
    void (async()=>{
      try{
        if(gate.isCurrent(entry.id))entry.resolve(await entry.run(entry.id));
        else entry.resolve(undefined);
      }catch(error){entry.reject(error);}
      finally{
        running=false;
        // An idle first request starts immediately. Only a queued successor
        // waits for a real task boundary, allowing newer input to supersede it.
        if(pending){
          handoff=true;
          scheduleHandoff(()=>{handoff=false;drain();});
        }
      }
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
