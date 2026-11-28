import {validatePaperAreaDocument,bindPaperAreaDocument} from './paper-area-store.mjs';

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
}
