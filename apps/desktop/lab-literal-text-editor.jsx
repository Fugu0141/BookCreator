import React,{useState,useRef,useEffect} from 'react';

export function validLiteralText(value){
  return typeof value==='string'&&value.length>=1&&value.length<=256&&!/[\p{Cc}\p{Cs}\p{Cf}\p{Zl}\p{Zp}]/u.test(value);
}
export function LabLiteralTextEditor({initial,disabled,onCommit,onCancel}){
  const [value,setValue]=useState(initial),[composing,setComposing]=useState(false);
  const input=useRef(null),ime=useRef(false);
  useEffect(()=>{input.current?.focus();input.current?.select();},[]);
  const valid=validLiteralText(value);
  function submit(){if(!disabled&&!ime.current&&valid)onCommit(value);}
  return <div className="lab-literal-editor" role="group" aria-label="固定文字の直接編集">
    <label htmlFor="lab-direct-text">固定文字を編集</label>
    <div className="lab-literal-row">
      <input ref={input} id="lab-direct-text" value={value} maxLength={256} disabled={disabled} aria-invalid={!valid}
        onChange={e=>setValue(e.target.value)}
        onCompositionStart={()=>{ime.current=true;setComposing(true);}}
        onCompositionEnd={()=>{ime.current=false;setComposing(false);}}
        onKeyDown={e=>{
          if(ime.current||e.nativeEvent.isComposing||e.keyCode===229)return;
          if(e.key==='Enter'){e.preventDefault();e.stopPropagation();submit();}
          if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onCancel();}
        }}/>
      <button id="lab-direct-text-apply" type="button" disabled={disabled||composing||!valid} onClick={submit}>確定</button>
      <button id="lab-direct-text-cancel" type="button" disabled={composing} onClick={onCancel}>取消</button>
    </div>
    {!valid&&<small role="status">1～256文字の固定文字を入力してください。改行・制御文字は使えません。</small>}
    <small>Enterで確定、Escで取消。原稿スロットの内容は変更しません。</small>
  </div>;
}
