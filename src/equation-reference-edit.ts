import {prepareManuscript,type Scan,type Manuscript,type PreparationDependencies} from './manuscript-poc.js';
import {parsePreviewInline} from './inline-preview.js';
import type {InlineEditPlan} from './inline-edit.js';

type Format='number'|'label-number';
const size={width:100000,height:100000};
function prepare<S extends Scan>(documents:readonly Manuscript[],deps:PreparationDependencies<S>){
  if(!deps.parseReference)throw RangeError('Reference parser unavailable');
  const result=prepareManuscript(documents,'1','reference-edit',size,deps);
  if(!result.input)throw RangeError('Resolve manuscript diagnostics before editing references: '+result.diagnostics.map(d=>d.message).join('; '));
  const targets=result.items.flatMap(i=>i.kind==='math'&&i.origin.persistentId&&i.equationNumber?[{id:i.origin.persistentId,number:i.equationNumber,documentId:i.origin.documentId,formula:i.text}]:[]);
  return {items:result.items,targets};
}
export function equationReferenceTargets<S extends Scan>(documents:readonly Manuscript[],deps:PreparationDependencies<S>){
  return prepare(documents,deps).targets;
}
export function planEquationReference<S extends Scan>(documents:readonly Manuscript[],documentId:string,start:number,end:number,targetId:string,format:Format,deps:PreparationDependencies<S>):InlineEditPlan{
  const doc=documents.find(d=>d.documentId===documentId);
  if(!doc||!Number.isSafeInteger(start)||start!==end||start<0||start>doc.source.length||!['number','label-number'].includes(format)||!/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(targetId))throw RangeError('Expected a caret and valid equation reference');
  const before=prepare(documents,deps),target=before.targets.find(t=>t.id===targetId);
  if(!target)throw RangeError('Target must be an identified numbered equation');
  const item=before.items.find(i=>i.kind==='paragraph'&&i.origin.documentId===documentId&&start>=i.origin.range.start&&start<=i.origin.range.start+i.text.length);
  if(!item)throw RangeError('Place the caret on ordinary body text');
  const row=deps.scan(doc.source).blocks.find(b=>b.kind==='raw'&&start>=b.range.start&&start<=b.range.start+doc.source.slice(b.range.start,b.range.end).replace(/(?:\r\n|\r|\n)$/,'').length);
  if(!row)throw RangeError('Place the caret on a nonblank body line');
  const boundaries=new Set([...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(doc.source)].map(g=>g.index));boundaries.add(doc.source.length);
  if(!boundaries.has(start))throw RangeError('Selection splits a grapheme');
  const resolver=(token:string,offset:number)=>{
    const r=deps.parseReference!(token,documentId,offset),ref=r.reference,t=before.targets.find(t=>t.id===ref?.target);
    if(r.diagnostics.length||!t||!ref||!['number','label-number'].includes(ref.format))throw RangeError('Unresolved reference');
    return ref.format==='number'?t.number:'式 ('+t.number+')';
  };
  const parsed=parsePreviewInline(item.text,item.origin.range.start,deps.validateInlineMath,resolver);
  const seg=parsed.sourceMap.segments.find(s=>s.outerStart<=start&&start<=s.outerEnd);
  if(!seg||start>seg.outerStart&&start<seg.outerEnd&&(seg.derived||seg.rawStart!==seg.outerStart||seg.outerEnd-seg.outerStart!==seg.end-seg.start))throw RangeError('Cannot insert inside markup');
  const logical=start===seg.outerStart?seg.start:start===seg.outerEnd?seg.end:seg.start+start-seg.rawStart;
  const token=':ref{target="'+targetId+'" format="'+format+'"}',label=resolver(token,start);
  const next=doc.source.slice(0,start)+token+doc.source.slice(start),delta=token.length;
  const after=prepare(documents.map(d=>d===doc?{...d,source:next}:d),deps);
  const index=before.items.indexOf(item),updated=after.items[index];
  if(after.items.length!==before.items.length||JSON.stringify(before.targets)!==JSON.stringify(after.targets)||after.items.some((a,i)=>{
    const b=before.items[i],local=b.origin.documentId===documentId,shift=local&&i>index?delta:0;
    return a.kind!==b.kind||a.origin.documentId!==b.origin.documentId||a.origin.persistentId!==b.origin.persistentId||a.origin.range.start!==b.origin.range.start+shift||a.origin.range.end!==b.origin.range.end+(local&&i===index?delta:shift)||a.text!==(i===index?b.text.slice(0,start-b.origin.range.start)+token+b.text.slice(start-b.origin.range.start):b.text);
  }))throw RangeError('Reference would change manuscript structure');
  const checked=parsePreviewInline(updated.text,updated.origin.range.start,deps.validateInlineMath,resolver);
  const expectedStyles=parsed.inlineStyles.map(s=>({...s,start:s.start+(s.start>=logical?label.length:0),end:s.end+(s.end>logical?label.length:0)}));
  const expectedAtoms=parsed.inlineMath.map(a=>({...a,start:a.start+(a.start>=logical?label.length:0)}));
  if(checked.text!==parsed.text.slice(0,logical)+label+parsed.text.slice(logical)||JSON.stringify(checked.inlineStyles)!==JSON.stringify(expectedStyles)||JSON.stringify(checked.inlineMath)!==JSON.stringify(expectedAtoms)||!checked.sourceMap.segments.some(s=>s.derived&&s.outerStart===start&&s.outerEnd===start+delta))throw RangeError('Reference would reinterpret surrounding inline content');
  return {patch:{range:{start,end},expected:'',replacement:token},selection:{start,end:start+delta},action:'apply'};
}
