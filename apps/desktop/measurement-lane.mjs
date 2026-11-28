import {performanceMetrics} from './performance-metrics.mjs';
// Shared physical measurement lane for all renderer surfaces.
// Foreground jobs take precedence over catalog jobs; stale queued work is skipped.
export function createMeasurementLane({now=()=>performance.now(),report=()=>{}}={}){
  let running=false;
  const queue=[];
  function finish(entry,outcome,started=now()){
    report({stage:'measurement',category:entry.category,outcome,waitMs:started-entry.queuedAt,runMs:outcome==='cancelled'&&!entry.started?0:now()-started});
  }
  function detach(entry){entry.signal?.removeEventListener('abort',entry.abort);}
  function cancel(entry){detach(entry);finish(entry,'cancelled');entry.resolve(undefined);}
  function drain(){
    if(running)return;
    while(queue.length){
      const index=queue.findIndex(e=>e.priority==='foreground');
      const entry=queue.splice(index<0?0:index,1)[0];
      if(!entry.current()){cancel(entry);continue;}
      // Once started, keep physical exclusivity until the callback settles.
      detach(entry);running=true;
      const started=now();entry.started=true;
      void (async()=>{
        try{
          const result=await entry.run();
          const current=entry.current();
          finish(entry,current?'success':'cancelled',started);
          entry.resolve(current?result:undefined);
        }catch(error){
          const current=entry.current();
          finish(entry,current?'failed':'cancelled',started);
          if(current)entry.reject(error);else entry.resolve(undefined);
        }finally{running=false;drain();}
      })();
      return;
    }
  }
  return {
    run(run,{current=()=>true,priority='foreground',category='other',signal}={}){
      const queuedAt=now();
      for(let i=queue.length-1;i>=0;i--)if(!queue[i].current())cancel(queue.splice(i,1)[0]);
      return new Promise((resolve,reject)=>{
        const entry={run,current:()=>!signal?.aborted&&current(),priority,category,queuedAt,resolve,reject,signal};
        entry.abort=()=>{
          const index=queue.indexOf(entry);
          if(index>=0){queue.splice(index,1);cancel(entry);drain();}
        };
        if(!entry.current()){cancel(entry);return;}
        queue.push(entry);
        signal?.addEventListener('abort',entry.abort,{once:true});
        if(signal?.aborted){entry.abort();return;}
        drain();
      });
    }
  };
}
export const measurementLane=createMeasurementLane({report:row=>performanceMetrics.record(row)});
