// Shared physical measurement lane for all renderer surfaces.
// Foreground jobs take precedence over catalog jobs; stale queued work is skipped.
export function createMeasurementLane(){
  let running=false;
  const queue=[];
  function drain(){
    if(running)return;
    while(queue.length){
      const index=queue.findIndex(e=>e.priority==='foreground');
      const entry=queue.splice(index<0?0:index,1)[0];
      if(!entry.current()){entry.resolve(undefined);continue;}
      running=true;
      void (async()=>{
        try{
          const result=await entry.run();
          entry.resolve(entry.current()?result:undefined);
        }catch(error){if(entry.current())entry.reject(error);else entry.resolve(undefined);}
        finally{running=false;drain();}
      })();
      return;
    }
  }
  return {
    run(run,{current=()=>true,priority='foreground'}={}){
      // Prune invalid jobs immediately as new work arrives.
      for(let i=queue.length-1;i>=0;i--)if(!queue[i].current())queue.splice(i,1)[0].resolve(undefined);
      return new Promise((resolve,reject)=>{queue.push({run,current,priority,resolve,reject});drain();});
    }
  };
}
export const measurementLane=createMeasurementLane();
