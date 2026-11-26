import {prepareManuscript,type Scan,type PreparationDependencies} from './manuscript-poc.js';
import {parsePreviewInline} from './inline-preview.js';
import type {InlineEditPlan} from './inline-edit.js';

type Scanner=(source:string)=>Scan;
type Target={mode:'edit';start:number;end:number;formula:string;blockStart:number;blockEnd:number;numbered?:boolean;equationId?:string}|{mode:'insert';start:number;end:number;formula:string};
const fail=(message:string):never=>{throw RangeError(message);};
function scanned(source:string,scan:Scanner){
  if(typeof source!=='string'||source.length>1000000)return fail('Invalid manuscript');
  const parsed=scan(source);
  if(parsed.source!==source||parsed.diagnostics.length)return fail('Resolve manuscript scanner diagnostics before editing math');
  let covered=0;
  for(const b of parsed.blocks){
    if(b.range.start!==covered||!Number.isSafeInteger(b.range.end)||b.range.end<=covered||b.range.end>source.length)return fail('Invalid scanner coverage');
    covered=b.range.end;
  }
  if(covered!==source.length)return fail('Incomplete scanner coverage');
  return parsed.blocks;
}
function fence(raw:string){
  return /^(\$\$[ \t]*(?:\r\n|\n))([^\r\n]+)(?:\r\n|\n)\$\$[ \t]*(?:\r\n|\n)?$/.exec(raw);
}
/** Select one top-level existing formula or a caret on a top-level blank line / EOF. */
export function inspectDisplayMath(source:string,start:number,end:number,scan:Scanner):Target{
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>source.length)return fail('Invalid math selection');
  const blocks=scanned(source,scan);
  const b=blocks.find(b=>start>=b.range.start&&start<b.range.end&&end<=b.range.end);
  const children=b?.kind==='directive'?b.children.filter(child=>child.kind!=='blank'):[];
  const attrs=b?.kind==='directive'?Object.fromEntries(b.header.attributes.map(a=>[a.key,a.value])):{};
  const wrapped=b?.kind==='directive'&&b.closed&&b.header.kind==='container'&&b.header.name==='layout'&&children.length===1&&children[0].kind==='math'&&Object.keys(attrs).every(k=>k==='numbered')&&(attrs.numbered===undefined||attrs.numbered==='true'||attrs.numbered==='false')&&(!!b.header.id||attrs.numbered!==undefined);
  if(b&&(b.kind==='math'||wrapped)){
    const math=wrapped?children[0]:b;
    const match=fence(source.slice(math.range.start,math.range.end));
    if(!match)return fail('Only a single-line display formula can be edited');
    const p=math.range.start+match[1].length;
    return {mode:'edit',start:p,end:p+match[2].length,formula:match[2],blockStart:b.range.start,blockEnd:b.range.end,...(wrapped&&b.kind==='directive'?{numbered:attrs.numbered==='true',equationId:b.header.id}:{})};
  }
  if(start!==end||(start!==source.length&&b?.kind!=='blank'))return fail('Place the caret on a blank line or at the end, or select an existing display formula');
  const p=start===source.length?start:b!.range.start;
  return {mode:'insert',start:p,end:p,formula:'x^2'};
}
/** Exact BCM patch; never change fences when editing or reinterpret protected source. */
export function planDisplayMath(source:string,start:number,end:number,formula:string,scan:Scanner,validate:(formula:string)=>unknown,numberedId?:string):InlineEditPlan{
  if(typeof formula!=='string'||!formula.trim()||formula.length>2048||/[\r\n]/.test(formula)||typeof validate!=='function')return fail('Expected a single-line supported formula');
  validate(formula);
  const target=inspectDisplayMath(source,start,end,scan),before=scanned(source,scan);
  if(numberedId!==undefined){
    if(target.mode!=='insert'||typeof numberedId!=='string'||!/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(numberedId))return fail('Numbered insertion requires a valid new equation ID');
    const hasId=(blocks:ReturnType<typeof scanned>):boolean=>blocks.some(b=>b.kind==='directive'&&(b.header.id===numberedId||hasId(b.children)));
    if(hasId(before))return fail('Equation ID already exists in this manuscript');
  }
  if(target.mode==='edit'){
    const patch={range:{start:target.start,end:target.end},expected:target.formula,replacement:formula};
    const next=source.slice(0,target.start)+formula+source.slice(target.end),delta=formula.length-target.formula.length;
    const after=scanned(next,scan);
    if(after.length!==before.length||after.some((b,i)=>{
      const old=before[i],shift=old.range.start>=target.blockEnd?delta:0;
      return b.kind!==old.kind||b.range.start!==old.range.start+shift||b.range.end!==old.range.end+(old.range.start===target.blockStart?delta:shift);
    }))return fail('Math edit would change scanner structure');
    const checked=inspectDisplayMath(next,target.start,target.start+formula.length,scan);
    if(checked.mode!=='edit'||checked.start!==target.start||checked.formula!==formula||checked.numbered!==target.numbered||checked.equationId!==target.equationId)return fail('Math edit would change equation identity or structure');
    return {patch,selection:{start:target.start,end:target.start+formula.length},action:'replace'};
  }
  const endings=new Set(source.match(/\r\n|\r|\n/g)??[]);
  if(endings.has('\r')||endings.size>1)return fail('Mixed or unsupported line endings');
  const nl=endings.has('\r\n')?'\r\n':'\n',pos=target.start;
  const leading=pos===0?'':source.slice(0,pos).endsWith(nl)?nl:nl+nl;
  const opening=(numberedId===undefined?'':':::layout{#'+numberedId+' numbered="true"}'+nl)+'$$'+nl;
  const closing=nl+'$$'+nl+(numberedId===undefined?'':':::'+nl)+nl,replacement=leading+opening+formula+closing;
  const next=source.slice(0,pos)+replacement+source.slice(pos),after=scanned(next,scan);
  const mathStart=pos+leading.length,mathEnd=mathStart+opening.length+formula.length+closing.length-nl.length;
  const inserted=after.find(b=>b.range.start===mathStart&&b.range.end===mathEnd&&b.kind===(numberedId===undefined?'math':'directive'));
  if(!inserted)return fail('Insertion is not an independent math block');
  const checked=inspectDisplayMath(next,mathStart+opening.length,mathStart+opening.length+formula.length,scan);
  if(checked.mode!=='edit'||checked.formula!==formula||checked.equationId!==numberedId||checked.numbered!==(numberedId===undefined?undefined:true))return fail('Inserted equation does not match requested identity');
  // Other nonblank blocks must retain exact raw text, including nested directives.
  // At EOF only, a previous unterminated last line may gain its original newline style.
  const old=before.filter(b=>b.kind!=='blank'),rest=after.filter(b=>b.kind!=='blank'&&b!==inserted);
  if(old.length!==rest.length||old.some((b,i)=>{
    const a=rest[i],raw=source.slice(b.range.start,b.range.end),updated=next.slice(a.range.start,a.range.end);
    const terminal=pos===source.length&&b.range.end===pos&&!raw.endsWith(nl);
    return a.kind!==b.kind||a.range.start!==b.range.start+(b.range.start>=pos?replacement.length:0)||updated!==(terminal?raw+nl:raw);
  }))return fail('Math insertion would change unrelated blocks');
  const p=mathStart+opening.length;
  return {patch:{range:{start:pos,end:pos},expected:'',replacement},selection:{start:p,end:p+formula.length},action:'apply'};
}


