// Retry only typed transient read conflicts; do not repeat writes or mask
// invalid sessions, corruption or genuine layout errors.
import {performanceMetrics} from './performance-metrics.mjs';
export async function retryPreviewRead(read,{current=()=>true,delays=[100,200,400,800],sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),category}={}){
  const started=performance.now();let retries=0,outcome='failed';
  try{
  const check=()=>{if(!current())throw Object.assign(Error('Preview request superseded'),{code:'PREVIEW_CANCELLED'});};
  for(let attempt=0;;attempt++){
    check();
    try{
      const result=await read();
      check();
      outcome='success';return result;
    }catch(error){
      check();
      if(error?.code!=='PREVIEW_RETRY'||attempt>=delays.length)throw error;
      retries++;await sleep(delays[attempt]);
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
