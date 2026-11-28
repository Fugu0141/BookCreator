import React,{useState} from 'react';
import {inspectRetainedIntelligentLayoutQuality,prepareRetainedIntelligentOptimizationReview,cancelRetainedIntelligentOptimizationReview} from '../../../BookCreator_LayoutEngine/dist/index.js';

const rangeLabel=r=>(r.firstPage+1)+'〜'+(r.lastPage+1)+'ページ';
const reasons={'no-improvement':'条件を満たす改善案はありません。','outside-scope':'指定範囲外に影響するため提案しません。','movement-budget':'移動数の上限を超えています。','unsafe-change':'既存配置の保護条件を満たしません。',conflict:'配置が成立しません。',stale:'紙面が変更されました。再組版してください。'};

// Read-only first step: proposals are estimates, never published or saved.
// The opaque handle is immediately cancelled until real candidate rendering
// and host save/history/print validation are connected.
export function BookILQualityReview({context,blocked}){
  const [info,setInfo]=useState(null),[opened,setOpened]=useState(false),[error,setError]=useState(''),[goal,setGoal]=useState('balance'),[selected,setSelected]=useState(''),[result,setResult]=useState(null);
  const current=()=>!blocked&&context.current();
  function open(){
    if(!current())return;
    setOpened(true);setError('');setInfo(null);setResult(null);setSelected('');
    try{
      const next=inspectRetainedIntelligentLayoutQuality(document,context.geometryBase);
      if(!current())return;
      if(!next){setError('この紙面の品質情報は取得できません。');return;}
      setInfo(next);
    }catch(e){if(current())setError(String(e.message??e));}
  }
  function propose(){
    if(!current()||!info||!selected)return;
    setResult(null);setError('');
    const scope=selected==='book'?undefined:info.documents[Number(selected.slice(4))]?.exclusiveScope;
    if(selected!=='book'&&!scope)return;
    let review;
    try{
      review=prepareRetainedIntelligentOptimizationReview(document,context.geometryBase,goal,crypto.randomUUID(),scope);
      if(!current())return;
      if(review.status==='rejected'){setResult({status:'rejected',message:reasons[review.reason]??'改善案を生成できません（'+review.reason+'）。'});return;}
      const p=review.proposal;
      setResult({status:'review',before:p.before.pageCount,after:p.after.pageCount,moved:p.impact.movedFragments,restored:p.improvement.additionalHonoredPreferences,depth:p.improvement.depthImbalanceReduction});
    }catch(e){if(current())setError(String(e.message??e));}
    finally{if(review?.status==='review')cancelRetainedIntelligentOptimizationReview(review.handle);}
  }
  return <section id="book-il-quality-review" aria-label="自動レイアウトの診断">
    <div className="controls"><button id="book-il-quality-open" type="button" className="secondary-action" disabled={blocked} aria-expanded={opened} onClick={()=>opened?setOpened(false):open()}>{opened?'診断を閉じる':'自動レイアウトの診断'}</button></div>
    {opened&&<div id="book-il-quality-details">
      {error&&<p role="alert">{error}</p>}
      {info&&<><p className="muted">現在の実測紙面を診断します。空白や固定配置は必ずしも問題ではありません。原稿・配置設定は変更しません。</p>
        <p id="book-il-quality-summary" data-pages={info.quality.pageCount}>全 {info.quality.pageCount}ページ · 空白 {info.quality.blankPages.length} · 組版警告 {info.quality.paginationWarningCount} · 希望範囲外 {info.quality.findings.filter(f=>f.kind==='preferred-fallback').length}件</p>
        <details><summary>原稿ごとのページ範囲</summary><ul>{info.documents.map((d,i)=><li key={d.documentId} data-exclusive={!!d.exclusiveScope}>{d.documentId}：{rangeLabel(d)}{d.mixedPages.length>0?'（共有ページ '+d.mixedPages.map(n=>n+1).join('、')+'：原稿単独の改善不可）':''}</li>)}</ul></details>
        <div className="controls"><label>改善の目的<select id="book-il-goal" value={goal} disabled={blocked} onChange={e=>{setGoal(e.target.value);setResult(null);}}><option value="balance">ページ間の余白を均す</option><option value="compact">ページ数・希望位置を改善</option></select></label>
        <label>対象範囲<select id="book-il-scope" value={selected} disabled={blocked} onChange={e=>{setSelected(e.target.value);setResult(null);}}><option value="">対象を選択</option><option value="book">書籍全体</option>{info.documents.map((d,i)=><option key={d.documentId} value={'doc:'+i} disabled={!d.exclusiveScope}>{d.documentId}（{rangeLabel(d)}）{d.exclusiveScope?'':'・共有ページあり'}</option>)}</select></label>
        <button id="book-il-propose" type="button" disabled={blocked||!selected} onClick={propose}>改善案を試算</button></div>
        {result&&<div id="book-il-proposal-result" data-status={result.status} role="status">{result.status==='rejected'?result.message:<p>試算：{result.before} → {result.after}ページ、移動 {result.moved}断片、希望範囲内の増加 {result.restored}件、深さの差の減少 {result.depth/1000} mm</p>}<small>未適用・未保存。実測候補との比較・採用はこの画面では行いません。</small></div>}
      </>}
    </div>}
  </section>;
}
