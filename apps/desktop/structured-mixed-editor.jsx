import React from 'react';
import {FormulaPreview} from './structured-math.jsx';
function ProtectedPart({part,family}){
  if(part.kind==='math')return <span className="mixed-protected" data-mixed-math><FormulaPreview formula={part.formula} family={family}/></span>;
  if(part.kind==='reference')return <span className="mixed-protected" data-mixed-reference title={'参照先ID: '+part.target}>数式参照：{part.target}（{part.format==='number'?'番号':'式番号'}）</span>;
  if(part.kind==='style'){const s=part.style;return <span className="mixed-protected" style={{fontWeight:s.fontWeight,fontStyle:s.italic?'italic':undefined,textDecoration:s.underline?'underline':undefined,color:s.color,fontFamily:s.fontFamily,fontSize:s.fontSize?s.fontSize*96/25400+'px':undefined,verticalAlign:s.baseline==='super'?'super':s.baseline==='sub'?'sub':undefined}}>{part.text}</span>;}
  return <span className="mixed-protected">{part.text}</span>;
}
export function MixedParagraph({mixed,draft,setDraft,blocked,onComposition,family}){
  let index=0;
  return <div className="structured-mixed">{draft&&<p className="muted">数式・参照・書式は保持し、前後の文章を編集できます。参照番号は組版で確定します。</p>}{mixed.parts.map((part,i)=>{
    if(part.kind!=='text')return <ProtectedPart key={i} part={part} family={family}/>;
    const n=index++;
    if(!draft)return <React.Fragment key={i}>{part.value}</React.Fragment>;
    return <label key={i} className="mixed-text-field"><span className="sr-only">文章部分 {n+1}</span><textarea data-mixed-text={n} rows={Math.max(1,Math.min(4,draft.values[n].split('\n').length))} value={draft.values[n]} onCompositionStart={()=>onComposition(true)} onCompositionEnd={()=>onComposition(false)} onChange={e=>setDraft(d=>({...d,values:d.values.map((v,j)=>j===n?e.target.value:v)}))}/></label>;
  })}</div>;
}
