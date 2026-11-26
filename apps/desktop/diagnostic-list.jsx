import React from 'react';

// A range is actionable only if it is verified against the actual source used in the job.
export function diagnosticRecords(diagnostics,documents,error){
  if(!diagnostics.length)return [{code:'PREVIEW_FAILED',message:String(error.message??error)}];
  const sources=new Map(documents.map(d=>[d.documentId,d.source]));
  return diagnostics.map(d=>{
    const source=sources.get(d.documentId),range=d.range;
    const valid=typeof source==='string'&&Number.isSafeInteger(range?.start)&&Number.isSafeInteger(range?.end)&&range.start>=0&&range.end>=range.start&&range.end<=source.length;
    return {code:d.code,message:d.message,documentId:d.documentId,...(valid?{range:{start:range.start,end:range.end},source,line:source.slice(0,range.start).split('\n').length}:{})};
  });
}
export function DiagnosticList({id,diagnostics,blocked,canOpen,onOpen}){
  return <ul id={id} className="preview-diagnostics">{diagnostics.map((d,i)=><li key={i}><div className="diagnostic-title"><strong>{d.code}</strong>{d.documentId&&<span>原稿：{d.documentId}{d.line?' · '+d.line+'行目':''}</span>}</div><p>{d.message}</p>{d.range&&canOpen(d)&&<button type="button" className="secondary-action" data-diagnostic-open={i} disabled={blocked} onClick={()=>onOpen(d)}>原稿の該当箇所を開く</button>}</li>)}</ul>;
}
