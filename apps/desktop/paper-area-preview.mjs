import {validatePaperAreaDocument,bindPaperAreaDocument,setPaperAreaValues,setBookPaperFixed,encodePaperAreaDocument} from './paper-area-store.mjs';

function reject(diagnostics){
  const e=Object.assign(Error('保存済みの占有領域を適用できません：'+diagnostics.map(d=>d.documentId+'/'+d.persistentId+' '+d.code).join('、')),{code:'AREA_CONFLICT',diagnostics});
  throw e;
}
// Resolve stored IDs against prepared source blocks, not previous geometry.
// The IL engine separately rejects split or conflicting measured placements.
export function prepareSavedAreaPreview(options,snapshot,{whole,documentId}){
  const stored=validatePaperAreaDocument(snapshot.document);
  const document=whole?stored:validatePaperAreaDocument({schemaVersion:1,entries:stored.entries.filter(e=>e.documentId===documentId)});
  if(!whole&&document.entries.some(e=>e.bookFixed))throw Object.assign(Error('絶対ページ位置の固定設定は全冊紙面で確認してください。'),{code:'AREA_BOOK_SCOPE'});
  if(!document.entries.length)return {options:whole?{...options,intelligentLayout:{intents:[]}}:options,document,revision:snapshot.revision,intents:[]};
  const blocks=options.sections.flatMap(s=>s.blocks.filter(b=>!('kind' in b)));
  const bound=bindPaperAreaDocument(document,blocks);
  if(bound.status!=='ready')reject(bound.diagnostics);
  return {options:{...options,intelligentLayout:{intents:bound.intents}},document,revision:snapshot.revision,intents:bound.intents};
}
// Validate the actual complete fragment inventory again after measurement.
// A successful result with a different key or missing footprint is not adopted.
export function verifySavedAreaPreview(prepared,result){
  if(!prepared.intents.length)return;
  const il=result.intelligentLayout;
  if(!il||il.status!=='placed'||il.revision!==prepared.options.revision||il.fingerprint!==prepared.options.fingerprint)throw Error('保存済み配置の計算結果が現在の紙面と一致しません。');
  const bound=bindPaperAreaDocument(prepared.document,il.fragments);
  if(bound.status!=='ready')reject(bound.diagnostics);
  if(JSON.stringify(bound.intents)!==JSON.stringify(prepared.intents))throw Error('配置対象が組版中に変化しました。');
  const byKey=new Map(il.fragments.map(f=>[JSON.stringify([f.origin.documentId,f.origin.blockKey]),f]));
  // IL places a block with spaceBefore on a new row. Verify its physical
  // separation from every preceding occupied footprint on the same page.
  const beforeKeys=new Set(bound.intents.filter(i=>i.placement.spaceBefore).map(i=>JSON.stringify([i.documentId,i.blockKey])));
  const precedingBottom=new Map(),beforeClearance=new Map();
  if(beforeKeys.size)for(const f of il.fragments){
    const p=f.placement,r=p?.occupiedRect??p?.rect,k=JSON.stringify([f.origin.documentId,f.origin.blockKey]);
    if(!Number.isSafeInteger(p?.page)||p.page<0||!Number.isSafeInteger(r?.y)||r.y<0||!Number.isSafeInteger(r.height)||r.height<=0)throw Error('前方余白の計測結果が不正です。');
    const bottom=precedingBottom.get(p.page)??0;
    if(beforeKeys.has(k))beforeClearance.set(k,r.y-bottom);
    precedingBottom.set(p.page,Math.max(bottom,r.y+r.height));
  }
  for(const intent of bound.intents){
    if(intent.placement.spaceBefore&&(beforeClearance.get(JSON.stringify([intent.documentId,intent.blockKey]))??-1)<intent.placement.spaceBefore)throw Error('指定した前方余白が組版結果に確保されていません。');
    const placement=byKey.get(JSON.stringify([intent.documentId,intent.blockKey]))?.placement;
    const fixed=intent.placement.fixed;
    if(fixed&&(!placement?.fixed||placement.page!==fixed.page||placement.rect?.x!==fixed.x||placement.rect?.y!==fixed.y))throw Error('指定した固定位置が組版結果に保持されていません。');
    const rect=placement?.occupiedRect??placement?.rect,c=intent.placement.sizeConstraints??{},gap=intent.placement.spaceAfter??0;
    if(!rect||!Number.isSafeInteger(rect.width)||!Number.isSafeInteger(rect.height)||rect.width<Math.ceil(prepared.options.width*(c.minWidthPercent??0)/100)||rect.height<Math.ceil(prepared.options.height*(c.minHeightPercent??0)/100)+gap||(gap>0&&(!Number.isSafeInteger(placement?.rect?.height)||rect.height<placement.rect.height+gap)))throw Error('指定した占有領域が組版結果に確保されていません。');
  }
}

