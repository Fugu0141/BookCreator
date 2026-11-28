import React,{useLayoutEffect,useRef,useState} from 'react';
import {inspectRetainedIntelligentLayoutQuality,prepareRetainedIntelligentOptimizationReview,prepareRetainedIntelligentDocumentOptimizationReview,cancelRetainedIntelligentOptimizationReview,confirmRetainedIntelligentOptimizationReview,createFullRetainedTextPagePreview,createInlineMathGeometryCache} from '../../../BookCreator_LayoutEngine/dist/index.js';
import {measurementLane} from './measurement-lane.mjs';
import {createPreviewCheckpoint} from './preview-checkpoint.mjs';

const rangeLabel=r=>(r.firstPage+1)+'〜'+(r.lastPage+1)+'ページ';
const reasons={'no-improvement':'条件を満たす改善案はありません。','outside-scope':'指定範囲外に影響するため提案しません。','movement-budget':'移動数の上限を超えています。','unsafe-change':'既存配置の保護条件を満たしません。',conflict:'配置が成立しません。',stale:'紙面が変更されました。再組版してください。','shared-pages':'共有ページがあるため原稿単独では改善できません。','unknown-document':'対象原稿が見つかりません。','preview-mismatch':'実測した候補が試算と一致しません。'};
const identity=f=>JSON.stringify([f.origin.documentId,f.origin.blockKey,f.unitStart,f.unitEnd]);

// The only decorated DOM is the detached, independently verified candidate.
// If an unexpected DOM inventory prevents exact identification, fail closed.
function decorateCandidate(candidate,changes){
  const root=candidate.element.shadowRoot;
  if(!root)throw Error('候補紙面の表示領域がありません。');
  const changed=new Set(changes.map(identity)),marked=new Set();
  const pages=[...root.querySelectorAll('[data-page]')];
  for(const page of candidate.plan.pages){
    const node=pages.find(n=>Number(n.dataset.page)===page.index);
    const blocks=[...(node?.querySelectorAll(':scope > [data-block]')??[])];
    if(!node||blocks.length!==page.fragments.length)throw Error('候補紙面の部品数が一致しません。');
    page.fragments.forEach((f,i)=>{
      const block=blocks[i],key=identity(f);
      if(block.dataset.document!==f.origin.documentId||block.dataset.block!==f.origin.blockKey)throw Error('候補紙面の部品IDが一致しません。');
      if(changed.has(key)){block.dataset.ilChanged='true';block.style.outline='2px solid #d97706';block.style.outlineOffset='1px';marked.add(key);}
    });
  }
  if(marked.size!==changed.size)throw Error('変更部品の表示位置が一致しません。');
}
function CandidatePaper({element,firstPage}){
  const mount=useRef(null);
  useLayoutEffect(()=>{
    const node=mount.current;if(!node)return;
    node.replaceChildren(element);
    const target=element.shadowRoot?.querySelector('[data-page="'+firstPage+'"]');
    if(target)node.scrollTop=target.getBoundingClientRect().top-node.getBoundingClientRect().top+node.scrollTop;
    return ()=>{if(element.parentNode===node)element.remove();};
  },[element,firstPage]);
  return <div id="book-il-candidate-paper" ref={mount} inert={true} aria-label="改善後の実測紙面" style={{overflow:'auto',maxHeight:'42vh',background:'#e7edf2',padding:8}}/>;
}

