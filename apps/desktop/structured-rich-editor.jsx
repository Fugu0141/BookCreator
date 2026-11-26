import React,{useState,useRef,useEffect} from 'react';
import {richProjection,replaceLogicalText,logicalFormatRange} from './structured-rich-text.mjs';

export function RichTextEditor({draft,setDraft,blocked,parseInline,planFormat,scan,applyPatches,onComposition,renderPreview}){
  const parsed=richProjection(draft.value,parseInline);
  const [buffer,setBuffer]=useState(parsed?.text??''),[selection,setSelection]=useState({start:0,end:0}),[error,setError]=useState(''),[color,setColor]=useState('#c2410c'),[size,setSize]=useState('4.2'),[font,setFont]=useState('noto-sans-jp');
  const field=useRef(null),composing=useRef(false);
  useEffect(()=>{if(!draft.richError&&!composing.current)setBuffer(parsed?.text??'');},[draft.value,draft.richError]);
  function update(value){
    setBuffer(value);
    if(composing.current)return;
    try{const raw=replaceLogicalText(draft.value,value,parseInline);setDraft(d=>({...d,value:raw,richError:false}));setError('');}
    catch(e){setError(String(e.message??e));setDraft(d=>({...d,richError:true}));}
  }
  function format(kind){
    if(!parsed||!field.current||blocked||draft.richError||composing.current)return;
    try{
      const start=field.current.selectionStart,end=field.current.selectionEnd;
      const range=logicalFormatRange(parsed,start,end),p=planFormat(draft.value,range.start,range.end,kind,scan),raw=applyPatches(draft.value,[p.patch]);
      if(richProjection(raw,parseInline)?.text!==buffer)throw Error('文章が変化するため書式変更できません。');
      setDraft(d=>({...d,value:raw,richError:false}));setError('');
      requestAnimationFrame(()=>{if(field.current){field.current.focus();field.current.setSelectionRange(start,end);}});
    }catch(e){setError(String(e.message??e));}
  }
  const selected=selection.end>selection.start,disabled=blocked||draft.richError||!selected;
  const formatButton=(key,label,kind)=> <button key={key} type="button" data-rich-format={key} disabled={disabled} onMouseDown={e=>e.preventDefault()} onClick={()=>format(kind)}>{label}</button>;
  return <div className="structured-rich-editor"><label>文章<textarea id="structured-rich-value" ref={field} autoFocus rows={draft.row.kind==='heading'?2:4} value={buffer} disabled={blocked&&!composing.current} onSelect={e=>setSelection({start:e.currentTarget.selectionStart,end:e.currentTarget.selectionEnd})} onCompositionStart={()=>{composing.current=true;onComposition(true);}} onCompositionEnd={e=>{composing.current=false;onComposition(false);update(e.currentTarget.value);}} onChange={e=>update(e.target.value)}/></label>
    {selected&&<div className="structured-actions rich-format-toolbar" role="toolbar" aria-label="選択文字の書式">{formatButton('bold','太字','bold')}{formatButton('italic','斜体','italic')}{formatButton('underline','下線','underline')}<details><summary>詳細書式</summary><div className="structured-actions"><label>色<input type="color" value={color} onChange={e=>setColor(e.target.value)}/></label>{formatButton('color','色を適用',{color})}{formatButton('clear-color','色を解除',{color:null})}<label>サイズ (mm)<input type="number" min="1" max="30" step="0.1" value={size} onChange={e=>setSize(e.target.value)}/></label>{formatButton('size','サイズを適用',{fontSize:Math.round(Number(size)*1000)})}{formatButton('clear-size','サイズを解除',{fontSize:null})}<label>フォント<select value={font} onChange={e=>setFont(e.target.value)}><option value="noto-sans-jp">Noto Sans JP</option><option value="system-serif">明朝・セリフ</option><option value="system-sans">ゴシック</option><option value="system-monospace">等幅</option></select></label>{formatButton('font','フォントを適用',{font})}{formatButton('clear-font','フォントを解除',{font:null})}</div></details></div>}
    {error&&<p className="structured-error" role="alert">{error}</p>}{draft.richError&&<button type="button" className="secondary-action" disabled={blocked} onClick={()=>{setBuffer(parsed?.text??'');setDraft(d=>({...d,richError:false}));setError('');}}>最後に有効だった入力へ戻す</button>}
    <div className="rich-text-preview"><small>書式プレビュー（組版前）</small><div className="structured-content">{parsed&&renderPreview(parsed)}</div></div>
    <button type="button" className="secondary-action" id="rich-to-markup" disabled={blocked||draft.richError} onClick={()=>setDraft(d=>({...d,rich:false}))}>記法編集へ切り替え</button>
  </div>;
}
