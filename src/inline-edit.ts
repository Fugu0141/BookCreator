import {parsePreviewInline,normalizeInlineStyle,serializeInlineStyle,inlineFontFamily,type InlineRun,type InlineStyle} from './inline-preview.js';
import {studyKind,customStudyId} from './study-blocks.js';
import {validNamedSlot} from './preview-component.js';
import {prepareManuscript,createEquationResolver,numberedEquationTargets,type Scan,type PreparationDependencies} from './manuscript-poc.js';
import type {ComponentMathBookContext} from './math-edit.js';

export type InlineFormat='bold'|'italic'|'underline'|'combined'|{color:string|null}|{font:string|null;weight?:number}|{fontSize:number|null}|{baseline:'super'|'sub'|null};
function changeStyle(style:InlineStyle,format:InlineFormat,legacy:boolean):InlineStyle{
  const next={...style};
  if(format==='bold'){
    if(next.fontWeight===700)delete next.fontWeight;else next.fontWeight=700;
    if(legacy)delete next.italic;
  }else if(format==='italic'){
    if(next.italic)delete next.italic;else next.italic=true;
    if(legacy)delete next.fontWeight;
  }else if(format==='combined'){
    if(next.fontWeight===700&&next.italic){delete next.fontWeight;delete next.italic;}
    else{next.fontWeight=700;next.italic=true;}
  }else if(format==='underline'){
    if(next.underline)delete next.underline;else next.underline=true;
  }else if(format&&typeof format==='object'&&Object.hasOwn(format,'fontSize')&&Object.keys(format).length===1){
    const size=(format as {fontSize:number|null}).fontSize;
    if(size===null)delete next.fontSize;else next.fontSize=size;
  }else if(format&&typeof format==='object'&&Object.hasOwn(format,'baseline')&&Object.keys(format).length===1){
    const baseline=(format as {baseline:'super'|'sub'|null}).baseline;
    if(baseline===null||baseline===next.baseline)delete next.baseline;else next.baseline=baseline;
  }else if(format&&typeof format==='object'&&Object.hasOwn(format,'color')&&Object.keys(format).length===1){
    const color=(format as {color:string|null}).color;
    if(color===null)delete next.color;else next.color=color;
  }else if(format&&typeof format==='object'&&Object.hasOwn(format,'font')&&Object.keys(format).every(k=>k==='font'||k==='weight')){
    const f=format as {font:string|null;weight?:number};
    if(f.font===null){delete next.fontFamily;delete next.fontWeight;}
    else{next.fontFamily=inlineFontFamily(f.font);if(f.weight!==undefined)next.fontWeight=f.weight;}
  }else throw RangeError('Invalid inline format');
  return normalizeInlineStyle(next);
}
export interface InlineEditPlan {
  patch:{range:{start:number;end:number};expected:string;replacement:string};
  selection:{start:number;end:number}; action:'apply'|'remove'|'replace';
}
type Block=Scan['blocks'][number];
const fail=()=>{throw RangeError('Select a single supported plain text range or a complete emphasized run');};
const stripEnd=(s:string)=>s.replace(/(?:\r\n|\r|\n)$/,'');
function supportedStudy(b:Extract<Block,{kind:'directive'}>){
  const h=b.header,attrs=Object.fromEntries(h.attributes.map(a=>[a.key,a.value]));
  return b.closed&&h.kind==='container'&&!!(studyKind(h.name,attrs)||customStudyId(h.name,attrs));
}
function slot(b:Extract<Block,{kind:'directive'}>){
  const h=b.header,a=h.attributes[0];
  return b.closed&&h.kind==='container'&&h.name==='slot'&&!h.id&&h.attributes.length===1&&a.key==='name'&&(a.value==='content'||validNamedSlot(a.value));
}
/** Local source edit; the scanner identifies protected ranges. No general Markdown rewriting. */
export function planInlineFormat<S extends Scan>(source:string,start:number,end:number,format:InlineFormat,scan:(source:string)=>S,context?:ComponentMathBookContext&{deps:PreparationDependencies<S>}):InlineEditPlan{
  if(typeof source!=='string'||source.length>1000000||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>source.length)throw RangeError('Invalid inline selection');
  const parsed=scan(source);
  if(parsed.source!==source||parsed.diagnostics.length)throw RangeError('Resolve manuscript scanner diagnostics before formatting');
  const boundaries=new Set([...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(source)].map(g=>g.index));boundaries.add(source.length);
  if(!boundaries.has(start)||!boundaries.has(end))return fail();
  let target:{start:number;end:number}|undefined;
  function body(children:readonly Block[],top:boolean){
    for(let i=0;i<children.length;i++){
      const b=children[i];if(start<b.range.start||end>b.range.end)continue;
      if(b.kind==='raw'){
        // A raw run adjacent to unsupported Markdown (e.g. a list continuation)
        // is not a safe formatting context.
        let a=i,z=i;
        while(a>0&&children[a-1].kind==='raw')a--;
        while(z+1<children.length&&children[z+1].kind==='raw')z++;
        try{parsePreviewInline(stripEnd(source.slice(children[a].range.start,children[z].range.end)));}catch{return;}
        target={start:b.range.start,end:b.range.start+stripEnd(source.slice(b.range.start,b.range.end)).length};
      }else if(top&&b.kind==='heading'){
        const line=stripEnd(source.slice(b.range.start,b.range.end)),m=/^ {0,3}#{1,6}[ \t]+/.exec(line);
        if(m)target={start:b.range.start+m[0].length,end:b.range.start+line.length};
      }else if(top&&b.kind==='directive'&&supportedStudy(b)){
        const visible=b.children.filter(c=>c.kind!=='blank');
        if(visible.every(c=>c.kind==='raw'))body(b.children,false);
        else if(b.header.name==='component'&&visible.every(c=>c.kind==='directive'&&slot(c))){
          const names=visible.map(c=>(c as Extract<Block,{kind:'directive'}>).header.attributes[0].value);
          if(!names.includes('content')||new Set(names).size!==names.length)return;
          for(const s of visible)if(s.kind==='directive'&&s.children.every(c=>c.kind==='raw'||c.kind==='blank'))body(s.children,false);
        }
      }
      return;
    }
  }
  const prepare=(raw:string)=>{
    if(!context)return;
    if(context.documents.filter(d=>d.documentId===context.documentId).length!==1)throw RangeError('Expected current document in book context');
    const docs=context.documents.map(d=>d.documentId===context.documentId?{...d,source:raw}:d);
    const book=prepareManuscript(docs,'1','inline-format-edit',{width:100000,height:100000},context.deps);
    if(!book.input)throw RangeError('Resolve manuscript diagnostics before formatting: '+book.diagnostics.map(d=>d.message).join('; '));
    return book.items;
  };
  const items=prepare(source);
  const resolver=context&&items?createEquationResolver(items,context.deps,context.documentId):undefined;
  if(context&&items){
    // The semantic compiler owns slot boundaries; only a scanner-owned raw
    // line inside a supported slot is editable. Never descend into formulas.
    const slots=items.filter(i=>i.origin.documentId===context.documentId&&(i.kind==='paragraph'||i.kind==='study')).flatMap(i=>[
      {start:i.sourceTextStart??i.origin.range.start,text:i.text},
      ...(i.namedSlots??[]).map(s=>({start:s.sourceTextStart!,text:s.text}))
    ]);
    const selected=slots.find(s=>start>=s.start&&end<=s.start+s.text.length);
    if(selected){
      const rawRows=(blocks:readonly Block[]):Block[]=>blocks.flatMap(b=>b.kind==='raw'?[b]:b.kind==='directive'?rawRows(b.children):[]);
      const row=rawRows(parsed.blocks).find(b=>b.range.start>=selected.start&&start>=b.range.start&&end<=b.range.start+stripEnd(source.slice(b.range.start,b.range.end)).length);
      if(row)target={start:row.range.start,end:row.range.start+stripEnd(source.slice(row.range.start,row.range.end)).length};
    }else if(items.some(i=>i.origin.documentId===context.documentId&&i.kind==='heading'&&start>=i.origin.range.start&&end<=i.origin.range.end))body(parsed.blocks,true);
  }else body(parsed.blocks,true);
  if(!target||start<target.start||end>target.end)return fail();
  const line=source.slice(target.start,target.end),before=parsePreviewInline(line,target.start,context?.deps.validateInlineMath,resolver);
  let previous:InlineStyle={},preferSpan=false,inner:string;
  if(before.sourceMap.segments.some(s=>s.derived&&start<s.outerEnd&&end>s.outerStart))return fail();
  const styled=before.sourceMap.segments.filter(s=>s.rawStart!==s.outerStart);
  const hits=styled.filter(s=>start<s.outerEnd&&end>s.outerStart);
  let logicalStart:number,logicalEnd:number,patchStart=start,patchEnd=end;
  if(hits.length){
    if(hits.length!==1)return fail();
    const s=hits[0];
    if(!((start===s.outerStart&&end===s.outerEnd)||(start===s.rawStart&&end===s.rawStart+s.end-s.start)))return fail();
    logicalStart=s.start;logicalEnd=s.end;patchStart=s.outerStart;patchEnd=s.outerEnd;
    inner=before.text.slice(s.start,s.end);preferSpan=source.startsWith(':style{',s.outerStart)||source[s.outerStart]==='^'||source[s.outerStart]==='~';
    const run=before.inlineStyles.find(r=>r.start===s.start&&r.end===s.end);if(!run)return fail();
    const {start:_,end:__,...style}=run;previous=style;
  }else{
    const first=before.sourceMap.segments.find(s=>s.rawStart<=start&&start<s.rawStart+s.end-s.start);
    const last=before.sourceMap.segments.find(s=>s.rawStart<end&&end<=s.rawStart+s.end-s.start);
    if(!first||!last)return fail();
    logicalStart=first.start+start-first.rawStart;logicalEnd=last.start+end-last.rawStart;
    const selected=source.slice(start,end);if(!selected.trim()||selected.trim()!==selected)return fail();
    inner=selected;
  }
  const style=changeStyle(previous,format,!preferSpan&&(format==='bold'||format==='italic'));
  const serialized=serializeInlineStyle(inner,style,preferSpan||typeof format==='object'||format==='underline'||format==='combined');
  const replacement=serialized.raw;
  if(source.slice(patchStart,patchEnd)===replacement)throw RangeError('No format change');
  const action:InlineEditPlan['action']=!Object.keys(style).length?'remove':hits.length?'replace':'apply';
  const nextLine=line.slice(0,patchStart-target.start)+replacement+line.slice(patchEnd-target.start);
  const after=parsePreviewInline(nextLine,target.start,context?.deps.validateInlineMath,resolver);
  const expected:InlineRun[]=before.inlineStyles.filter(s=>s.end<=logicalStart||s.start>=logicalEnd);
  if(action!=='remove')expected.push({start:logicalStart,end:logicalEnd,...style});
  expected.sort((a,b)=>a.start-b.start);
  if(after.text!==before.text||JSON.stringify(after.inlineStyles)!==JSON.stringify(expected)||JSON.stringify(after.inlineMath)!==JSON.stringify(before.inlineMath))return fail();
  // Compare structural scanner identity and source boundaries after the hypothetical patch.
  const next=source.slice(0,patchStart)+replacement+source.slice(patchEnd);
  const rescanned=scan(next),delta=replacement.length-(patchEnd-patchStart);
  const signature=(blocks:readonly Block[],changed:boolean):unknown[]=>blocks.map(b=>{
    const shift=(n:number)=>changed&&n>=patchEnd?n+delta:n;
    return [b.kind,shift(b.range.start),shift(b.range.end),b.kind==='directive'?[b.closed,b.header.name,b.header.id,b.header.attributes.map(a=>[a.key,a.value]),signature(b.children,changed)]:b.level];
  });
  if(rescanned.source!==next||rescanned.diagnostics.length||JSON.stringify(signature(parsed.blocks,true))!==JSON.stringify(signature(rescanned.blocks,false)))return fail();
  const checkedItems=prepare(next);
  if(items&&checkedItems&&JSON.stringify(numberedEquationTargets(items))!==JSON.stringify(numberedEquationTargets(checkedItems)))return fail();
  const innerStart=patchStart+serialized.innerOffset;
  return {patch:{range:{start:patchStart,end:patchEnd},expected:source.slice(patchStart,patchEnd),replacement},selection:{start:innerStart,end:innerStart+logicalEnd-logicalStart},action};
}

