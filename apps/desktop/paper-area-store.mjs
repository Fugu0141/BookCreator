// Persist only explicit area intent, never a measured blockKey (currently a
// source offset), revision, geometry, or the result of automatic layout.
const sizeFields=['minWidthPercent','minHeightPercent'];
const fields=[...sizeFields,'spaceAfter','spaceBefore'];
const positionFields=['page','x','y'];
const axisFields={width:'minWidthPercent',height:'minHeightPercent',gap:'spaceAfter',before:'spaceBefore'};
export const MAX_PAPER_TRAILING_SPACE=1000000; // micrometres (1 m), also bounded by IL page height
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const id=v=>typeof v==='string'&&v.length>0&&v.length<=256&&!/[\u0000-\u001f\u007f]/.test(v);
const key=(documentId,persistentId)=>JSON.stringify([documentId,persistentId]);
const percent=v=>Number.isSafeInteger(v)&&v>=1&&v<=100;
const invalid=()=>{throw Error('Invalid paper area document');};
// Absolute physical page index (zero-based) and body-relative integer µm.
// This is explicit user intent, not a cached measured placement.
function fixedPosition(value){
  if(!record(value)||Object.keys(value).length!==3||positionFields.some(k=>!Object.hasOwn(value,k)||!Number.isSafeInteger(value[k])||value[k]<0||value[k]>(k==='page'?9999:1000000000)))invalid();
  return Object.freeze({page:value.page,x:value.x,y:value.y});
}
export function validatePaperAreaDocument(value){
  if(!record(value)||Object.keys(value).length!==2||!Object.hasOwn(value,'schemaVersion')||!Object.hasOwn(value,'entries')||value.schemaVersion!==1||!Array.isArray(value.entries)||value.entries.length>10000)invalid();
  const seen=new Set(),entries=value.entries.map(entry=>{
    if(!record(entry)||!id(entry.documentId)||!id(entry.persistentId)||Object.keys(entry).some(k=>!['documentId','persistentId',...fields,'bookFixed'].includes(k)))invalid();
    const k=key(entry.documentId,entry.persistentId);
    if(seen.has(k))invalid();seen.add(k);
    const clean={documentId:entry.documentId,persistentId:entry.persistentId};
    for(const field of fields)if(Object.hasOwn(entry,field)){
      if(!(!sizeFields.includes(field)?Number.isSafeInteger(entry[field])&&entry[field]>0&&entry[field]<=MAX_PAPER_TRAILING_SPACE:percent(entry[field])))invalid();clean[field]=entry[field];
    }
    if(Object.hasOwn(entry,'bookFixed'))clean.bookFixed=fixedPosition(entry.bookFixed);
    if(Object.keys(clean).length===2)invalid();
    return Object.freeze(clean);
  });
  entries.sort((a,b)=>{const x=key(a.documentId,a.persistentId),y=key(b.documentId,b.persistentId);return x<y?-1:x>y?1:0;});
  return Object.freeze({schemaVersion:1,entries:Object.freeze(entries)});
}
export function encodePaperAreaDocument(value){
  return JSON.stringify(validatePaperAreaDocument(value),null,2)+'\n';
}
export function decodePaperAreaDocument(text){
  if(typeof text!=='string'||text.length>8000000)invalid();
  return validatePaperAreaDocument(JSON.parse(text));
}
export function setPaperAreaValue(document,{documentId,persistentId,axis,value}){
  const current=validatePaperAreaDocument(document);
  const field=Object.hasOwn(axisFields,axis)?axisFields[axis]:null;
  if(!id(documentId)||!id(persistentId)||!field||!Number.isSafeInteger(value)||value<0||value>(!sizeFields.includes(field)?MAX_PAPER_TRAILING_SPACE:100))invalid();
  const entries=current.entries.slice(),at=entries.findIndex(e=>e.documentId===documentId&&e.persistentId===persistentId);
  const entry=at<0?{documentId,persistentId}:{...entries[at]};
  if(entry.bookFixed)throw Error('固定位置を解除してから占有領域を変更してください。');
  if((entry[field]??0)===value)return current;
  if(value===0)delete entry[field];else entry[field]=value;
  if(at>=0)entries.splice(at,1);
  if(fields.some(f=>Object.hasOwn(entry,f)))entries.push(entry);
  return validatePaperAreaDocument({schemaVersion:1,entries});
}
// Apply a multi-field GUI proposal atomically in memory before any disk write.
export function setPaperAreaValues(document,{documentId,persistentId,values}){
  if(!record(values)||!Object.keys(values).length||Object.keys(values).some(k=>!Object.hasOwn(axisFields,k)))invalid();
  let next=validatePaperAreaDocument(document);
  for(const axis of Object.keys(axisFields))if(Object.hasOwn(values,axis)){
    next=setPaperAreaValue(next,{documentId,persistentId,axis,value:values[axis]});
  }
  return next;
}
// Lock/unlock never discards existing explicit dimensions or whitespace.
// The engine must independently accept their combination with the hard lock.
export function setBookPaperFixed(document,{documentId,persistentId,position}){
  const current=validatePaperAreaDocument(document);
  if(!id(documentId)||!id(persistentId)||position===undefined)invalid();
  const entries=current.entries.slice(),at=entries.findIndex(e=>e.documentId===documentId&&e.persistentId===persistentId);
  const entry=at<0?{documentId,persistentId}:{...entries[at]};
  if(position===null)delete entry.bookFixed;else entry.bookFixed=fixedPosition(position);
  if(at>=0)entries.splice(at,1);
  if(entry.bookFixed||fields.some(f=>Object.hasOwn(entry,f)))entries.push(entry);
  return validatePaperAreaDocument({schemaVersion:1,entries});
}
// Only a current, complete fragment inventory may be used. A missing or
// duplicated persistent identity is never repaired using an offset or label.
// Failure is atomic; keep the stored intent for explicit resolution.
export function bindPaperAreaDocument(document,fragments){
  const {entries}=validatePaperAreaDocument(document);
  if(!Array.isArray(fragments))throw Error('Invalid fragment inventory');
  const index=new Map(),counts=new Map();
  for(const fragment of fragments){
    const origin=fragment?.origin;
    if(!id(origin?.documentId)||!id(origin?.blockKey))continue;
    const block=key(origin.documentId,origin.blockKey);
    counts.set(block,(counts.get(block)??0)+1);
    if(!id(origin.persistentId))continue;
    const k=key(origin.documentId,origin.persistentId);
    const list=index.get(k)??[];list.push(origin);index.set(k,list);
  }
  const intents=[],diagnostics=[],used=new Set();
  for(const entry of entries){
    const matches=index.get(key(entry.documentId,entry.persistentId))??[];
    const identity={documentId:entry.documentId,persistentId:entry.persistentId};
    if(matches.length!==1){diagnostics.push({...identity,code:matches.length?'AREA_AMBIGUOUS':'AREA_MISSING'});continue;}
    const {documentId,blockKey}=matches[0],k=key(documentId,blockKey);
    if(counts.get(k)!==1||used.has(k)){diagnostics.push({...identity,code:'AREA_AMBIGUOUS'});continue;}
    used.add(k);
    const sizeConstraints=Object.fromEntries(sizeFields.filter(f=>Object.hasOwn(entry,f)).map(f=>[f,entry[f]]));
    intents.push({documentId,blockKey,placement:{...(Object.keys(sizeConstraints).length?{sizeConstraints}:{}),...(entry.spaceAfter?{spaceAfter:entry.spaceAfter}:{}),...(entry.spaceBefore?{spaceBefore:entry.spaceBefore}:{}),...(entry.bookFixed?{mode:'fixed',fixed:entry.bookFixed}:{})}});
  }
  return diagnostics.length?{status:'conflict',intents:[],diagnostics}:{status:'ready',intents,diagnostics:[]};
}
// In-memory history for a future save controller. Lease is monotonic even
// after undo/redo so an old drag cannot commit against a restored state.
export function createPaperAreaDraft(initial={schemaVersion:1,entries:[]}){
  let current=validatePaperAreaDocument(initial),saved=encodePaperAreaDocument(current),version=0;
  const undo=[],redo=[];
  const snapshot=()=>Object.freeze({document:current,version,dirty:encodePaperAreaDocument(current)!==saved,canUndo:undo.length>0,canRedo:redo.length>0});
  const check=lease=>{if(lease!==version)throw Error('占有領域の編集案が変更されました。');};
  return {
    snapshot,
    apply(edit,lease){
      check(lease);
      const next=setPaperAreaValue(current,edit);
      if(encodePaperAreaDocument(next)===encodePaperAreaDocument(current))return snapshot();
      undo.push(current);if(undo.length>100)undo.shift();redo.length=0;current=next;version++;
      return snapshot();
    },
    undo(lease){check(lease);if(undo.length){redo.push(current);current=undo.pop();version++;}return snapshot();},
    redo(lease){check(lease);if(redo.length){undo.push(current);current=redo.pop();version++;}return snapshot();},
    // A caller may acknowledge only the exact version written successfully.
    markSaved(lease){check(lease);saved=encodePaperAreaDocument(current);return snapshot();}
  };
}

