import {desiredLivePreviewScope,livePreviewWaitMs} from './live-preview-policy.mjs';

// A reservation is valid only for the exact document snapshot and operation
// generation that scheduled it. The existing delay owns timer coalescing.
export function reserveLivePreview({store,snapshot,delay,generation,policy,retained,warmRetained,isBlocked,onRender}){
  const job=generation.current;
  const current=()=>store.getPreviewInput()===snapshot&&generation.current===job;
  const scope=desiredLivePreviewScope({...policy,hasFile:!!snapshot.file});
  if(scope&&current()){
    const wait=livePreviewWaitMs({mode:policy.mode,scope,retained,warmRetained:retained&&warmRetained(scope,snapshot.file)});
    delay.request(()=>{if(current()&&!isBlocked())onRender(scope==='book',snapshot);},wait);
  }
  return ()=>delay.cancel();
}
