import {createLayoutRequestGate} from './layout-request-gate.mjs';

// Framework-independent latest-only scheduler. Browser measurement is not
// assumed abortable: signal supersession, but retain the active slot until its
// callback actually settles. Only the latest queued job may then run.
export function createLayoutScheduler({scheduleHandoff=fn=>setTimeout(fn,0)}={}){
  const gate=createLayoutRequestGate();
  let running=false,pending=null,handoff=false,activeController=null;
  function dropPending(){
    if(pending){pending.resolve(undefined);pending=null;}
  }
  function drain(){
    if(running||handoff||!pending)return;
    const entry=pending;
    pending=null;running=true;
    const controller=new AbortController();activeController=controller;
    void (async()=>{
      try{
        if(gate.isCurrent(entry.id))entry.resolve(await entry.run(entry.id,controller.signal));
        else entry.resolve(undefined);
      }catch(error){entry.reject(error);}
      finally{
        activeController=null;running=false;
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
      activeController?.abort();
      dropPending();
      return new Promise((resolve,reject)=>{
        pending={id,run,resolve,reject};
        drain();
      });
    },
    invalidate(){gate.invalidate();activeController?.abort();dropPending();},
    isCurrent(id){return gate.isCurrent(id);}
  };
}
