import React,{useRef,useState,useEffect} from 'react';
import {FormulaPreview,FormulaTemplates} from './structured-math.jsx';
import {mixedDraftParts,planMixedMath,mixedRangeProjection} from './structured-mixed.mjs';
function ProtectedPart({part,family}){
  if(part.kind==='math')return <span className="mixed-protected" data-mixed-math><FormulaPreview formula={part.formula} family={family}/></span>;
  if(part.kind==='reference')return <span className="mixed-protected" data-mixed-reference title={'参照先ID: '+part.target}>数式参照：{part.target}（{part.format==='number'?'番号':'式番号'}）</span>;
  if(part.kind==='style'){const s=part.style;return <span className="mixed-protected" style={{fontWeight:s.fontWeight,fontStyle:s.italic?'italic':undefined,textDecoration:s.underline?'underline':undefined,color:s.color,fontFamily:s.fontFamily,fontSize:s.fontSize?s.fontSize*96/25400+'px':undefined,verticalAlign:s.baseline==='super'?'super':s.baseline==='sub'?'sub':undefined}}>{part.text}</span>;}
  return <span className="mixed-protected">{part.text}</span>;
}
export function MixedParagraph({mixed,draft,setDraft,blocked,onComposition,family,validateDraft,onReference,onRemove,validateRemove,onRange,validateRange}){
  const fields=useRef(new Map()),composing=useRef(false);
  let index=0,layout=mixed,next=null,error='';
  const active=draft?.inlineEdit;
  if(draft)try{layout=mixedDraftParts(mixed,draft);}catch(e){error=String(e.message??e);}
  if(active&&active.mode!=='range')try{if(active.mode==='delete')next=validateRemove(draft,active);else{next=planMixedMath(draft,active);validateDraft(next);}}catch(e){next=null;error=String(e.message??e);}
  const disabled=blocked||composing.current;
  if(active?.mode==='range')return <MixedRangePanel draft={draft} blocked={blocked} family={family} onComposition={onComposition} validateRange={validateRange} onRange={onRange} onCancel={()=>setDraft(d=>({...d,inlineEdit:null}))}/>;
  function open(request){if(!disabled&&!active)setDraft(d=>({...d,inlineEdit:request}));}
  const change=formula=>setDraft(d=>({...d,inlineEdit:{...d.inlineEdit,formula}}));
  return <div className="structured-mixed" data-inline-active={!!active}>{draft&&<p className="muted">文章を編集し、数式や参照を選択して変更できます。番号は組版で確定します。</p>}{draft&&<button id="mixed-range-open" type="button" className="secondary-action" disabled={disabled||!!active} onClick={()=>open({mode:'range'})}>文章と数式をまとめて範囲編集</button>}{layout.parts.map((part,i)=>{
    if(draft&&['math','reference'].includes(part.kind))return <span key={i} className="structured-actions mixed-atom-actions">
      {part.kind==='reference'?<button type="button" className="secondary-action mixed-protected" data-mixed-reference-edit={i} disabled={disabled||!!active} onClick={()=>onReference(draft,{mode:'edit',part:i,original:part.raw,targetId:part.target,format:part.format})}><ProtectedPart part={part} family={family}/> 変更</button>:<button type="button" className="secondary-action mixed-protected" data-mixed-math-edit={i} disabled={disabled||!!active} onClick={()=>open({mode:'edit',part:i,original:part.raw,formula:part.formula})}><ProtectedPart part={part} family={family}/> 編集</button>}
      <button type="button" className="secondary-action" data-mixed-remove={i} data-remove-kind={part.kind} disabled={disabled||!!active} onClick={()=>open({mode:'delete',part:i,kind:part.kind,original:part.raw})}>{part.kind==='math'?'数式を削除':'参照を削除'}</button></span>;
    if(part.kind!=='text')return <ProtectedPart key={i} part={part} family={family}/>;
    const n=index++;
    if(!draft)return <React.Fragment key={i}>{part.value}</React.Fragment>;
    return <div key={i} className="mixed-text-field"><label><span className="sr-only">文章部分 {n+1}</span><textarea ref={node=>{if(node)fields.current.set(n,node);else fields.current.delete(n);}} data-mixed-text={n} rows={Math.max(1,Math.min(4,draft.values[n].split('\n').length))} value={draft.values[n]} readOnly={!!active||(blocked&&!composing.current)} onCompositionStart={()=>{composing.current=true;onComposition(true);}} onCompositionEnd={()=>{composing.current=false;onComposition(false);}} onChange={e=>setDraft(d=>({...d,values:d.values.map((v,j)=>j===n?e.target.value:v)}))}/></label><div className="mixed-field-tools"><button type="button" className="secondary-action" data-mixed-math-insert={n} disabled={disabled||!!active} onMouseDown={e=>e.preventDefault()} onClick={()=>{const node=fields.current.get(n);if(node&&node.selectionStart===node.selectionEnd)open({mode:'insert',part:i,original:node.value,start:node.selectionStart,end:node.selectionEnd,formula:''});}}>∑ 数式を挿入</button><button type="button" className="secondary-action" data-mixed-reference-insert={n} disabled={disabled||!!active} onMouseDown={e=>e.preventDefault()} onClick={()=>{const node=fields.current.get(n);if(node&&node.selectionStart===node.selectionEnd)onReference(draft,{mode:'insert',part:i,original:node.value,start:node.selectionStart,end:node.selectionEnd});}}>数式参照を挿入</button></div></div>;
  })}{active?.mode==='delete'?<section className="structured-inline-tools" aria-label="削除の確認"><strong>{active.kind==='math'?'この数式を削除しますか？':'この参照を削除しますか？'}</strong><p className="muted">選択した部品のみ削除し、現在の本文案と一括反映します。独立数式の本体やIDは削除されません。</p>{error&&<p role="alert" className="structured-error">{error} 前後の文章を調整してから再試行してください。</p>}<div className="structured-actions"><button id="mixed-remove-confirm" type="button" disabled={disabled||next===null} onClick={()=>onRemove(draft,active)}>本文と削除を反映</button><button id="mixed-remove-cancel" type="button" className="secondary-action" disabled={disabled} onClick={()=>setDraft(d=>({...d,inlineEdit:null}))}>取消</button></div></section>:active&&<section className="structured-inline-tools" aria-label="本文内数式編集"><strong>{active.mode==='edit'?'数式を編集':'数式を挿入'}</strong><label>数式の内容<input id="mixed-math-formula" autoFocus value={active.formula} onCompositionStart={()=>{composing.current=true;onComposition(true);}} onCompositionEnd={()=>{composing.current=false;onComposition(false);}} onChange={e=>change(e.target.value)}/></label><FormulaTemplates display={false} blocked={disabled} onPick={change}/>{error?<p role="alert" className="structured-error">{error}</p>:<FormulaPreview formula={active.formula} family={family}/>}<div className="structured-actions"><button id="mixed-math-update" type="button" disabled={disabled||!next} onClick={()=>setDraft(next)}>数式を反映</button><button id="mixed-math-cancel" type="button" className="secondary-action" disabled={disabled} onClick={()=>setDraft(d=>({...d,inlineEdit:null}))}>取消</button></div></section>}</div>;
}

