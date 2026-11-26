import React from 'react';
import {FormulaPreview} from './structured-math.jsx';
import {parseStudyText} from './structured-study.mjs';

const names={note:'補足',tip:'ポイント',warning:'注意',important:'重要',example:'例題',exercise:'練習問題',explanation:'解説'};
function StudyText({parsed,family}){
  const parts=[];let cursor=0;
  const ranges=[...parsed.inlineStyles.map(run=>({...run,kind:'style'})),...parsed.inlineMath.map(atom=>({...atom,end:atom.start+1,kind:'math'}))].sort((a,b)=>a.start-b.start);
  for(const run of ranges){
    if(cursor<run.start)parts.push(parsed.text.slice(cursor,run.start));
    if(run.kind==='math')parts.push(<FormulaPreview key={run.start} formula={run.formula} display={!!run.display} family={family}/>);
    else parts.push(<span key={run.start} style={{fontWeight:run.fontWeight,fontStyle:run.italic?'italic':undefined,textDecoration:run.underline?'underline':undefined,color:run.color,fontFamily:run.fontFamily,fontSize:run.fontSize?run.fontSize*96/25400+'px':undefined,verticalAlign:run.baseline==='super'?'super':run.baseline==='sub'?'sub':undefined}}>{parsed.text.slice(run.start,run.end)}</span>);
    cursor=run.end;
  }
  parts.push(parsed.text.slice(cursor));return <>{parts}</>;
}
export function StudyEditor({study,library,active,draft,blocked,editable,otherDraft,onEdit,onSource,onLinks,onChange,onApply,onCancel,onComposition,error,planned,source,mathFamily}){
  const entry=study.customId?library?.entries.find(e=>e.id===study.customId&&e.usage==='study'):null;
  const missing=!!study.customId&&!entry;
  const name=names[study.kind]??entry?.name??'未登録の教材部品';
  return <div className="structured-study" data-study-kind={study.kind??'custom'}>
    <div className="structured-block-heading"><strong>{name}{study.title?'：'+study.title:''}</strong>{!active&&<div className="structured-actions"><button type="button" data-study-edit disabled={!editable||blocked||otherDraft||missing} onClick={onEdit}>内容を編集</button>{(study.kind==='example'||study.kind==='exercise'||study.kind==='explanation'||study.customId)&&<button type="button" className="secondary-action" data-study-links disabled={!editable||blocked||otherDraft||missing} onClick={onLinks}>ID・関連付け</button>}<button type="button" className="secondary-action" data-study-source disabled={blocked||otherDraft} onClick={onSource}>ソースで開く</button></div>}</div>
    <div className="structured-study-meta">{study.id&&<span>ID: {study.id}</span>}{study.answerTo&&<span>解答先: {study.answerTo}</span>}{study.customId&&<span>登録部品: {study.customId}</span>}</div>
    {missing&&<p className="muted">対応する登録部品が見つかりません。デザインを確認してください。</p>}
    <p className="muted">内容の簡易表示です。外観・自動採番はデザイン／組版で確認できます。</p>
    {study.fields.map((f,i)=>{
      const value=active?draft.values[i]:f.value;let parsed=f.parsed,invalid='';
      if(active)try{parsed=parseStudyText(value);}catch(e){parsed=null;invalid=String(e.message??e);}
      return <section key={f.name} className="structured-study-field" data-study-field={f.name}><label>{f.name==='content'?'本文':f.name}{active&&<textarea data-study-value={f.name} rows={5} value={value} onCompositionStart={()=>onComposition(true)} onCompositionEnd={()=>onComposition(false)} onChange={e=>onChange(i,e.target.value)}/>}</label>{invalid?<p className="structured-error" role="alert">{invalid}</p>:<div className="structured-content" data-study-preview><StudyText parsed={parsed} family={mathFamily}/></div>}</section>;
    })}
    {active&&<>{error&&<p className="structured-error" role="alert">{error}</p>}<div className="structured-actions"><button id="structured-study-apply" type="button" disabled={blocked||!editable||missing||planned===null||planned===source} onClick={onApply}>反映</button><button id="structured-study-cancel" type="button" className="secondary-action" disabled={blocked} onClick={onCancel}>キャンセル</button></div></>}
  </div>;
}
