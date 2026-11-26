import React,{useMemo} from 'react';
import {projectBlocks,planStructuredEdit} from './structured-blocks.mjs';

export function StructuredEditor({source,editable,blocked,draft,setDraft,onApply,onSource,scan,applyPatches,validateMath,onComposition,fontFamily}){
  const projection=useMemo(()=>projectBlocks(source,scan),[source,scan]);
  let planned=null,error='';
  if(draft)try{
    if(draft.source!==source)throw Error('原稿が変更されました。取り消して開き直してください。');
    planned=planStructuredEdit(source,draft.row,draft.value,{scan,applyPatches,validateMath});
  }catch(e){error=String(e.message??e);}
  return <div id="structured-editor" className="structured-editor" style={{fontFamily}}><p className="muted">構造編集（試作）：平文の見出し・本文・独立数式を編集できます。複雑な書式・教材部品はソース編集へ戻って編集します。</p>
    {projection.diagnostics.length>0&&<p className="workspace-hint">原稿構造の診断があるため、直接編集は停止しています。ソースで修正してください。</p>}
    {!projection.rows.length&&<p className="workspace-hint">原稿が空です。ソース編集で文章を追加できます。</p>}
    <div className="structured-blocks">{projection.rows.map(row=>{
      const active=draft?.row.index===row.index;
      return <section key={row.index} className="structured-block" data-structured-kind={row.kind} data-structured-index={row.index}><div className="structured-block-heading"><strong>{row.label}</strong>{!active&&<div className="structured-actions">{row.payload!==null&&<button type="button" data-structured-edit={row.index} disabled={!editable||blocked||!!draft} onClick={()=>setDraft({source,row,value:row.payload})}>編集</button>}<button type="button" className="secondary-action" data-structured-source={row.index} disabled={blocked||!!draft} onClick={()=>onSource(row.range)}>ソースで開く</button></div>}</div>
      {active?<><label>内容<textarea id="structured-value" autoFocus rows={row.kind==='math'?4:2} value={draft.value} onCompositionStart={()=>onComposition(true)} onCompositionEnd={()=>onComposition(false)} onChange={e=>setDraft(d=>({...d,value:e.target.value}))}/></label>{error&&<p className="structured-error" role="alert">{error}</p>}<div className="structured-actions"><button type="button" id="structured-apply" disabled={blocked||!editable||planned===null||planned===source} onClick={()=>onApply(draft,planned)}>反映</button><button type="button" id="structured-cancel" className="secondary-action" disabled={blocked} onClick={()=>setDraft(null)}>キャンセル</button></div></>:<div className={'structured-content '+(row.kind==='heading'?'structured-heading-text':'')}>{row.payload!==null?row.payload:<pre>{row.raw}</pre>}</div>}
      </section>;
    })}</div>
  </div>;
}
