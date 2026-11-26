import React,{useLayoutEffect} from 'react';
import {createPreviewMath,parsePreviewMath,parseDisplayMath} from '../../../BookCreator_LayoutEngine/dist/index.js';

export function FormulaPreview({formula,display=false,family}){
  const ref=React.useRef(null);
  useLayoutEffect(()=>{
    const target=ref.current;if(!target)return;
    target.replaceChildren();
    try{target.append(createPreviewMath(document,formula,display?'block':'inline',family));target.dataset.state='ready';}
    catch{target.textContent='数式を表示できません';target.dataset.state='invalid';}
  },[formula,display,family]);
  return <span ref={ref} className={display?'structured-math-block':'structured-math-inline'} data-structured-math={display?'display':'inline'}/>;
}
const templates=[['分数','\\frac{a}{b}'],['平方根','\\sqrt{x}'],['指数・添字','x_1^2'],['総和','\\sum_{k=1}^{n}k'],['三角関数','\\sin x'],['極限','\\lim_{x\\to0}x'],['行列','\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}'],['場合分け','\\begin{cases}x&x\\geq0\\\\-x&x<0\\end{cases}']];
export function FormulaTemplates({display,blocked,onPick}){
  const available=templates.filter(([,value])=>{try{(display?parseDisplayMath:parsePreviewMath)(value);return true;}catch{return false;}});
  return <div className="structured-actions" aria-label="数式テンプレート">{available.map(([name,value])=><button key={name} type="button" className="secondary-action" data-structured-template={name} disabled={blocked} title="数式全体をテンプレートに置換" onClick={()=>onPick(value)}>{name}</button>)}</div>;
}
export function InlineMathTools({draft,setDraft,parseInline,blocked,family,onComposition}){
  let atoms=[];
  try{const p=parseInline(draft.value);atoms=p.inlineMath.map(atom=>{const s=p.sourceMap.segments.find(s=>s.start===atom.start&&s.end===atom.start+1&&!s.derived);return s&&draft.value.slice(s.outerStart,s.outerEnd)==='$'+atom.formula+'$'?{formula:atom.formula,start:s.outerStart,end:s.outerEnd}:null;}).filter(Boolean);}catch{}
  const active=draft.inlineEdit;
  let next=null,error='';
  if(active)try{
    if(active.original!==draft.value||!atoms.some(a=>a.start===active.start&&a.end===active.end&&a.formula===active.originalFormula))throw Error('元の数式範囲が変化しました。');
    if(active.formula.trim()!==active.formula||/[\r\n$]/.test(active.formula))throw Error('本文内数式には改行・ドル記号・前後の空白を入れられません。');
    parsePreviewMath(active.formula);
    next=draft.value.slice(0,active.start)+'$'+active.formula+'$'+draft.value.slice(active.end);
    parseInline(next);
  }catch(e){next=null;error=String(e.message??e);}
  if(!active&&!atoms.length)return null;
  const change=formula=>setDraft(d=>({...d,inlineEdit:{...d.inlineEdit,formula}}));
  return <section className="structured-inline-tools"><strong>本文内数式</strong>{active?<><label>数式の内容<input id="structured-inline-formula" value={active.formula} onCompositionStart={()=>onComposition(true)} onCompositionEnd={()=>onComposition(false)} onChange={e=>change(e.target.value)}/></label><FormulaTemplates display={false} blocked={blocked} onPick={change}/>{error?<p className="structured-error" role="alert">{error}</p>:<FormulaPreview formula={active.formula} family={family}/>}<div className="structured-actions"><button type="button" id="structured-inline-update" disabled={blocked||next===null||next===draft.value} onClick={()=>setDraft(d=>({...d,value:next,inlineEdit:null}))}>数式を更新</button><button type="button" className="secondary-action" disabled={blocked} onClick={()=>setDraft(d=>({...d,inlineEdit:null}))}>取消</button></div></>:<div className="structured-actions">{atoms.map((a,i)=><button key={a.start} type="button" data-structured-inline-edit={i} disabled={blocked} onClick={()=>setDraft(d=>({...d,inlineEdit:{...a,original:d.value,originalFormula:a.formula}}))}><FormulaPreview formula={a.formula} family={family}/> 編集</button>)}</div>}</section>;
}