// A transient proposal is never a saved snapshot or a published host plan.
// The caller owns cancellation and the physical browser measurement lane.
export async function measureInlineAreaProposal(context,values,measure,current,privateCaches={}){
  if(!current())return;
  const id=context.target.documentId;
  const before=context.areaPrepared.document;
  const draft=setPaperAreaValues(before,{documentId:id,persistentId:context.persistentId,values});
  if(encodePaperAreaDocument(draft)===encodePaperAreaDocument(before))return;
  const {measurementCache,paragraphCache,pageCache,inlineMathCache,displayMathCache,mathCache,intelligentLayout,...options}=context.options;
  const prepared=prepareSavedAreaPreview(options,{revision:context.areaSnapshot.revision,document:draft},{whole:context.scope==='book',documentId:id});
  // Reuse only explicitly supplied draft-owned caches, never normal preview
  // caches or page templates. The engine checks text width and font identity.
  const draftOptions={...prepared.options};
  for(const name of ['paragraphCache','mathCache','displayMathCache']){
    if(privateCaches[name]!==undefined){
      if(privateCaches[name]===context.options[name])throw Error('Draft cache must not be shared with saved paper');
      draftOptions[name]=privateCaches[name];
    }
  }
  const result=await measure(draftOptions);
  if(!result||!current())return;
  if(result.plan?.completeness!=='full'||result.plan.diagnostics.some(d=>d.severity==='error'))throw Error('配置案が成立しません。');
  verifySavedAreaPreview(prepared,result);
  if(!current())return;
  return result;
}


// Scope a selection by the exact current fragment inventory. A duplicate
// persistent ID in another manuscript is valid; a split/duplicate inside
// the selected manuscript is not. Never infer identity from displayed text.
export function resolvePaperAreaSelection(plan,documentId,blockKey,{allowFixed=false}={}){
  if(!plan||!Array.isArray(plan.fragments)||typeof documentId!=='string'||!documentId||typeof blockKey!=='string'||!blockKey||typeof plan.revision!=='string'||!plan.revision||typeof plan.fingerprint!=='string'||!plan.fingerprint)return null;
  const matches=plan.fragments.filter(f=>f.origin?.documentId===documentId&&f.origin?.blockKey===blockKey);
  const persistentId=matches[0]?.origin?.persistentId;
  if(matches.length!==1||typeof persistentId!=='string'||!persistentId||(!allowFixed&&matches[0].placement?.fixed)||plan.fragments.filter(f=>f.origin?.documentId===documentId&&f.origin?.persistentId===persistentId).length!==1)return null;
  return {persistentId,selection:{documentId,blockKey,revision:plan.revision,fingerprint:plan.fingerprint}};
}


// Capture only persisted input revisions from the exact full-book read.
// The selected editor document must match the bytes used by the preview.
export function captureBookAreaLease({snapshot,file,raw,dirty,themeDirty,settingsDirty,themeRevision,settingsRevision}){
  const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
  if(dirty||themeDirty||settingsDirty||!hash(themeRevision)||!hash(settingsRevision)||!Array.isArray(snapshot)||!snapshot.length||snapshot.length>128)return null;
  const seen=new Set(),documents=[];
  for(const d of snapshot){
    if(!d||typeof d.documentId!=='string'||!d.documentId||seen.has(d.documentId)||!hash(d.revision))return null;
    seen.add(d.documentId);documents.push(Object.freeze({documentId:d.documentId,revision:d.revision}));
  }
  if(file&&!snapshot.some(d=>d.documentId===file.id&&d.revision===file.revision&&d.source===raw))return null;
  return Object.freeze({themeRevision,settingsRevision,documents:Object.freeze(documents)});
}

