// Retry only typed transient read conflicts; do not repeat writes or mask
// invalid sessions, corruption or genuine layout errors.
export async function retryPreviewRead(read,{current=()=>true,delays=[100,200,400,800],sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  const check=()=>{if(!current())throw Object.assign(Error('Preview request superseded'),{code:'PREVIEW_CANCELLED'});};
  for(let attempt=0;;attempt++){
    check();
    try{
      const result=await read();
      check();
      return result;
    }catch(error){
      check();
      if(error?.code!=='PREVIEW_RETRY'||attempt>=delays.length)throw error;
      await sleep(delays[attempt]);
    }
  }
}
export async function unwrapIpc(promise){
  const response=await promise;
  if(!response.ok)throw Object.assign(Error(response.error.code+': '+response.error.message),{code:response.error.code});
  return response.value;
}