type InlineTarget={mode:'insert'|'edit';start:number;end:number;formula:string;logicalStart:number;paragraph:{start:number;end:number;text:string;ownerStart:number;ownerEnd:number;slot:string}};
function inlineContext<S extends Scan>(source:string,start:number,end:number,deps:PreparationDependencies<S>){
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>source.length||!deps.validateInlineMath)return fail('Invalid inline math selection or validator');
  const blocks=scanned(source,deps.scan);
  const result=prepareManuscript([{documentId:'math-edit',revision:'1',source,startOn:'page'}],'1','math-edit',{width:100000,height:100000},deps);
  if(!result.input)return fail('Resolve unsupported manuscript content before editing inline math');

  const candidates=result.items.flatMap(item=>{
    if(item.kind!=='paragraph'&&item.kind!=='study')return [];
    const primary={start:item.sourceTextStart??item.origin.range.start,text:item.text,slot:'content'};
    return [primary,...(item.namedSlots??[]).map(s=>({start:s.sourceTextStart!,text:s.text,slot:s.name}))].map(s=>({...s,end:s.start+s.text.length,ownerStart:item.origin.range.start,ownerEnd:item.origin.range.end}));
  });
  const p=candidates.find(s=>start>=s.start&&end<=s.end);
  if(!p)return fail('Place the caret in ordinary body text or a study text slot, or select one inline formula');
  const parsed=parsePreviewInline(p.text,p.start,deps.validateInlineMath,undefined,true);
  const rows:Scan['blocks'][number][]=[];
  function collect(children:Scan['blocks']){for(const b of children){if(b.kind==='raw')rows.push(b);else if(b.kind==='directive')collect(b.children);}}
  collect(blocks);
  const boundaries=new Set([...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(source)].map(g=>g.index));boundaries.add(source.length);
  if(!boundaries.has(start)||!boundaries.has(end))return fail('Selection splits a grapheme');
  for(const atom of parsed.inlineMath){
    const seg=parsed.sourceMap.segments.find(s=>s.start===atom.start&&s.end===atom.start+1)!;
    if(atom.display&&start<seg.outerEnd&&end>=seg.outerStart)return fail('Use the independent math editor for a display formula');
    if(start>=seg.outerStart&&end<=seg.outerEnd&&(start!==end||start>seg.outerStart&&start<seg.outerEnd)){
      return {blocks,rows,parsed,target:{mode:'edit',start:seg.outerStart+1,end:seg.outerEnd-1,formula:atom.formula,logicalStart:atom.start,paragraph:p} as InlineTarget};
    }
  }
  if(start!==end)return fail('Select only one existing formula, or use a caret to insert');
  if(parsed.sourceMap.segments.some(s=>s.outerStart<start&&start<s.outerEnd&&(s.rawStart!==s.outerStart||s.outerEnd-s.outerStart!==s.end-s.start)))return fail('Cannot insert inside existing markup');
  // Plain segments map linearly. Markup endpoints map to the logical boundary.
  const seg=parsed.sourceMap.segments.find(s=>s.outerStart<=start&&start<=s.outerEnd);
  if(!seg)return fail('No logical insertion boundary');
  const logicalStart=start===seg.outerStart?seg.start:start===seg.outerEnd?seg.end:seg.start+start-seg.rawStart;
  if(logicalStart<0||logicalStart>parsed.text.length||parsed.inlineStyles.some(s=>s.start<logicalStart&&logicalStart<s.end))return fail('Cannot insert inside an inline style');
  const row=rows.find(b=>b.kind==='raw'&&start>=b.range.start&&start<=b.range.end&&start<=b.range.start+source.slice(b.range.start,b.range.end).replace(/(?:\r\n|\r|\n)$/,'').length);
  if(!row)return fail('Insert on a nonblank body line, not a separator');
  return {blocks,rows,parsed,target:{mode:'insert',start,end,formula:'x^2',logicalStart,paragraph:p} as InlineTarget};
}
/** Reuse actual manuscript preparation to identify independent semantic text slots and exclude protected regions. */
export function inspectInlineMath<S extends Scan>(source:string,start:number,end:number,deps:PreparationDependencies<S>){
  return inlineContext(source,start,end,deps).target;
}
/** Insert at a caret or replace only an existing formula body. Exact BCM patch. */
export function planInlineMath<S extends Scan>(source:string,start:number,end:number,formula:string,deps:PreparationDependencies<S>):InlineEditPlan{
  if(typeof formula!=='string'||!formula.length||formula.length>2048||/[\r\n$]/.test(formula)||formula.trim()!==formula||!deps.validateInlineMath)return fail('Expected a supported single-line formula without edge whitespace');
  deps.validateInlineMath(formula);
  const before=inlineContext(source,start,end,deps),t=before.target,logical=t.logicalStart;
  const replacement=t.mode==='insert'?'$'+formula+'$':formula;
  const next=source.slice(0,t.start)+replacement+source.slice(t.end),delta=replacement.length-(t.end-t.start);
  const after=scanned(next,deps.scan);
  // Scanner ranges stay identical apart from the one local line's length and shifted following blocks.
  const row=before.rows.find(b=>t.start>=b.range.start&&t.end<=b.range.end&&t.start<=b.range.start+source.slice(b.range.start,b.range.end).replace(/(?:\r\n|\r|\n)$/,'').length);
  if(!row)return fail('Inline math edit must belong to a single raw line');
  const signature=(blocks:Scan['blocks'],shift:boolean):unknown[]=>blocks.map(b=>{
    const moveStart=shift&&b.range.start>=row.range.end;
    const moveEnd=shift&&b.range.end>=row.range.end;
    return [b.kind,b.range.start+(moveStart?delta:0),b.range.end+(moveEnd?delta:0),b.kind==='directive'?[b.closed,b.header.name,b.header.id,b.header.attributes.map(a=>[a.key,a.value]),signature(b.children,shift)]:b.level];
  });
  if(JSON.stringify(signature(before.blocks,true))!==JSON.stringify(signature(after,false)))return fail('Inline math edit would change scanner structure');
  const selectionStart=t.start+(t.mode==='insert'?1:0);
  const checked=inlineContext(next,selectionStart,selectionStart+formula.length,deps);
  if(checked.target.mode!=='edit'||checked.target.start!==selectionStart||checked.target.formula!==formula||checked.target.paragraph.start!==t.paragraph.start||checked.target.paragraph.end!==t.paragraph.end+delta||checked.target.paragraph.ownerStart!==t.paragraph.ownerStart||checked.target.paragraph.ownerEnd!==t.paragraph.ownerEnd+delta||checked.target.paragraph.slot!==t.paragraph.slot)return fail('Formula would change surrounding paragraph structure');
  const expectedText=t.mode==='insert'?before.parsed.text.slice(0,logical)+'\uFFFC'+before.parsed.text.slice(logical):before.parsed.text;
  const expectedStyles=before.parsed.inlineStyles.map(s=>({...s,start:s.start+(t.mode==='insert'&&s.start>=logical?1:0),end:s.end+(t.mode==='insert'&&s.end>logical?1:0)}));
  const expectedAtoms=before.parsed.inlineMath.map(a=>({...a,start:a.start+(t.mode==='insert'&&a.start>=logical?1:0),formula:t.mode==='edit'&&a.start===logical?formula:a.formula}));
  if(t.mode==='insert')expectedAtoms.push({start:logical,formula});
  expectedAtoms.sort((a,b)=>a.start-b.start);
  if(checked.parsed.text!==expectedText||JSON.stringify(checked.parsed.inlineStyles)!==JSON.stringify(expectedStyles)||JSON.stringify(checked.parsed.inlineMath)!==JSON.stringify(expectedAtoms))return fail('Edit would reinterpret surrounding inline content');
  return {patch:{range:{start:t.start,end:t.end},expected:source.slice(t.start,t.end),replacement},selection:{start:selectionStart,end:selectionStart+formula.length},action:t.mode==='insert'?'apply':'replace'};
}
