import {prepareManuscript,type Scan,type Manuscript,type PreparationDependencies} from './manuscript-poc.js';
import {inspectDisplayMath,inspectComponentDisplayMath,planComponentDisplayMath} from './math-edit.js';
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
  const source=doc.source;
  const nested=inspectComponentDisplayMath(source,start,end,deps,{documents:docs,documentId});
  if(nested)return planNestedNumbering(docs,doc,nested,enabled,newId,deps);
  const target=inspectDisplayMath(source,start,end,deps.scan);
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


type NestedTarget=NonNullable<ReturnType<typeof inspectComponentDisplayMath>>;
type Block=Scan['blocks'][number];
type Container=Extract<Block,{kind:'directive'}>;
/** Only the selected wrapper and, if needed, its enclosing colon fences change.
 * The raw TeX and all sibling source remain byte-for-byte intact. */
function planNestedNumbering<S extends Scan>(docs:readonly Manuscript[],doc:Manuscript,target:NestedTarget,enabled:boolean,newId:string|undefined,deps:PreparationDependencies<S>):InlineEditPlan{
  if(target.mode!=='edit'||!!target.numbered===enabled)throw RangeError('Select an existing equation with a different numbering state');
  const source=doc.source,before=prepare(docs,deps);
  const existingId=target.equationId;
  if(newId!==undefined&&(!enabled||existingId!==undefined||!/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(newId)))throw RangeError('Cannot replace an existing equation ID');
  const id=existingId??newId;
  if(enabled&&!id)throw RangeError('Enabling numbering requires a persistent ID');
  const parsed=deps.scan(source);
  const owner=parsed.blocks.find(b=>b.kind==='directive'&&b.range.start===target.ownerStart&&b.range.end===target.ownerEnd);
  if(!owner||owner.kind!=='directive')throw RangeError('Missing component owner');
  function locate(blocks:readonly Block[],ancestors:Container[]):{block:Block;ancestors:Container[]}|undefined{
    for(const b of blocks){
      if(target.start<b.range.start||target.end>b.range.end)continue;
      if(b.kind==='math'||b.kind==='directive'&&b.header.name==='layout')return {block:b,ancestors};
      if(b.kind==='directive'){const match=locate(b.children,[...ancestors,b]);if(match)return match;}
    }
  }
  const found=locate(owner.children,[owner]);
  if(!found)throw RangeError('Missing scanner-owned component equation');
  const {block,ancestors}=found,raw=source.slice(block.range.start,block.range.end);
  const patches:{start:number;end:number;text:string}[]=[];
  let formulaStart=target.start;
  const add=(start:number,end:number,text:string)=>patches.push({start,end,text});
  if(block.kind==='math'){
    const endings=new Set(raw.match(/\r\n|\r|\n/g)??[]);
    if(!enabled||endings.has('\r')||endings.size!==1)throw RangeError('Unsupported equation line endings');
    const nl=endings.has('\r\n')?'\r\n':'\n';
    if(!raw.endsWith(nl))throw RangeError('Expected nested equation line ending');
    const opening=':::layout{#'+id+' numbered="true"}'+nl;
    add(block.range.start,block.range.start,opening);
    add(block.range.end,block.range.end,':::'+nl);
    // BCM requires strictly decreasing colon counts. Widen only the enclosing
    // fences that do not already have space for the new three-colon wrapper.
    let required=4;
    for(const parent of [...ancestors].reverse()){
      const head=source.slice(parent.header.range.start,parent.header.range.end),open=/^:{3,}/.exec(head);
      const body=source.slice(parent.range.start,parent.range.end),close=/(?:^|\n)(:{3,})[ \t]*(?:\r\n|\n)?$/.exec(body);
      if(!open||!close||open[0].length!==close[1].length)throw RangeError('Unsupported enclosing component fence');
      const n=Math.max(required,open[0].length);
      if(n>open[0].length){
        const closing=parent.range.start+close.index+close[0].indexOf(close[1]);
        add(parent.header.range.start,parent.header.range.start+open[0].length,':'.repeat(n));
        add(closing,closing+close[1].length,':'.repeat(n));
      }
      required=n+1;
    }
  }else if(block.kind==='directive'&&block.header.name==='layout'){
    const head=source.slice(block.header.range.start,block.header.range.end);
    if(!/^:{3,}layout\{[^{}\r\n]*\}$/.test(head))throw RangeError('Unsupported equation header');
    let updated=head;
    if(block.header.attributes.some(a=>a.key==='numbered')){
      if(!/numbered="(?:true|false)"/.test(head))throw RangeError('Unsupported encoded numbering flag');
      updated=updated.replace(/numbered="(?:true|false)"/,()=> 'numbered="'+enabled+'"');
    }else updated=updated.slice(0,-1)+' numbered="'+enabled+'"}';
    if(!existingId&&id)updated=updated.slice(0,-1)+' #'+id+'}';
    add(block.header.range.start,block.header.range.end,updated);
  }else throw RangeError('Unsupported component equation');
  // Apply from right to left. For coincident insertion/replacement offsets,
  // replace the enclosing closing fence first, then insert the equation closer.
  patches.sort((a,b)=>b.start-a.start||b.end-a.end);
  let next=source;
  for(const p of patches){
    if(p.start<owner.range.start||p.end>owner.range.end)throw RangeError('Patch outside component');
    next=next.slice(0,p.start)+p.text+next.slice(p.end);
    if(p.end<=target.start)formulaStart+=p.text.length-(p.end-p.start);
  }
  const delta=next.length-source.length;
  // Validate the complete proposed book, including references to a disabled ID.
  const after=prepare(docs.map(d=>d===doc?{...d,source:next}:d),deps);
  const updated=inspectComponentDisplayMath(next,formulaStart,formulaStart+target.formula.length,deps,{documents:docs,documentId:doc.documentId});
  if(!updated||updated.mode!=='edit'||updated.formula!==target.formula||updated.start!==formulaStart||updated.slot!==target.slot||updated.ownerStart!==target.ownerStart||updated.ownerEnd!==target.ownerEnd+delta||!!updated.numbered!==enabled||updated.equationId!==id)throw RangeError('Unexpected component equation numbering result');
  if(before.length!==after.length||before.some((b,i)=>{
    const a=after[i],local=b.origin.documentId===doc.documentId,inside=local&&b.origin.range.start===owner.range.start,shift=local&&b.origin.range.start>=owner.range.end?delta:0;
    return a.kind!==b.kind||a.origin.documentId!==b.origin.documentId||a.origin.persistentId!==b.origin.persistentId||a.origin.range.start!==b.origin.range.start+shift||a.origin.range.end!==b.origin.range.end+(inside?delta:shift)||(!inside&&a.text!==b.text);
  }))throw RangeError('Numbering edit would change unrelated manuscript structure');
  return {patch:{range:{start:owner.range.start,end:owner.range.end},expected:source.slice(owner.range.start,owner.range.end),replacement:next.slice(owner.range.start,owner.range.end+delta)},selection:{start:formulaStart,end:formulaStart+target.formula.length},action:'replace'};
}


