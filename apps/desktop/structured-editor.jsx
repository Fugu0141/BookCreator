import React,{useMemo,useRef,useState} from 'react';
import {projectBlocks,planStructuredEdit} from './structured-blocks.mjs';
import {FormulaPreview,FormulaTemplates,InlineMathTools} from './structured-math.jsx';

export function StructuredEditor({source,editable,blocked,draft,setDraft,onApply,onSource,scan,applyPatches,validateMath,parseInline,planFormat,mathFamily,onComposition,fontFamily}){
  const projection=useMemo(()=>projectBlocks(source,scan,parseInline),[source,scan,parseInline]);
  const field=useRef(null),[formatError,setFormatError]=useState('');
  function format(kind){const node=field.current;if(!node||blocked||!draft||draft.inlineEdit)return;try{const p=planFormat(draft.value,node.selectionStart,node.selectionEnd,kind,scan);const value=applyPatches(draft.value,[p.patch]);setDraft(d=>({...d,value}));setFormatError('');requestAnimationFrame(()=>{if(field.current===node&&node.value===value){node.focus();node.setSelectionRange(p.selection.start,p.selection.end);}});}catch(e){setFormatError(String(e.message??e));}}
  let planned=null,error='';
  if(draft)try{
    if(draft.source!==source)throw Error('原稿が変更されました。取り消して開き直してください。');
    planned=planStructuredEdit(source,draft.row,draft.value,{scan,applyPatches,validateMath,parseInline,level:draft.level});
  }catch(e){error=String(e.message??e);}
  return <div id="structured-editor" className="structured-editor" style={{fontFamily}}><p className="muted">構造編集（試作）：見出し・複数行本文・本文内数式・独立数式を編集できます。文字書式は選択してボタンで設定します（編集欄には記法も表示されます）。複雑な記法・教材部品はソース編集へ戻ります。</p>
    {projection.diagnostics.length>0&&<p className="workspace-hint">原稿構造の診断があるため、直接編集は停止しています。ソースで修正してください。</p>}
    {!projection.rows.length&&<p className="workspace-hint">原稿が空です。ソース編集で文章を追加できます。</p>}
    <div className="structured-blocks">{projection.rows.map(row=>{
      const active=draft?.row.index===row.index;
      return <section key={row.index} className="structured-block" data-structured-kind={row.kind} data-structured-index={row.index}><div className="structured-block-heading"><strong>{row.label}</strong>{!active&&<div className="structured-actions">{row.payload!==null&&<button type="button" data-structured-edit={row.index} disabled={!editable||blocked||!!draft} onClick={()=>{setFormatError('');setDraft({source,row,value:row.payload,level:row.level});}}>編集</button>}<button type="button" className="secondary-action" data-structured-source={row.index} disabled={blocked||!!draft} onClick={()=>onSource(row.range)}>ソースで開く</button></div>}</div>
      {active?<>{row.kind==='heading'&&<label>見出しレベル<select id="structured-heading-level" disabled={blocked} value={draft.level} onChange={e=>setDraft(d=>({...d,level:Number(e.target.value)}))}>{[1,2,3,4,5,6].map(level=><option key={level} value={level}>H{level}</option>)}</select></label>}{row.kind!=='math'&&<div className="structured-actions" role="toolbar" aria-label="文字書式">{[['bold','太字'],['italic','斜体'],['underline','下線']].map(([kind,label])=><button key={kind} type="button" data-structured-format={kind} disabled={blocked||!!draft.inlineEdit} onMouseDown={e=>e.preventDefault()} onClick={()=>format(kind)}>{label}</button>)}</div>}{row.kind==='math'&&<><FormulaTemplates display blocked={blocked} onPick={value=>setDraft(d=>({...d,value}))}/><FormulaPreview formula={draft.value} display family={mathFamily}/></>}{row.kind==='paragraph'&&<InlineMathTools draft={draft} setDraft={setDraft} parseInline={parseInline} blocked={blocked} family={mathFamily} onComposition={onComposition}/>}<label>内容<textarea disabled={!!draft.inlineEdit} ref={field} id="structured-value" autoFocus rows={row.kind==='heading'?2:4} value={draft.value} onCompositionStart={()=>onComposition(true)} onCompositionEnd={()=>onComposition(false)} onChange={e=>{setFormatError('');setDraft(d=>({...d,value:e.target.value}));}}/></label>{formatError&&<p role="alert" className="structured-error">書式変更不可：{formatError}</p>}{error&&<p className="structured-error" role="alert">{error}</p>}<div className="structured-actions"><button type="button" id="structured-apply" disabled={blocked||!!draft.inlineEdit||!editable||planned===null||planned===source} onClick={()=>onApply(draft,planned)}>反映</button><button type="button" id="structured-cancel" className="secondary-action" disabled={blocked} onClick={()=>setDraft(null)}>キャンセル</button></div></>:<div className={'structured-content '+(row.kind==='heading'?'structured-heading-text':'')}>{row.payload!==null?(row.inline?<InlineText parsed={row.inline} family={mathFamily}/>:row.kind==='math'?<FormulaPreview formula={row.payload} display family={mathFamily}/>:row.payload):<pre>{row.raw}</pre>}</div>}
      </section>;
    })}</div>
  </div>;
}

function InlineText({parsed,family}){
  const parts=[];let cursor=0;
  const ranges=[...parsed.inlineStyles.map(run=>({...run,kind:'style'})),...parsed.inlineMath.map(atom=>({...atom,end:atom.start+1,kind:'math'}))].sort((a,b)=>a.start-b.start);
  for(const run of ranges){
    if(cursor<run.start)parts.push(parsed.text.slice(cursor,run.start));
    if(run.kind==='math')parts.push(<FormulaPreview key={run.start} formula={run.formula} family={family}/>);
    else parts.push(<span key={run.start} style={{fontWeight:run.fontWeight,fontStyle:run.italic?'italic':undefined,textDecoration:run.underline?'underline':undefined,color:run.color,fontFamily:run.fontFamily,fontSize:run.fontSize?run.fontSize*96/25400+'px':undefined,verticalAlign:run.baseline==='super'?'super':run.baseline==='sub'?'sub':undefined}}>{parsed.text.slice(run.start,run.end)}</span>);
    cursor=run.end;
  }
  parts.push(parsed.text.slice(cursor));return <>{parts}</>;
}