// Session-only history of successfully persisted scoped documents.
// A plan is a one-use lease; never mutate history until the disk write succeeds.
export function createSavedPaperAreaHistory(){
  let scope=null,revision=null,current=null,undo=[],redo=[],epoch=0;
  const matches=(key,snapshot)=>scope===key&&current!==null&&revision===snapshot.revision&&current===encodePaperAreaDocument(snapshot.document);
  const clear=()=>{scope=null;revision=null;current=null;undo=[];redo=[];epoch++;};
  function plan(key,snapshot,action,next){
    const same=matches(key,snapshot);
    const before=validatePaperAreaDocument(snapshot.document);
    if(action==='undo'||action==='redo'){
      if(!same)return null;
      next=(action==='undo'?undo:redo).at(-1);
      if(!next)return null;
    }else if(action!=='edit')throw Error('Invalid history action');
    next=validatePaperAreaDocument(next);
    if(encodePaperAreaDocument(before)===encodePaperAreaDocument(next))return null;
    return Object.freeze({epoch,key,revision:snapshot.revision,before,next,action,same});
  }
  function accept(ticket,saved){
    if(!ticket||ticket.epoch!==epoch||typeof saved.revision!=='string'||encodePaperAreaDocument(saved.document)!==encodePaperAreaDocument(ticket.next))throw Error('Invalid saved history acknowledgement');
    if(!ticket.same){undo=[];redo=[];}
    if(ticket.action==='edit'){undo.push(ticket.before);if(undo.length>100)undo.shift();redo=[];}
    else if(ticket.action==='undo'){undo.pop();redo.push(ticket.before);}
    else {redo.pop();undo.push(ticket.before);}
    scope=ticket.key;revision=saved.revision;current=encodePaperAreaDocument(saved.document);epoch++;
  }
  return {clear,plan,accept,availability(key,snapshot){
    const same=matches(key,snapshot);
    return {canUndo:same&&undo.length>0,canRedo:same&&redo.length>0};
  }};
}
