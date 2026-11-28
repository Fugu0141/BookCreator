// Retry only typed transient read conflicts; do not repeat writes or mask
// invalid sessions, corruption or genuine layout errors.
import {performanceMetrics} from './performance-metrics.mjs';
const cancelled=()=>Object.assign(Error('Preview request superseded'),{code:'PREVIEW_CANCELLED'});
// Only the backoff timer is abortable. An IPC already dispatched must settle
// before its caller releases the physical lane; its stale result is discarded.
function sleepForRetry(ms,signal){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(cancelled());return;}
    const cleanup=()=>signal?.removeEventListener('abort',abort);
    const abort=()=>{clearTimeout(timer);cleanup();reject(cancelled());};
    const timer=setTimeout(()=>{cleanup();resolve();},ms);
    signal?.addEventListener('abort',abort,{once:true});
  });
}
export async function retryPreviewRead(read,{current=()=>true,delays=[100,200,400,800],sleep=sleepForRetry,category,signal}={}){
  const started=performance.now();let retries=0,outcome='failed';
  try{
  const check=()=>{if(signal?.aborted||!current())throw cancelled();};
  for(let attempt=0;;attempt++){
    check();
    try{
      const result=await read();
      check();
      outcome='success';return result;
    }catch(error){
      check();
      if(error?.code!=='PREVIEW_RETRY'||attempt>=delays.length)throw error;
      retries++;await sleep(delays[attempt],signal);
    }
  }
  }catch(error){if(error?.code==='PREVIEW_CANCELLED')outcome='cancelled';throw error;}
  finally{if(category)performanceMetrics.record({stage:'read',category,outcome,runMs:performance.now()-started,retries});}
}
export async function unwrapIpc(promise){
  const response=await promise;
  if(!response.ok)throw Object.assign(Error(response.error.code+': '+response.error.message),{code:response.error.code});
  return response.value;
}
