import React,{useRef} from 'react';
import {FormulaPreview,FormulaTemplates} from './structured-math.jsx';
import {mixedDraftParts,planMixedMath} from './structured-mixed.mjs';
function ProtectedPart({part,family}){
  if(part.kind==='math')return <span className="mixed-protected" data-mixed-math><FormulaPreview formula={part.formula} family={family}/></span>;
  if(part.kind==='reference')return <span className="mixed-protected" data-mixed-reference title={'参照先ID: '+part.target}>数式参照：{part.target}（{part.format==='number'?'番号':'式番号'}）</span>;
  if(part.kind==='style'){const s=part.style;return <span className="mixed-protected" style={{fontWeight:s.fontWeight,fontStyle:s.italic?'italic':undefined,textDecoration:s.underline?'underline':undefined,color:s.color,fontFamily:s.fontFamily,fontSize:s.fontSize?s.fontSize*96/25400+'px':undefined,verticalAlign:s.baseline==='super'?'super':s.baseline==='sub'?'sub':undefined}}>{part.text}</span>;}
  return <span className="mixed-protected">{part.text}</span>;
}
export function MixedParagraph({mixed,draft,setDraft,blocked,onComposition,family,validateDraft}){
  const fields=useRef(new Map()),composing=useRef(false);
  let index=0,layout=mixed,next=null,error='';
  const active=draft?.inlineEdit;
  if(draft)try{layout=mixedDraftParts(mixed,draft);}catch(e){error=String(e.message??e);}
  if(active)try{next=planMixedMath(draft,active);validateDraft(next);}catch(e){next=null;error=String(e.message??e);}
  const disabled=blocked||composing.current;
  function open(request){if(!disabled&&!active)setDraft(d=>({...d,inlineEdit:request}));}
  const change=formula=>setDraft(d=>({...d,inlineEdit:{...d.inlineEdit,formula}}));
  return <div className="structured-mixed">{draft&&<p className="muted">文章と数式を編集できます。参照・既存書式は保持し、参照番号は組版で確定します。</p>}{layout.parts.map((part,i)=>{
    if(part.kind!=='text')return draft&&part.kind==='math'?<button key={i} type="button" className="secondary-action mixed-protected" data-mixed-math-edit={i} disabled={disabled||!!active} onClick={()=>open({mode:'edit',part:i,original:part.raw,formula:part.formula})}><ProtectedPart part={part} family={family}/> 編集</button>:<ProtectedPart key={i} part={part} family={family}/>;
    const n=index++;
    if(!draft)return <React.Fragment key={i}>{part.value}</React.Fragment>;
    return <div key={i} className="mixed-text-field"><label><span className="sr-only">文章部分 {n+1}</span><textarea ref={node=>{if(node)fields.current.set(n,node);else fields.current.delete(n);}} data-mixed-text={n} rows={Math.max(1,Math.min(4,draft.values[n].split('\n').length))} value={draft.values[n]} readOnly={!!active} onCompositionStart={()=>{composing.current=true;onComposition(true);}} onCompositionEnd={()=>{composing.current=false;onComposition(false);}} onChange={e=>setDraft(d=>({...d,values:d.values.map((v,j)=>j===n?e.target.value:v)}))}/></label><button type="button" className="secondary-action" data-mixed-math-insert={n} disabled={disabled||!!active} onMouseDown={e=>e.preventDefault()} onClick={()=>{const node=fields.current.get(n);if(node&&node.selectionStart===node.selectionEnd)open({mode:'insert',part:i,original:node.value,start:node.selectionStart,end:node.selectionEnd,formula:''});}}>∑ 数式を挿入</button></div>;
  })}{active&&<section className="structured-inline-tools" aria-label="本文内数式編集"><strong>{active.mode==='edit'?'数式を編集':'数式を挿入'}</strong><label>数式の内容<input id="mixed-math-formula" autoFocus value={active.formula} onCompositionStart={()=>{composing.current=true;onComposition(true);}} onCompositionEnd={()=>{composing.current=false;onComposition(false);}} onChange={e=>change(e.target.value)}/></label><FormulaTemplates display={false} blocked={disabled} onPick={change}/>{error?<p role="alert" className="structured-error">{error}</p>:<FormulaPreview formula={active.formula} family={family}/>}<div className="structured-actions"><button id="mixed-math-update" type="button" disabled={disabled||!next} onClick={()=>setDraft(next)}>数式を反映</button><button id="mixed-math-cancel" type="button" className="secondary-action" disabled={disabled} onClick={()=>setDraft(d=>({...d,inlineEdit:null}))}>取消</button></div></section>}</div>;
}
