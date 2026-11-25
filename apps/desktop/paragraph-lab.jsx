import React,{useEffect,useRef,useState} from 'react';
import {defaultParagraphDesign,compileParagraphDesign} from '../../dist/index.js';
import {createPlainTextPagePreview} from '../../../BookCreator_LayoutEngine/dist/index.js';
export function ParagraphLab({design,bodyFont,fontOptions,width,height,busy,onApply,onCancel}){
  const [draft,setDraft]=useState(()=>structuredClone(design??defaultParagraphDesign()));
  const [sample,setSample]=useState('これは本文フレームのサンプルです。文章の長さに応じて改行し、複数ページに分割されます。'.repeat(12));
  const [ready,setReady]=useState(false),[message,setMessage]=useState('未計測');
  const target=useRef(null),generation=useRef(0);
  useEffect(()=>()=>{generation.current++;},[]);
  function invalidate(){generation.current++;target.current?.replaceChildren();setReady(false);setMessage('未計測');}
  function update(patch){invalidate();setDraft(d=>({...d,...patch}));}
  function font(id){invalidate();setDraft(d=>{const {font:old,...rest}=d;const f=fontOptions.find(o=>o.id===id);return f?{...rest,font:{id,weight:f.weights.includes(400)?400:f.weights[0]}}:rest;});}
  async function measure(){
    invalidate();const job=generation.current;
    try{
      const compiled=compileParagraphDesign(draft,bodyFont);
      const result=await createPlainTextPagePreview(document,{revision:String(job),fingerprint:'paragraph-lab-'+job,width,height,blocks:[{origin:{documentId:'sample',revision:String(job),blockKey:'paragraph'},request:{text:sample,width,fontSize:compiled.fontSize,lineHeight:compiled.lineHeight,...compiled.textStyle},splitPolicy:'allow',component:compiled.component}]});
      if(job!==generation.current)return;target.current.append(result.element);setReady(true);setMessage(result.plan.pages.length+' ページ · '+result.slices.length+' 断片');
    }catch(e){if(job===generation.current)setMessage(String(e.message??e));}
  }
  const weights=fontOptions.find(o=>o.id===draft.font?.id)?.weights??[];
  return <div className="lab-overlay"><section className="component-lab" role="dialog" aria-modal="true" aria-label="Paragraph Lab"><header><strong>Paragraph Lab / 本文段落</strong><button id="paragraph-cancel" disabled={busy} onClick={onCancel}>破棄して閉じる</button></header><div className="lab-grid"><section><h3>本文フレーム</h3><p>原稿スロットを一つ持つ分割可能な部品です。背景・余白は各ページの断片に繰り返します。</p><label>フォント<select id="paragraph-font" value={draft.font?.id??''} disabled={busy} onChange={e=>font(e.target.value)}><option value="">本文フォントを継承</option>{fontOptions.map(f=><option key={f.id} value={f.id} disabled={f.disabled}>{f.label}</option>)}</select></label>{draft.font&&<label>ウェイト<select id="paragraph-weight" value={draft.font.weight} disabled={busy} onChange={e=>update({font:{...draft.font,weight:Number(e.target.value)}})}>{weights.map(w=><option key={w}>{w}</option>)}</select></label>}<label>文字サイズ (mm)<input id="paragraph-size" type="number" min="2" max="30" step=".1" value={draft.fontSize/1000} disabled={busy} onChange={e=>update({fontSize:Math.round(Number(e.target.value)*1000)})}/></label><label>行高倍率<input id="paragraph-line-height" type="number" min="1.25" max="4" step=".05" value={draft.lineHeight} disabled={busy} onChange={e=>update({lineHeight:Number(e.target.value)})}/></label><label>内側余白 (mm)<input id="paragraph-padding" type="number" min="0" max="100" step=".1" value={draft.padding/1000} disabled={busy} onChange={e=>update({padding:Math.round(Number(e.target.value)*1000)})}/></label><label>背景色<input id="paragraph-background" type="color" value={draft.background} disabled={busy} onChange={e=>update({background:e.target.value})}/></label><label>文字色<input id="paragraph-color" type="color" value={draft.textColor} disabled={busy} onChange={e=>update({textColor:e.target.value})}/></label></section><section><h3>実測サンプル</h3><label>サンプル<textarea id="paragraph-sample" rows={5} maxLength={10000} value={sample} disabled={busy} onChange={e=>{invalidate();setSample(e.target.value.replace(/[\r\n]/g,' '));}}/></label><button id="paragraph-measure" disabled={busy} onClick={()=>void measure()}>実測プレビュー</button><div id="paragraph-status" role="status">{message}</div><div id="paragraph-preview" ref={target}/></section></div><footer><button id="paragraph-apply" disabled={busy||!ready} onClick={()=>onApply(draft)}>本文フレームを適用・保存</button>{design&&<button id="paragraph-reset" disabled={busy} onClick={()=>{if(window.confirm('本文を標準スタイルへ戻しますか？'))onApply(null);}}>標準本文へ戻す</button>}<span>複雑な装飾・図表・正式出版は未対応。</span></footer></section></div>;
}