// Prepare the whole measured book but hand only the selected manuscript's
// intent slice to the scoped persistence API.
export function prepareBookAreaCommit(context,values){
  if(context?.scope!=='book'||!context.bookLease||!context.areaSnapshot||!context.areaPrepared)throw Error('全冊紙面の保存情報がありません。');
  const {documentId,blockKey}=context.selection;
  const selected=resolvePaperAreaSelection(context.plan,documentId,blockKey);
  if(!selected||selected.persistentId!==context.persistentId||selected.selection.revision!==context.selection.revision||selected.selection.fingerprint!==context.selection.fingerprint||!context.bookLease.documents.some(d=>d.documentId===documentId))throw Error('全冊紙面の編集対象が変わりました。');
  const before=context.areaPrepared.document;
  const next=setPaperAreaValues(before,{documentId,persistentId:context.persistentId,values});
  if(encodePaperAreaDocument(before)===encodePaperAreaDocument(next))return null;
  const {measurementCache,paragraphCache,pageCache,inlineMathCache,displayMathCache,mathCache,intelligentLayout,...options}=context.options;
  const prepared=prepareSavedAreaPreview(options,{revision:context.areaSnapshot.revision,document:next},{whole:true});
  const value=validatePaperAreaDocument({schemaVersion:1,entries:next.entries.filter(e=>e.documentId===documentId)});
  return {prepared,value,documentId,lease:context.bookLease,expectedRevision:context.areaSnapshot.revision};
}


// One history step is one scoped disk transaction. Refuse a restore that
// would change multiple manuscripts, even if the caller supplies a ticket.
export function prepareBookAreaRestore(context,ticket){
  if(context?.scope!=='book'||!context.bookLease||!context.areaSnapshot||!context.areaPrepared||!ticket||ticket.revision!==context.areaSnapshot.revision||encodePaperAreaDocument(ticket.before)!==encodePaperAreaDocument(context.areaPrepared.document))throw Error('全冊配置履歴が変更されました。');
  const before=validatePaperAreaDocument(ticket.before),next=validatePaperAreaDocument(ticket.next);
  const slice=(doc,id)=>validatePaperAreaDocument({schemaVersion:1,entries:doc.entries.filter(e=>e.documentId===id)});
  const ids=new Set([...before.entries,...next.entries].map(e=>e.documentId));
  const changed=[...ids].filter(id=>encodePaperAreaDocument(slice(before,id))!==encodePaperAreaDocument(slice(next,id)));
  if(changed.length!==1||!context.bookLease.documents.some(d=>d.documentId===changed[0]))throw Error('全冊配置履歴の復元対象が不正です。');
  const documentId=changed[0];
  const {measurementCache,paragraphCache,pageCache,inlineMathCache,displayMathCache,mathCache,intelligentLayout,...options}=context.options;
  const prepared=prepareSavedAreaPreview(options,{revision:ticket.revision,document:next},{whole:true});
  return {prepared,documentId,value:slice(next,documentId),lease:context.bookLease,expectedRevision:ticket.revision};
}
export function acknowledgeBookAreaCommit(commit,saved){
  if(typeof saved?.revision!=='string'||encodePaperAreaDocument(saved.document)!==encodePaperAreaDocument(commit.value))throw Error('全冊配置の保存応答が一致しません。');
  return {revision:saved.revision,document:commit.prepared.document};
}


// Explicit recovery does not require a successful measured plan.
export function prepareBookFixedRelease(context,documentId,persistentId){
  const snapshot=context?.areaSnapshot,lease=context?.bookLease;
  if(!snapshot||typeof snapshot.revision!=='string'||!/^[a-f0-9]{64}$/.test(snapshot.revision)||!lease?.documents?.some(d=>d.documentId===documentId))throw Error('全冊の固定位置を解除するための保存情報がありません。');
  const before=validatePaperAreaDocument(snapshot.document);
  if(!before.entries.some(e=>e.documentId===documentId&&e.persistentId===persistentId&&e.bookFixed))throw Error('指定された固定位置は存在しません。');
  const next=setBookPaperFixed(before,{documentId,persistentId,position:null});
  const value=validatePaperAreaDocument({schemaVersion:1,entries:next.entries.filter(e=>e.documentId===documentId)});
  return {documentId,value,lease,expectedRevision:snapshot.revision};
}


