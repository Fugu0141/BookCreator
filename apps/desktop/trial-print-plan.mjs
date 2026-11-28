// Compare physical placement and diagnostics, not just page count. A print
// window may reproduce measurement only with the same immutable input.
export function printPlanSignature(plan){
  if(!plan||plan.completeness!=='full'||plan.publicationReady!==false||!plan.revision||!plan.fingerprint||
    !Array.isArray(plan.pages)||!plan.pages.length||plan.pages.length>512||
    !Array.isArray(plan.diagnostics)||plan.diagnostics.some(d=>d.severity==='error'))throw Error('最新の完全な試し組版が必要です。');
  const origin=o=>[o.documentId,o.revision,o.blockKey,o.persistentId??null,o.range?[o.range.start,o.range.end]:null];
  return JSON.stringify([plan.revision,plan.fingerprint,plan.pages.map((p,i)=>{
    if(p.index!==i||!Array.isArray(p.fragments))throw Error('ページの順序が不正です。');
    return [p.index,p.fragments.map(f=>[origin(f.origin),f.rect.x,f.rect.y,f.rect.width,f.rect.height,f.unitStart,f.unitEnd,f.continuationIndex,f.breakReason])];
  }),plan.diagnostics.map(d=>[d.code,d.severity,d.message,d.origin?origin(d.origin):null])]);
}
export function assertMatchingPrintPlan(expected,actual){
  if(printPlanSignature(expected)!==printPlanSignature(actual))throw Error('印刷用画面の組版が確認済み紙面と一致しません。');
}
