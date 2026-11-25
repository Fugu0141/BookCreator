import {parsePreviewInline,type InlineRun} from './inline-preview.js';
import {studyKind,customStudyId} from './study-blocks.js';
import {validNamedSlot} from './preview-component.js';
import type {Scan} from './manuscript-poc.js';

export type InlineFormat='bold'|'italic';
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
export function planInlineFormat(source:string,start:number,end:number,format:InlineFormat,scan:(source:string)=>Scan):InlineEditPlan{
  if(typeof source!=='string'||source.length>1000000||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>source.length||!['bold','italic'].includes(format))throw RangeError('Invalid inline selection');
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
  body(parsed.blocks,true);
  if(!target||start<target.start||end>target.end)return fail();
  const line=source.slice(target.start,target.end),before=parsePreviewInline(line,target.start);
  const mark=format==='bold'?'**':'*';
  const styled=before.sourceMap.segments.filter(s=>s.rawStart!==s.outerStart);
  const hits=styled.filter(s=>start<s.outerEnd&&end>s.outerStart);
  let logicalStart:number,logicalEnd:number,patchStart=start,patchEnd=end,replacement:string,action:InlineEditPlan['action'];
  if(hits.length){
    if(hits.length!==1)return fail();
    const s=hits[0];
    if(!((start===s.outerStart&&end===s.outerEnd)||(start===s.rawStart&&end===s.rawStart+s.end-s.start)))return fail();
    logicalStart=s.start;logicalEnd=s.end;patchStart=s.outerStart;patchEnd=s.outerEnd;
    const inner=before.text.slice(s.start,s.end),old=source.slice(s.outerStart,s.rawStart);
    action=old===mark?'remove':'replace';replacement=action==='remove'?inner:mark+inner+mark;
  }else{
    const first=before.sourceMap.segments.find(s=>s.rawStart<=start&&start<s.rawStart+s.end-s.start);
    const last=before.sourceMap.segments.find(s=>s.rawStart<end&&end<=s.rawStart+s.end-s.start);
    if(!first||!last)return fail();
    logicalStart=first.start+start-first.rawStart;logicalEnd=last.start+end-last.rawStart;
    const selected=source.slice(start,end);if(!selected.trim()||selected.trim()!==selected)return fail();
    replacement=mark+selected+mark;action='apply';
  }
  const nextLine=line.slice(0,patchStart-target.start)+replacement+line.slice(patchEnd-target.start);
  const after=parsePreviewInline(nextLine,target.start);
  const expected:InlineRun[]=before.inlineStyles.filter(s=>s.end<=logicalStart||s.start>=logicalEnd);
  if(action!=='remove')expected.push({start:logicalStart,end:logicalEnd,...(format==='bold'?{fontWeight:700}:{italic:true})});
  expected.sort((a,b)=>a.start-b.start);
  if(after.text!==before.text||JSON.stringify(after.inlineStyles)!==JSON.stringify(expected))return fail();
  // Compare structural scanner identity and source boundaries after the hypothetical patch.
  const next=source.slice(0,patchStart)+replacement+source.slice(patchEnd);
  const rescanned=scan(next),delta=replacement.length-(patchEnd-patchStart);
  const signature=(blocks:readonly Block[],changed:boolean):unknown[]=>blocks.map(b=>{
    const shift=(n:number)=>changed&&n>=patchEnd?n+delta:n;
    return [b.kind,shift(b.range.start),shift(b.range.end),b.kind==='directive'?[b.closed,b.header.name,b.header.id,b.header.attributes.map(a=>[a.key,a.value]),signature(b.children,changed)]:b.level];
  });
  if(rescanned.source!==next||rescanned.diagnostics.length||JSON.stringify(signature(parsed.blocks,true))!==JSON.stringify(signature(rescanned.blocks,false)))return fail();
  const innerStart=patchStart+(action==='remove'?0:mark.length);
  return {patch:{range:{start:patchStart,end:patchEnd},expected:source.slice(patchStart,patchEnd),replacement},selection:{start:innerStart,end:innerStart+logicalEnd-logicalStart},action};
}