export function BookILQualityReview({context,blocked}){
  const [info,setInfo]=useState(null),[opened,setOpened]=useState(false),[error,setError]=useState(''),[goal,setGoal]=useState('balance'),[selected,setSelected]=useState(''),[result,setResult]=useState(null),[pending,setPending]=useState(false),[showCandidate,setShowCandidate]=useState(true);
  const active=useRef(null),latest=useRef(null);latest.current={context,blocked};
  function discard(){
    const operation=active.current;active.current=null;
    if(operation){operation.controller.abort();if(operation.handle)cancelRetainedIntelligentOptimizationReview(operation.handle);}
  }
  useLayoutEffect(()=>()=>discard(),[]);
  useLayoutEffect(()=>{if(blocked){discard();setPending(false);setResult(null);}},[blocked]);
  const current=()=>!latest.current.blocked&&latest.current.context===context&&context.current();
  function reset(){discard();setPending(false);setResult(null);setError('');setShowCandidate(true);}
  function open(){
    if(!current())return;
    reset();setOpened(true);setInfo(null);setSelected('');
    try{
      const next=inspectRetainedIntelligentLayoutQuality(document,context.geometryBase);
      if(!current())return;
      if(!next){setError('この紙面の品質情報は取得できません。');return;}
      setInfo(next);
    }catch(e){if(current())setError(String(e.message??e));}
  }
  async function propose(){
    if(!current()||!info||!selected)return;
    reset();
    const target=selected==='book'?null:info.documents[Number(selected.slice(4))];
    if(selected!=='book'&&!target?.exclusiveScope)return;
    const operation={controller:new AbortController(),handle:null};active.current=operation;
    const valid=()=>active.current===operation&&!operation.controller.signal.aborted&&current();
    const lease=crypto.randomUUID(),base=context.geometryBase;
    setPending(true);
    let privateInline;
    try{
      const review=target?prepareRetainedIntelligentDocumentOptimizationReview(document,base,target.documentId,goal,lease):prepareRetainedIntelligentOptimizationReview(document,base,goal,lease);
      if(review.status==='review')operation.handle=review.handle;
      if(!valid())return;
      if(review.status==='rejected'){setResult({status:'rejected',message:reasons[review.reason]??'改善案を生成できません（'+review.reason+'）。'});return;}
      const p=review.proposal;
      const {measurementCache,paragraphCache,pageCache,inlineMathCache,displayMathCache,mathCache,...original}=context.options;
      // Match the original measurement mode, but never borrow live mutable caches.
      if(inlineMathCache)privateInline=createInlineMathGeometryCache(document);
      const options={...original,intelligentLayout:structuredClone(p.options),...(privateInline?{inlineMathCache:privateInline}:{})};
      const candidate=await measurementLane.run(()=>createFullRetainedTextPagePreview(document,options,base,createPreviewCheckpoint({current:valid})),{current:valid,signal:operation.controller.signal,priority:'background',category:'il-quality-candidate'});
      if(!valid())return;
      if(!candidate?.snapshot||!candidate.element||candidate.plan?.completeness!=='full'||candidate.plan.diagnostics.some(d=>d.severity==='error'))throw Error('完全な実測候補を取得できません。');
      const checked=confirmRetainedIntelligentOptimizationReview(document,review.handle,base,candidate.snapshot,lease);
      operation.handle=null;
      if(checked.status!=='confirmed'){setResult({status:'rejected',message:reasons[checked.reason]??'実測候補の検証に失敗しました。'});return;}
      decorateCandidate(candidate,p.impact.changed);
      if(valid())setResult({status:'review',before:p.before.pageCount,after:p.after.pageCount,moved:p.impact.movedFragments,restored:p.improvement.additionalHonoredPreferences,depth:p.improvement.depthImbalanceReduction,element:candidate.element,firstPage:Math.min(...p.impact.changed.map(c=>c.after.page))});
    }catch(e){if(valid())setError(String(e.message??e));}
    finally{
      privateInline?.clear();
      if(operation.handle)cancelRetainedIntelligentOptimizationReview(operation.handle);
      if(active.current===operation){active.current=null;if(current())setPending(false);}
    }
  }
  return <section id="book-il-quality-review" aria-label="自動レイアウトの診断">
    <div className="controls"><button id="book-il-quality-open" type="button" className="secondary-action" disabled={blocked} aria-expanded={opened} onClick={()=>{if(opened){reset();setOpened(false);}else open();}}>{opened?'診断を閉じる':'自動レイアウトの診断'}</button></div>
    {opened&&<div id="book-il-quality-details">
      {error&&<p role="alert">{error}</p>}
      {info&&<><p className="muted">現在の実測紙面を診断します。空白や固定配置は必ずしも問題ではありません。原稿・配置設定は変更しません。</p>
        <p id="book-il-quality-summary" data-pages={info.quality.pageCount}>全 {info.quality.pageCount}ページ · 空白 {info.quality.blankPages.length} · 組版警告 {info.quality.paginationWarningCount} · 希望範囲外 {info.quality.findings.filter(f=>f.kind==='preferred-fallback').length}件</p>
        <details><summary>原稿ごとのページ範囲</summary><ul>{info.documents.map(d=><li key={d.documentId} data-exclusive={!!d.exclusiveScope}>{d.documentId}：{rangeLabel(d)}{d.mixedPages.length>0?'（共有ページ '+d.mixedPages.map(n=>n+1).join('、')+'：原稿単独の改善不可）':''}</li>)}</ul></details>
        <div className="controls"><label>改善の目的<select id="book-il-goal" value={goal} disabled={blocked} onChange={e=>{reset();setGoal(e.target.value);}}><option value="balance">ページ間の余白を均す</option><option value="compact">ページ数・希望位置を改善</option></select></label>
        <label>対象範囲<select id="book-il-scope" value={selected} disabled={blocked} onChange={e=>{reset();setSelected(e.target.value);}}><option value="">対象を選択</option><option value="book">書籍全体</option>{info.documents.map((d,i)=><option key={d.documentId} value={'doc:'+i} disabled={!d.exclusiveScope}>{d.documentId}（{rangeLabel(d)}）{d.exclusiveScope?'':'・共有ページあり'}</option>)}</select></label>
        <button id="book-il-propose" type="button" disabled={blocked||!selected||pending} onClick={()=>void propose()}>改善案を試算</button>{(pending||result)&&<button id="book-il-discard" type="button" className="secondary-action" onClick={reset}>改善案を取消</button>}</div>
        {pending&&<p role="status">候補紙面を実測・検証中…</p>}
        {result&&<div id="book-il-proposal-result" data-status={result.status} role="status">{result.status==='rejected'?result.message:<><p>実測一致：{result.before} → {result.after}ページ、移動 {result.moved}断片、希望範囲内の増加 {result.restored}件、深さの差の減少 {result.depth/1000} mm</p><button id="book-il-compare-toggle" type="button" aria-pressed={showCandidate} onClick={()=>setShowCandidate(v=>!v)}>{showCandidate?'改善前の紙面を見る':'改善後の紙面を見る'}</button><small>改善前は通常の紙面。改善後は下の別枠に表示し、変更部品を橙色の枠で示します。</small></>}<small>未適用・未保存。採用・印刷はまだ行いません。</small></div>}
        {result?.element&&showCandidate&&<CandidatePaper element={result.element} firstPage={result.firstPage}/>}
      </>}
    </div>}
  </section>;
}
