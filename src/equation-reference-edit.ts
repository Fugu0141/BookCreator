import {prepareManuscript,numberedEquationTargets,createEquationResolver,type SemanticItem,type Scan,type Manuscript,type PreparationDependencies} from './manuscript-poc.js';
import {parsePreviewInline} from './inline-preview.js';
import type {InlineEditPlan} from './inline-edit.js';

type Format='number'|'label-number';
const size={width:100000,height:100000};
function prepare<S extends Scan>(documents:readonly Manuscript[],deps:PreparationDependencies<S>){
  if(!deps.parseReference)throw RangeError('Reference parser unavailable');
  const result=prepareManuscript(documents,'1','reference-edit',size,deps);
  if(!result.input)throw RangeError('Resolve manuscript diagnostics before editing references: '+result.diagnostics.map(d=>d.message).join('; '));
  const targets=numberedEquationTargets(result.items);
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
  const slots=(item:SemanticItem)=>item.kind==='paragraph'||item.kind==='study'?[{name:'content',text:item.text,start:item.sourceTextStart??item.origin.range.start},...(item.namedSlots??[]).map(s=>({name:s.name,text:s.text,start:s.sourceTextStart!}))]:[];
  const candidates=before.items.filter(i=>i.origin.documentId===documentId).flatMap(item=>slots(item).map(slot=>({item,slot})));
  const candidate=candidates.find(({slot})=>start>=slot.start&&start<=slot.start+slot.text.length);
  if(!candidate)throw RangeError('Place the caret on ordinary body or study slot text');
  const {item,slot}=candidate;
  if(doc.source.slice(slot.start,slot.start+slot.text.length)!==slot.text)throw RangeError('Cannot establish exact slot source');
  const rawRows=(blocks:Scan['blocks']):Scan['blocks'][number][]=>blocks.flatMap(b=>b.kind==='raw'?[b]:b.kind==='directive'?rawRows(b.children):[]);
  const row=rawRows(deps.scan(doc.source).blocks).find(b=>b.range.start>=slot.start&&start>=b.range.start&&start<=b.range.start+doc.source.slice(b.range.start,b.range.end).replace(/(?:\r\n|\r|\n)$/,'').length);
  if(!row)throw RangeError('Place the caret on a nonblank body line');
  const boundaries=new Set([...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(doc.source)].map(g=>g.index));boundaries.add(doc.source.length);
  if(!boundaries.has(start))throw RangeError('Selection splits a grapheme');
  const resolver=createEquationResolver(before.items,deps,documentId)!;
  const parsed=parsePreviewInline(slot.text,slot.start,deps.validateInlineMath,resolver,item.kind==='study',deps.validateDisplayMath,item.componentEquations);
  const seg=parsed.sourceMap.segments.find(s=>s.outerStart<=start&&start<=s.outerEnd);
  if(!seg||start>seg.outerStart&&start<seg.outerEnd&&(seg.derived||seg.rawStart!==seg.outerStart||seg.outerEnd-seg.outerStart!==seg.end-seg.start))throw RangeError('Cannot insert inside markup');
  const logical=start===seg.outerStart?seg.start:start===seg.outerEnd?seg.end:seg.start+start-seg.rawStart;
  const token=':ref{target="'+targetId+'" format="'+format+'"}',label=resolver(token,start);
  const next=doc.source.slice(0,start)+token+doc.source.slice(start),delta=token.length;
  const after=prepare(documents.map(d=>d===doc?{...d,source:next}:d),deps);
  const index=before.items.indexOf(item),updated=after.items[index];
  if(after.items.length!==before.items.length||JSON.stringify(before.targets)!==JSON.stringify(after.targets)||after.items.some((a,i)=>{
    const b=before.items[i],local=b.origin.documentId===documentId,shift=local&&i>index?delta:0;
    if(a.kind!==b.kind||a.origin.documentId!==b.origin.documentId||a.origin.persistentId!==b.origin.persistentId||a.origin.range.start!==b.origin.range.start+shift||a.origin.range.end!==b.origin.range.end+(local&&i===index?delta:shift))return true;
    if(i!==index)return a.text!==b.text;
    const oldSlots=slots(b),newSlots=slots(a);
    return oldSlots.length!==newSlots.length||oldSlots.some((s,j)=>{
      const n=newSlots[j],selected=s.name===slot.name;
      const expected=selected?s.text.slice(0,start-s.start)+token+s.text.slice(start-s.start):s.text;
      return n.name!==s.name||n.text!==expected||n.start!==s.start+(!selected&&s.start>start?delta:0);
    });
  }))throw RangeError('Reference would change manuscript structure');
  const updatedSlot=slots(updated).find(s=>s.name===slot.name)!;
  const checked=parsePreviewInline(updatedSlot.text,updatedSlot.start,deps.validateInlineMath,resolver,updated.kind==='study',deps.validateDisplayMath,updated.componentEquations);
  const expectedStyles=parsed.inlineStyles.map(s=>({...s,start:s.start+(s.start>=logical?label.length:0),end:s.end+(s.end>logical?label.length:0)}));
  const expectedAtoms=parsed.inlineMath.map(a=>({...a,start:a.start+(a.start>=logical?label.length:0)}));
  if(checked.text!==parsed.text.slice(0,logical)+label+parsed.text.slice(logical)||JSON.stringify(checked.inlineStyles)!==JSON.stringify(expectedStyles)||JSON.stringify(checked.inlineMath)!==JSON.stringify(expectedAtoms)||!checked.sourceMap.segments.some(s=>s.derived&&s.outerStart===start&&s.outerEnd===start+delta))throw RangeError('Reference would reinterpret surrounding inline content');
  return {patch:{range:{start,end},expected:'',replacement:token},selection:{start,end:start+delta},action:'apply'};
}
