import {useEffect,useSyncExternalStore} from 'react';
import {reserveLivePreview} from './live-preview-reservation.mjs';

// Preserve the committed effect timing and all original input dependencies.
// App still owns rendering; this adapter owns the automatic reservation.
export function LivePreviewBridge({store,delay,generation,enabled,mode,paperVisible,book,page,order,typography,theme,fonts,blocked,measuring,phase,scope,override,retained,pageCacheEnabled,reusePaperPages,warmRetained,isBlocked,onRender}){
  const snapshot=useSyncExternalStore(store.subscribePreviewInput,store.getPreviewInput);
  useEffect(()=>reserveLivePreview({
    store,snapshot,delay,generation,
    policy:{enabled,mode,paperVisible,hasBook:!!book,hasPage:!!page,blocked,measuring,phase,scope,override},
    retained,warmRetained:(scope,targetFile)=>!pageCacheEnabled&&!reusePaperPages&&warmRetained(scope,targetFile),
    isBlocked,onRender
  }),[store,snapshot,delay,generation,enabled,mode,paperVisible,book,page,order,typography,theme,fonts,blocked,measuring,phase,scope,override,retained,pageCacheEnabled,reusePaperPages]);
  return null;
}
