import {validatePaperAreaDocument,bindPaperAreaDocument,setPaperAreaValues,encodePaperAreaDocument} from './paper-area-store.mjs';

function reject(diagnostics){
  const e=Object.assign(Error('保存済みの占有領域を適用できません：'+diagnostics.map(d=>d.documentId+'/'+d.persistentId+' '+d.code).join('、')),{code:'AREA_CONFLICT',diagnostics});
  throw e;
}
// Resolve stored IDs against prepared source blocks, not previous geometry.
// The IL engine separately rejects split or conflicting measured placements.
export function prepareSavedAreaPreview(options,snapshot,{whole,documentId}){
  const stored=validatePaperAreaDocument(snapshot.document);
  const document=whole?stored:validatePaperAreaDocument({schemaVersion:1,entries:stored.entries.filter(e=>e.documentId===documentId)});
  if(!document.entries.length)return {options,document,revision:snapshot.revision,intents:[]};
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
  for(const intent of bound.intents){
    const placement=byKey.get(JSON.stringify([intent.documentId,intent.blockKey]))?.placement;
    const rect=placement?.occupiedRect??placement?.rect,c=intent.placement.sizeConstraints;
    if(!rect||!Number.isSafeInteger(rect.width)||!Number.isSafeInteger(rect.height)||rect.width<Math.ceil(prepared.options.width*(c.minWidthPercent??0)/100)||rect.height<Math.ceil(prepared.options.height*(c.minHeightPercent??0)/100))throw Error('指定した占有領域が組版結果に確保されていません。');
  }
}

// A transient proposal is never a saved snapshot or a published host plan.
// The caller owns cancellation and the physical browser measurement lane.
export async function measureInlineAreaProposal(context,values,measure,current){
  if(!current())return;
  const id=context.target.documentId;
  const before=context.areaPrepared.document;
  const draft=setPaperAreaValues(before,{documentId:id,persistentId:context.persistentId,values});
  if(encodePaperAreaDocument(draft)===encodePaperAreaDocument(before))return;
  const {measurementCache,paragraphCache,pageCache,inlineMathCache,displayMathCache,mathCache,intelligentLayout,...options}=context.options;
  const prepared=prepareSavedAreaPreview(options,{revision:context.areaSnapshot.revision,document:draft},{whole:false,documentId:id});
  const result=await measure(prepared.options);
  if(!result||!current())return;
  if(result.plan?.completeness!=='full'||result.plan.diagnostics.some(d=>d.severity==='error'))throw Error('配置案が成立しません。');
  verifySavedAreaPreview(prepared,result);
  if(!current())return;
  return result;
}
