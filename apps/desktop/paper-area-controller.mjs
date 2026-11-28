import {bindPaperAreaDocument,createPaperAreaDraft} from './paper-area-store.mjs';
import {beginPaperAreaDrag,previewPaperAreaDrag,finishPaperAreaDrag} from './paper-area-intent.mjs';

// currentPlan is a host-provided function, returning only the latest complete
// successful plan (not an old retained preview). Its fragment inventory must
// cover the entire document scope. No DOM or disk IO belongs here.
export function createPaperAreaController(initial,currentPlan){
  const draft=createPaperAreaDraft(initial);
  const resolve=selection=>{
    const plan=currentPlan();
    if(!selection||!plan||selection.revision!==plan.revision||selection.fingerprint!==plan.fingerprint||!Array.isArray(plan.fragments))return null;
    const matches=plan.fragments.filter(f=>f.origin?.documentId===selection.documentId&&f.origin?.blockKey===selection.blockKey);
    if(matches.length!==1)return null;
    const origin=matches[0].origin,persistentId=origin.persistentId;
    if(typeof persistentId!=='string'||!persistentId)return null;
    const sameIdentity=plan.fragments.filter(f=>f.origin?.documentId===origin.documentId&&f.origin?.persistentId===persistentId);
    if(sameIdentity.length!==1)return null;
    const target={documentId:origin.documentId,blockKey:origin.blockKey,revision:plan.revision,fingerprint:plan.fingerprint,fragmentCount:1};
    const snapshot=draft.snapshot();
    const stored=snapshot.document.entries.find(e=>e.documentId===origin.documentId&&e.persistentId===persistentId);
    const placement={...matches[0].placement};
    // Existing position/spacing and unrelated constraints are not replaced.
    // The draft, not measured extents, is the source of truth for area edits.
    const sizeConstraints={...placement.sizeConstraints};
    delete sizeConstraints.minWidthPercent;delete sizeConstraints.minHeightPercent;
    for(const k of ['minWidthPercent','minHeightPercent'])if(stored&&Object.hasOwn(stored,k))sizeConstraints[k]=stored[k];
    placement.sizeConstraints=sizeConstraints;
    return {target,persistentId,placement,snapshot};
  };
  return {
    snapshot:draft.snapshot,
    begin(selection,geometry){
      const selected=resolve(selection);
      if(!selected)return null;
      const gesture=beginPaperAreaDrag({...geometry,target:selected.target,current:selected.target,placement:selected.placement});
      return gesture?{gesture,persistentId:selected.persistentId,lease:selected.snapshot.version}:null;
    },
    preview(handle,pointerPx){return handle?previewPaperAreaDrag(handle.gesture,pointerPx):null;},
    finish(handle,pointerPx,cancelled=false){
      if(!handle||cancelled)return null;
      const selected=resolve(handle.gesture.target);
      if(!selected||selected.persistentId!==handle.persistentId||selected.snapshot.version!==handle.lease)return null;
      const next=finishPaperAreaDrag(handle.gesture,{current:selected.target,placement:selected.placement,pointerPx});
      if(!next)return null;
      const axis=handle.gesture.axis,key=axis==='width'?'minWidthPercent':'minHeightPercent';
      return draft.apply({documentId:selected.target.documentId,persistentId:selected.persistentId,axis,value:next.placement.sizeConstraints?.[key]??0},handle.lease);
    },
    clear(selection,axis,lease){
      const selected=resolve(selection);
      if(!selected||selected.snapshot.version!==lease||selected.placement.mode==='fixed'||selected.placement.fixed)return null;
      return draft.apply({documentId:selected.target.documentId,persistentId:selected.persistentId,axis,value:0},lease);
    },
    undo:draft.undo,redo:draft.redo,markSaved:draft.markSaved,
    // Return proposals for the current complete inventory; never publish
    // them as successful layout until IL has independently accepted them.
    bind(){const plan=currentPlan();return plan?bindPaperAreaDocument(draft.snapshot().document,plan.fragments):null;}
  };
}
