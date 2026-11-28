import {areaPercentFromDrag} from './component-area-drag.mjs';
import {MAX_PAPER_TRAILING_SPACE} from './paper-area-store.mjs';

// These are IL minimum occupied dimensions, not the width of measured text.
// Only explicit user intent is returned; measured geometry is never persisted.
const keys={width:'minWidthPercent',height:'minHeightPercent'};
const validId=v=>typeof v==='string'&&v.length>0;
const sameTarget=(a,b)=>a&&b&&a.documentId===b.documentId&&a.blockKey===b.blockKey&&a.revision===b.revision&&a.fingerprint===b.fingerprint;
export function canEditPaperArea(target,current){
  return !!(sameTarget(target,current)&&validId(target.documentId)&&validId(target.blockKey)&&validId(target.revision)&&validId(target.fingerprint)&&target.fragmentCount===1&&current.fragmentCount===1);
}
const percent=v=>Number.isSafeInteger(v)&&v>=0&&v<=100;
export function planPaperAreaIntent({target,current,placement={},axis,value}){
  if(!canEditPaperArea(target,current))throw Error('最新の単一断片を選択してください。');
  const key=Object.hasOwn(keys,axis)?keys[axis]:null;
  if(!key||!percent(value))throw RangeError('Invalid occupied area percent');
  if(placement.mode==='fixed'||placement.fixed)throw Error('固定配置の占有領域は変更できません。');
  const constraints={...placement.sizeConstraints};
  if((constraints[key]??0)===value)return null;
  if(value===0)delete constraints[key];else constraints[key]=value;
  const next={...placement};
  if(Object.keys(constraints).length)next.sizeConstraints=constraints;else delete next.sizeConstraints;
  return {documentId:target.documentId,blockKey:target.blockKey,placement:next};
}

/** Pointer movement is expressed in CSS pixels; all percent calculations
 * refer to the full page body, not the current block or screen zoom. */
export function beginPaperAreaDrag({target,current,placement={},axis,occupiedPx,bodyPx,originPx}){
  if(!canEditPaperArea(target,current)||!Object.hasOwn(keys,axis)||placement.mode==='fixed'||placement.fixed)return null;
  if(![occupiedPx,bodyPx,originPx].every(Number.isFinite)||bodyPx<=0||occupiedPx<=0||occupiedPx>bodyPx)return null;
  const start=occupiedPx/bodyPx*100;
  return {target:{...target},axis,start,bodyPx,originPx,initial:Math.max(1,Math.min(100,Math.round(start)))};
}
export function previewPaperAreaDrag(gesture,pointerPx){
  if(!gesture||!Number.isFinite(pointerPx))return null;
  const delta=pointerPx-gesture.originPx;
  const value=areaPercentFromDrag(gesture.start,delta,gesture.bodyPx);
  return {value,extentPx:value*gesture.bodyPx/100,changed:Math.abs(delta)>=2&&value!==gesture.initial};
}
export function finishPaperAreaDrag(gesture,{current,placement,pointerPx,cancelled=false}){
  if(cancelled||!gesture||!canEditPaperArea(gesture.target,current))return null;
  const preview=previewPaperAreaDrag(gesture,pointerPx);
  if(!preview?.changed)return null;
  return planPaperAreaIntent({target:gesture.target,current,placement,axis:gesture.axis,value:preview.value});
}


// Gap gestures use physical micrometres, not occupied-height percentages.
// Zero is a valid starting point, and no layout or saved state is changed here.
export function beginPaperGapDrag({target,current,placement={},value=0,bodyPx,bodyHeight,originPx,side='after'}){
  if(!canEditPaperArea(target,current)||placement.mode==='fixed'||placement.fixed)return null;
  if(!Number.isSafeInteger(bodyHeight)||bodyHeight<=0||!Number.isFinite(bodyPx)||bodyPx<=0||!Number.isFinite(originPx)||!Number.isSafeInteger(value)||value<0||value>MAX_PAPER_TRAILING_SPACE)return null;
  if(side!=='before'&&side!=='after')return null;
  const max=Math.floor(Math.min(bodyHeight,MAX_PAPER_TRAILING_SPACE)/1000)*1000;
  if(value>max)return null;
  return {target:{...target},value,bodyPx,bodyHeight,originPx,max,side};
}
export function previewPaperGapDrag(gesture,pointerPx){
  if(!gesture||!Number.isFinite(pointerPx))return null;
  const delta=pointerPx-gesture.originPx;
  const value=Math.max(0,Math.min(gesture.max,Math.round((gesture.value+(gesture.side==='before'?-delta:delta)/gesture.bodyPx*gesture.bodyHeight)/1000)*1000));
  return {value,extentPx:value/gesture.bodyHeight*gesture.bodyPx,changed:Math.abs(delta)>=2&&value!==gesture.value};
}
export function finishPaperGapDrag(gesture,{current,placement={},pointerPx,cancelled=false}){
  if(cancelled||!gesture||!canEditPaperArea(gesture.target,current)||placement.mode==='fixed'||placement.fixed)return null;
  const proposal=previewPaperGapDrag(gesture,pointerPx);
  return proposal?.changed?proposal.value:null;
}
