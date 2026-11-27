import {useEffect,useSyncExternalStore} from 'react';
import {syncConfirmedRecovery} from './manuscript-recovery-sync.mjs';

// Keep recovery updates in the committed React lifecycle. The workspace still
// owns the controller and candidate dialog, but no longer drives this effect
// through its manuscript subscription.
export function ManuscriptRecoveryBridge({store,controllerRef,candidate,isComposing,structuredComposing}){
  const snapshot=useSyncExternalStore(store.subscribeRecovery,store.getRecovery);
  useEffect(()=>{
    syncConfirmedRecovery(store,snapshot,controllerRef.current,{candidate,isComposing,structuredComposing});
  },[store,snapshot,controllerRef,candidate,isComposing,structuredComposing]);
  return null;
}
