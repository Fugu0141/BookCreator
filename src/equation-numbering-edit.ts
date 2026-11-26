import {prepareManuscript,type Scan,type Manuscript,type PreparationDependencies} from './manuscript-poc.js';
import {inspectDisplayMath} from './math-edit.js';
import type {InlineEditPlan} from './inline-edit.js';

const size={width:100000,height:100000};
function prepare<S extends Scan>(docs:readonly Manuscript[],deps:PreparationDependencies<S>){
  if(!deps.parseReference||!deps.validateDisplayMath)throw RangeError('Equation/reference validator unavailable');
  const p=prepareManuscript(docs,'1','equation-numbering-edit',size,deps);
  if(!p.input)throw RangeError('Book validation failed: '+p.diagnostics.map(d=>d.message).join('; '));
  return p.items;
}
/** Change only the selected display equation, retaining its ID and exact formula.
 * The entire supported book must validate both before and after the edit. */
export function planEquationNumbering<S extends Scan>(docs:readonly Manuscript[],documentId:string,start:number,end:number,enabled:boolean,newId:string|undefined,deps:PreparationDependencies<S>):InlineEditPlan{
  const doc=docs.find(d=>d.documentId===documentId);
  if(!doc||typeof enabled!=='boolean')throw RangeError('Invalid numbering edit');
  const source=doc.source,target=inspectDisplayMath(source,start,end,deps.scan);
  if(target.mode!=='edit')throw RangeError('Select an existing display equation');
  const before=prepare(docs,deps);
  const index=before.findIndex(i=>i.kind==='math'&&i.origin.documentId===documentId&&i.origin.range.start===target.blockStart&&i.origin.range.end===target.blockEnd);
  if(index<0)throw RangeError('Equation is not a supported independent block');
  if(!!target.numbered===enabled)throw RangeError('Equation numbering is already set');
  const existingId=target.equationId;
  if(newId!==undefined&&(!enabled||existingId!==undefined||!/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(newId)))throw RangeError('Cannot replace an existing equation ID');
  const id=existingId??newId;
  if(enabled&&!id)throw RangeError('Enabling numbering requires a persistent ID');
  const parsed=deps.scan(source),block=parsed.blocks.find(b=>b.range.start===target.blockStart&&b.range.end===target.blockEnd);
  if(!block)throw RangeError('Missing scanner block');
  const raw=source.slice(target.blockStart,target.blockEnd);
  let replacement:string;
  if(block.kind==='math'){
    if(!enabled)throw RangeError('Unnumbered equation');
    const endings=new Set(raw.match(/\r\n|\r|\n/g)??[]);
    if(endings.has('\r')||endings.size!==1)throw RangeError('Mixed equation line endings');
    const nl=endings.has('\r\n')?'\r\n':'\n';
    replacement=':::layout{#'+id+' numbered="true"}'+nl+raw+(raw.endsWith(nl)?'':nl)+':::'+(raw.endsWith(nl)?nl:'');
  }else if(block.kind==='directive'){
    const head=source.slice(block.header.range.start,block.header.range.end);
    if(!/^:{3,}layout\{[^{}\r\n]*\}$/.test(head))throw RangeError('Unsupported equation header');
    let updated=head;
    if(block.header.attributes.some(a=>a.key==='numbered')){
      if(!/numbered="(?:true|false)"/.test(head))throw RangeError('Unsupported encoded numbering flag');
      updated=updated.replace(/numbered="(?:true|false)"/,()=> 'numbered="'+enabled+'"');
    }else updated=updated.slice(0,-1)+' numbered="'+enabled+'"}';
    if(!existingId&&id)updated=updated.slice(0,-1)+' #'+id+'}';
    replacement=raw.slice(0,block.header.range.start-target.blockStart)+updated+raw.slice(block.header.range.end-target.blockStart);
  }else throw RangeError('Unsupported equation block');
  const next=source.slice(0,target.blockStart)+replacement+source.slice(target.blockEnd),delta=replacement.length-raw.length;
  // Reuse the authoritative book compiler: disabling a referenced equation,
  // including cross-file references, makes the proposed manuscript invalid.
  const after=prepare(docs.map(d=>d===doc?{...d,source:next}:d),deps);
  if(before.length!==after.length||after.some((a,i)=>{
    const b=before[i],local=b.origin.documentId===documentId,shift=local&&i>index?delta:0;
    return a.kind!==b.kind||a.text!==b.text||a.origin.documentId!==b.origin.documentId||a.origin.persistentId!==(i===index?id:b.origin.persistentId)||a.origin.range.start!==b.origin.range.start+shift||a.origin.range.end!==b.origin.range.end+(local&&i===index?delta:shift);
  }))throw RangeError('Numbering edit would change unrelated manuscript structure');
  const updated=after[index];
  if(!!updated.equationNumber!==enabled||updated.sourceTextStart===undefined)throw RangeError('Unexpected equation numbering result');
  return {patch:{range:{start:target.blockStart,end:target.blockEnd},expected:raw,replacement},selection:{start:updated.sourceTextStart,end:updated.sourceTextStart+updated.text.length},action:'replace'};
}
