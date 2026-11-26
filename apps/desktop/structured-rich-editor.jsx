import React,{useState,useRef,useEffect} from 'react';
import {richProjection,replaceLogicalText,formatLogicalText,richCaretOffset} from './structured-rich-text.mjs';
import {startRichMath} from './structured-mixed.mjs';
import {FormulaPreview,FormulaTemplates} from './structured-math.jsx';

export function RichTextEditor({draft,setDraft,blocked,parseInline,planFormat,scan,applyPatches,onComposition,renderPreview,onSplit,onReference,validateMixed,family}){
  const parsed=richProjection(draft.value,parseInline);
  const [buffer,setBuffer]=useState(parsed?.text??''),[selection,setSelection]=useState({start:0,end:0}),[error,setError]=useState(''),[color,setColor]=useState('#c2410c'),[size,setSize]=useState('4.2'),[font,setFont]=useState('noto-sans-jp');
  const field=useRef(null),composing=useRef(false),inputSelection=useRef(null);
  useEffect(()=>{
    const node=field.current;if(!node)return;
    const capture=()=>{if(!composing.current)inputSelection.current={value:node.value,start:node.selectionStart,end:node.selectionEnd};};
    node.addEventListener('beforeinput',capture);
    return ()=>node.removeEventListener('beforeinput',capture);
  },[]);
  useEffect(()=>{if(!draft.richError&&!composing.current)setBuffer(parsed?.text??'');},[draft.value,draft.richError]);
  function update(value){
    setBuffer(value);
    if(composing.current)return;
    const snapshot=inputSelection.current;inputSelection.current=null;
    try{const raw=replaceLogicalText(draft.value,value,parseInline,snapshot?.value===parsed?.text?snapshot:undefined);setDraft(d=>({...d,value:raw,richError:false}));setError('');}
    catch(e){setError(String(e.message??e));setDraft(d=>({...d,richError:true}));}
  }
  function format(kind){
    if(!parsed||!field.current||blocked||draft.richError||draft.inlineEdit||composing.current)return;
    try{
      const start=field.current.selectionStart,end=field.current.selectionEnd;
      const raw=formatLogicalText(draft.value,start,end,kind,parseInline);
      if(richProjection(raw,parseInline)?.text!==buffer)throw Error('文章が変化するため書式変更できません。');
      setDraft(d=>({...d,value:raw,richError:false}));setError('');
      requestAnimationFrame(()=>{if(field.current){field.current.focus();field.current.setSelectionRange(start,end);}});
    }catch(e){setError(String(e.message??e));}
  }
  const active=draft.inlineEdit;
  let mathNext=null,mathError='';
  if(active)try{mathNext=startRichMath(draft,active.offset,active.formula);validateMixed(mathNext);}catch(e){mathNext=null;mathError=String(e.message??e);}
  function openInsert(kind){
    if(blocked||draft.richError||active||composing.current||!field.current)return;
    try{
      const offset=richCaretOffset(draft.value,parseInline,field.current.selectionStart,field.current.selectionEnd);
      setError('');
      if(kind==='reference')onReference(draft,offset);
      else setDraft(d=>({...d,inlineEdit:{offset,formula:''}}));
    }catch(e){setError(String(e.message??e));}
  }
  const changeFormula=formula=>setDraft(d=>({...d,inlineEdit:{...d.inlineEdit,formula}}));
  const selected=selection.end>selection.start,disabled=blocked||draft.richError||!!active||!selected;
  const chosen=parsed?.sourceMap.segments.filter(s=>s.start<selection.end&&s.end>selection.start)??[];
  const toggleState=key=>{
    const flag={bold:['fontWeight',700],italic:['italic',true],underline:['underline',true]}[key];
    if(!flag||!selected||!chosen.length)return undefined;
    const count=chosen.filter(s=>parsed.inlineStyles.find(r=>r.start===s.start&&r.end===s.end)?.[flag[0]]===flag[1]).length;
    return count===chosen.length?true:count?'mixed':false;
  };
  const formatButton=(key,label,kind)=> <button key={key} type="button" data-rich-format={key} aria-pressed={toggleState(key)} disabled={disabled} onMouseDown={e=>e.preventDefault()} onClick={()=>format(kind)}>{label}</button>;
  return <div className="structured-rich-editor"><label>文章<textarea id="structured-rich-value" ref={field} autoFocus rows={draft.row.kind==='heading'?2:4} value={buffer} disabled={(blocked&&!composing.current)||!!active} onSelect={e=>setSelection({start:e.currentTarget.selectionStart,end:e.currentTarget.selectionEnd})} onKeyDown={e=>{if(onSplit&&!active&&(e.ctrlKey||e.metaKey)&&e.key==='Enter'&&!e.nativeEvent.isComposing&&!composing.current){e.preventDefault();onSplit(e.currentTarget.selectionStart,e.currentTarget.selectionEnd);}}} onKeyUp={e=>setSelection({start:e.currentTarget.selectionStart,end:e.currentTarget.selectionEnd})} onPointerUp={e=>setSelection({start:e.currentTarget.selectionStart,end:e.currentTarget.selectionEnd})} onCompositionStart={e=>{inputSelection.current={value:e.currentTarget.value,start:e.currentTarget.selectionStart,end:e.currentTarget.selectionEnd};composing.current=true;onComposition(true);}} onCompositionEnd={e=>{composing.current=false;onComposition(false);update(e.currentTarget.value);}} onChange={e=>update(e.target.value)}/></label>
    {selected&&<div className="structured-actions rich-format-toolbar" role="toolbar" aria-label="選択文字の書式">{formatButton('bold','太字','bold')}{formatButton('italic','斜体','italic')}{formatButton('underline','下線','underline')}<details><summary>詳細書式</summary><div className="structured-actions"><label>色<input type="color" value={color} onChange={e=>setColor(e.target.value)}/></label>{formatButton('color','色を適用',{color})}{formatButton('clear-color','色を解除',{color:null})}<label>サイズ (mm)<input type="number" min="1" max="30" step="0.1" value={size} onChange={e=>setSize(e.target.value)}/></label>{formatButton('size','サイズを適用',{fontSize:Math.round(Number(size)*1000)})}{formatButton('clear-size','サイズを解除',{fontSize:null})}<label>フォント<select value={font} onChange={e=>setFont(e.target.value)}><option value="noto-sans-jp">Noto Sans JP</option><option value="system-serif">明朝・セリフ</option><option value="system-sans">ゴシック</option><option value="system-monospace">等幅</option></select></label>{formatButton('font','フォントを適用',{font})}{formatButton('clear-font','フォントを解除',{font:null})}</div></details></div>}
    {error&&<p className="structured-error" role="alert">{error}</p>}{draft.richError&&<button type="button" className="secondary-action" disabled={blocked} onClick={()=>{setBuffer(parsed?.text??'');setDraft(d=>({...d,richError:false}));setError('');}}>最後に有効だった入力へ戻す</button>}
    {onSplit&&<div className="structured-actions"><button id="rich-math-insert" type="button" disabled={blocked||draft.richError||!!active} onMouseDown={e=>e.preventDefault()} onClick={()=>openInsert('math')}>∑ 数式を挿入</button><button id="rich-reference-insert" type="button" disabled={blocked||draft.richError||!!active} onMouseDown={e=>e.preventDefault()} onClick={()=>openInsert('reference')}>数式参照を挿入</button></div>}
    {active&&<section className="structured-inline-tools" aria-label="本文内数式挿入"><label>数式の内容<input id="rich-math-formula" autoFocus value={active.formula} onCompositionStart={()=>{composing.current=true;onComposition(true);}} onCompositionEnd={()=>{composing.current=false;onComposition(false);}} onChange={e=>changeFormula(e.target.value)}/></label><FormulaTemplates display={false} blocked={blocked} onPick={changeFormula}/>{mathError?<p role="alert" className="structured-error">{mathError}</p>:<FormulaPreview formula={active.formula} family={family}/>}<div className="structured-actions"><button id="rich-math-update" type="button" disabled={blocked||!mathNext} onClick={()=>setDraft(mathNext)}>数式を反映</button><button id="rich-math-cancel" type="button" disabled={blocked} onClick={()=>setDraft(d=>({...d,inlineEdit:null}))}>取消</button></div></section>}
    {onSplit&&<button type="button" id="rich-split" className="secondary-action" disabled={blocked||draft.richError||!!active} onClick={()=>{if(field.current)onSplit(field.current.selectionStart,field.current.selectionEnd);}}>カーソルで段落を分割（Ctrl+Enter）</button>}<div className="rich-text-preview"><small>書式プレビュー（組版前）</small><div className="structured-content">{parsed&&renderPreview(parsed)}</div></div>
    <button type="button" className="secondary-action" id="rich-to-markup" disabled={blocked||draft.richError||!!active} onClick={()=>setDraft(d=>({...d,rich:false}))}>記法編集へ切り替え</button>
  </div>;
}