/** Compose two validated plans in memory. Publish only one source patch: an
 * invalid ID or numbering operation cannot leave an unnumbered insertion. */
export function planNumberedComponentDisplayMath<S extends Scan>(docs:readonly Manuscript[],documentId:string,start:number,end:number,formula:string,id:string,deps:PreparationDependencies<S>):InlineEditPlan{
  const doc=docs.find(d=>d.documentId===documentId);
  if(!doc||typeof id!=='string'||!/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(id))throw RangeError('Expected a new persistent equation ID');
  const source=doc.source,context={documents:docs,documentId};
  const target=inspectComponentDisplayMath(source,start,end,deps,context);
  if(!target||target.mode!=='insert')throw RangeError('Expected a component insertion caret');
  const insertion=planComponentDisplayMath(source,start,end,formula,deps,context);
  const apply=(raw:string,plan:InlineEditPlan)=>{
    const {range,expected,replacement}=plan.patch;
    if(raw.slice(range.start,range.end)!==expected)throw RangeError('Stale intermediate equation patch');
    return raw.slice(0,range.start)+replacement+raw.slice(range.end);
  };
  const intermediate=apply(source,insertion);
  const updatedDocs=docs.map(d=>d===doc?{...d,source:intermediate}:d);
  const numbered=planEquationNumbering(updatedDocs,documentId,insertion.selection.start,insertion.selection.end,true,id,deps);
  const next=apply(intermediate,numbered);
  const delta=next.length-source.length;
  if(next.slice(0,target.ownerStart)!==source.slice(0,target.ownerStart)||next.slice(target.ownerEnd+delta)!==source.slice(target.ownerEnd))throw RangeError('Numbered insertion changed unrelated source');
  return {patch:{range:{start:target.ownerStart,end:target.ownerEnd},expected:source.slice(target.ownerStart,target.ownerEnd),replacement:next.slice(target.ownerStart,target.ownerEnd+delta)},selection:numbered.selection,action:'apply'};
}