function MixedRangePanel({draft,blocked,family,onComposition,validateRange,onRange,onCancel}){
  const root=useRef(null),composing=useRef(false);
  const [selection,setSelection]=useState(null),[replacement,setReplacement]=useState(''),[selectionError,setSelectionError]=useState('');
  let projection=null,error='',candidate=null;
  try{projection=mixedRangeProjection(draft);}catch(e){error=String(e.message??e);}
  const request=projection&&selection?{mode:'range',original:projection.source,...selection,replacement}:null;
  if(request)try{candidate=validateRange(draft,request);}catch(e){error=String(e.message??e);}
  useEffect(()=>{
    const read=()=>{
      const node=root.current,sel=window.getSelection();
      if(!node||!sel?.rangeCount)return;
      const range=sel.getRangeAt(0);
      if(!node.contains(range.startContainer)||!node.contains(range.endContainer))return;
      if(range.collapsed){setSelection(null);setSelectionError('');return;}
      function point(container,offset){
        if(container===node){const child=node.children[offset];return child?Number(child.dataset.rangeStart):Number(node.dataset.rangeLength);}
        const element=(container.nodeType===1?container:container.parentElement)?.closest('[data-range-start]');
        if(!element||element.parentElement!==node)throw Error('本文の範囲を選択してください。');
        const a=Number(element.dataset.rangeStart),b=Number(element.dataset.rangeEnd);
        if(element.dataset.rangeKind!=='text'){
          if(container===element&&offset===0)return a;
          if(container===element&&offset===element.childNodes.length)return b;
          throw Error('数式・参照は前後の文章から部品全体を選択してください。');
        }
        const prefix=document.createRange();prefix.selectNodeContents(element);prefix.setEnd(container,offset);
        return a+prefix.toString().length;
      }
      try{
        const start=point(range.startContainer,range.startOffset),end=point(range.endContainer,range.endOffset);
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end<=start)throw Error('空でない範囲を選択してください。');
        setSelection({start,end});setSelectionError('');
      }catch(e){setSelection(null);setSelectionError(String(e.message??e));}
    };
    document.addEventListener('selectionchange',read);
    return ()=>document.removeEventListener('selectionchange',read);
  },[]);
  const atoms=projection&&selection?projection.parts.filter(p=>p.kind!=='text'&&p.start<selection.end&&p.end>selection.start):[];
  return <section className="structured-inline-tools" aria-label="混在本文の範囲編集">
    <strong>範囲編集</strong><p className="muted">下の文章をドラッグして選択します。数式・参照は一つの部品として扱います。既存書式・特殊記号は保護されます。</p>
    {projection&&<div id="mixed-range-preview" ref={root} className="mixed-range-preview" tabIndex={0} data-range-length={projection.length}>{projection.parts.filter(p=>p.kind!=='text'||p.value.length).map((p,i)=><span key={i} data-range-start={p.start} data-range-end={p.end} data-range-kind={p.kind} className={selection&&p.start<selection.end&&p.end>selection.start&&p.kind!=='text'?'mixed-range-selected':''}>{p.kind==='text'?p.value:<ProtectedPart part={p} family={family}/>}</span>)}</div>}
    <p id="mixed-range-summary" aria-live="polite">{selection?'範囲選択中：数式 '+atoms.filter(p=>p.kind==='math').length+' 件・参照 '+atoms.filter(p=>p.kind==='reference').length+' 件':'範囲を選択してください。'}</p>
    <label>置換後の文章（空欄なら削除）<input id="mixed-range-replacement" value={replacement} disabled={blocked&&!composing.current} onCompositionStart={()=>{composing.current=true;onComposition(true);}} onCompositionEnd={()=>{composing.current=false;onComposition(false);}} onChange={e=>setReplacement(e.target.value)}/></label>
    {(selectionError||error)&&<p role="alert" className="structured-error">{selectionError||error}</p>}
    <p className="muted">反映すると選択範囲の数式・参照も削除されます。独立数式の本体は保持します。現在の本文案も一括反映します。</p>
    <div className="structured-actions"><button id="mixed-range-apply" type="button" disabled={blocked||!request||candidate===null||candidate===draft.source} onClick={()=>onRange(draft,request)}>{replacement?'選択範囲を置換して反映':'選択範囲を削除して反映'}</button><button id="mixed-range-cancel" type="button" className="secondary-action" disabled={blocked} onClick={onCancel}>取消</button></div>
  </section>;
}