// Coordinates are taken from the latest IL fragment, never a DOM pixel box.
export function resolveBookFixedSelection(plan,documentId,blockKey){
  const selected=resolvePaperAreaSelection(plan,documentId,blockKey,{allowFixed:true});
  if(!selected)return null;
  const placement=plan.fragments.find(f=>f.origin.documentId===documentId&&f.origin.blockKey===blockKey)?.placement;
  const position={page:placement?.page,x:placement?.rect?.x,y:placement?.rect?.y};
  if(!Number.isSafeInteger(position.page)||position.page<0||position.page>9999||[position.x,position.y].some(v=>!Number.isSafeInteger(v)||v<0||v>1000000000))return null;
  return {...selected,position,fixed:placement.fixed===true};
}

// A lock toggles only the currently measured origin. Arbitrary movement
// will be a separate proposal API. The ordinary history/measurement gate
// must verify all saved intents before the scoped write.
export function prepareBookFixedCommit(context,action,position){
  if(context?.scope!=='book'||!context.bookLease||!context.areaSnapshot||!context.areaPrepared||!['lock','unlock','move'].includes(action))throw Error('全冊紙面の固定操作情報がありません。');
  const {documentId,blockKey}=context.selection??{};
  const target=resolveBookFixedSelection(context.plan,documentId,blockKey);
  if(!target||target.persistentId!==context.persistentId||target.selection.revision!==context.selection.revision||target.selection.fingerprint!==context.selection.fingerprint||!context.bookLease.documents.some(d=>d.documentId===documentId))throw Error('固定操作の対象が変更されました。');
  const before=context.areaPrepared.document;
  const stored=before.entries.find(e=>e.documentId===documentId&&e.persistentId===target.persistentId)?.bookFixed;
  if(target.fixed!==!!stored||stored&&['page','x','y'].some(k=>stored[k]!==target.position[k])||(action!=='move'&&(action==='lock')===target.fixed))throw Error('固定状態が現在の紙面と一致しません。');
  if(action==='move'){
    const bounds=resolveBookMoveBounds(context,target);
    if(!bounds||!position||Object.keys(position).length!==3||position.page!==target.position.page||!Number.isSafeInteger(position.x)||!Number.isSafeInteger(position.y)||position.x<0||position.y<0||position.x>bounds.maxX||position.y>bounds.maxY)throw Error('移動先が現在の本文領域に収まりません。');
    if(position.x===target.position.x&&position.y===target.position.y)return null;
  }
  const next=setBookPaperFixed(before,{documentId,persistentId:target.persistentId,position:action==='move'?position:action==='lock'?target.position:null});
  const {measurementCache,paragraphCache,pageCache,inlineMathCache,displayMathCache,mathCache,intelligentLayout,...options}=context.options;
  const prepared=prepareSavedAreaPreview(options,{revision:context.areaSnapshot.revision,document:next},{whole:true});
  const value=validatePaperAreaDocument({schemaVersion:1,entries:next.entries.filter(e=>e.documentId===documentId)});
  return {prepared,value,documentId,lease:context.bookLease,expectedRevision:context.areaSnapshot.revision};
}


// The occupied footprint, not the visible DOM dimensions, limits movement.
export function resolveBookMoveBounds(context,target){
  const fragment=context.plan.fragments.find(f=>f.origin.documentId===target.selection.documentId&&f.origin.blockKey===target.selection.blockKey);
  const rect=fragment?.placement?.rect,occupied=fragment?.placement?.occupiedRect??rect;
  const {width,height}=context.options;
  if(![width,height,rect?.width,rect?.height,occupied?.width,occupied?.height].every(v=>Number.isSafeInteger(v)&&v>0)||occupied.width<rect.width||occupied.height<rect.height)return null;
  const maxX=width-occupied.width,maxY=height-occupied.height;
  if(maxX<0||maxY<0||target.position.x>maxX||target.position.y>maxY)return null;
  return {maxX,maxY,width:occupied.width,height:occupied.height};
}