/** Toggle an isolated top-level single-line paragraph/list item, never restructure a list run. */
export function planListFormat(source:string,start:number,end:number,kind:'bullet'|'ordered',scan:(source:string)=>Scan):InlineEditPlan{
  if(typeof source!=='string'||source.length>1000000||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>source.length||!['bullet','ordered'].includes(kind))throw RangeError('Invalid list selection');
  const parsed=scan(source);
  if(parsed.source!==source||parsed.diagnostics.length)throw RangeError('Resolve manuscript scanner diagnostics before list formatting');
  const index=parsed.blocks.findIndex(b=>b.kind==='raw'&&start>=b.range.start&&start<b.range.end&&end<=b.range.end);
  if(index<0)throw RangeError('Select an isolated top-level text line');
  const b=parsed.blocks[index],raw=stripEnd(source.slice(b.range.start,b.range.end)),lineEnd=b.range.start+raw.length;
  if(end>lineEnd||/[\r\n]/.test(raw)||/\r(?!\n)/.test(source.slice(b.range.start,b.range.end)))throw RangeError('Select a single text line');
  // Refuse adjacent content or a neighboring list, even across blank lines:
  // the edit must not implicitly join lists, alter counters, or reparent children.
  for(const step of [-1,1]){
    let j=index+step;
    while(parsed.blocks[j]?.kind==='blank')j+=step;
    const near=parsed.blocks[j];
    if(near&&(near.kind==='code'||(near.kind==='raw'&&(j===index+step||/^[ \t]*([-+*]|[0-9]+[.)])(?:[ \t]|$)/.test(source.slice(near.range.start,near.range.end))))))throw RangeError('List runs and adjacent raw/code lines require structural editing');
  }
  const match=/^([-+*]|[1-9][0-9]{0,2}\.) (\S.*)$/.exec(raw),oldPrefix=match?match[1]+' ':'',body=raw.slice(oldPrefix.length);
  parsePreviewInline(body,b.range.start+oldPrefix.length);
  const oldKind=match?(match[1].endsWith('.')?'ordered':'bullet'):undefined;
  const prefix=oldKind===kind?'':kind==='ordered'?'1. ':'- ';
  const patch={range:{start:b.range.start,end:b.range.start+oldPrefix.length},expected:oldPrefix,replacement:prefix};
  const next=source.slice(0,patch.range.start)+prefix+source.slice(patch.range.end),after=scan(next),delta=prefix.length-oldPrefix.length;
  if(after.source!==next||after.diagnostics.length||after.blocks.length!==parsed.blocks.length||after.blocks.some((node,i)=>{
    const old=parsed.blocks[i];return node.kind!==old.kind||node.range.start!==old.range.start+(i>index?delta:0)||node.range.end!==old.range.end+(i>=index?delta:0);
  }))throw RangeError('List edit would change surrounding scanner structure');
  const bodyStart=b.range.start+oldPrefix.length,adjust=(n:number)=>b.range.start+prefix.length+Math.max(0,n-bodyStart);
  return {patch,selection:{start:adjust(start),end:adjust(end)},action:prefix?(oldPrefix?'replace':'apply'):'remove'};
}
