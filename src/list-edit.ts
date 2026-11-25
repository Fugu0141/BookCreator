import {prepareManuscript,type Scan} from './manuscript-poc.js';
import type {InlineEditPlan} from './inline-edit.js';

/** Shift a single existing item one level without rewriting its marker or body.
 * Only the supported two-level scanner subset is eligible. */
export function planListIndent(source:string,start:number,end:number,direction:'indent'|'outdent',scan:(source:string)=>Scan):InlineEditPlan{
  if(typeof source!=='string'||source.length>1000000||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>source.length||!['indent','outdent'].includes(direction))throw RangeError('Invalid list selection');
  const fail=(message:string):never=>{throw RangeError(message);};
  const parsed=scan(source),blocks=parsed.blocks;
  if(parsed.source!==source||parsed.diagnostics.length)fail('Resolve manuscript scanner diagnostics before list editing');
  const line=(i:number)=>{
    const b=blocks[i];if(b?.kind!=='raw')return;
    const raw=source.slice(b.range.start,b.range.end);
    if(/\r(?!\n)/.test(raw))return;
    const text=raw.replace(/(?:\r\n|\n)$/,'');
    const m=/^( {0,3})([-+*]|[1-9][0-9]{0,2}\.) (\S.*)$/.exec(text);
    if(!m)return;
    return {index:i,start:b.range.start,end:b.range.start+text.length,indent:m[1].length,marker:m[2],body:m[3]};
  };
  const index=blocks.findIndex(b=>start>=b.range.start&&start<b.range.end&&end<=b.range.end);
  const target=line(index);
  if(!target||end>target.end)return fail('Select one existing list item');
  // Find the complete loose/tight list run. The surrounding raw/code guard
  // prevents a local interpretation from hiding ambiguous continuations.
  let first=index,last=index;
  for(const step of [-1,1]){
    let i=index;
    for(;;){
      let j=i+step;while(blocks[j]?.kind==='blank')j+=step;
      if(line(j)){i=j;continue;}
      const near=blocks[j];
      if(near&&(near.kind==='code'||(near.kind==='raw'&&j===i+step)))fail('Unsupported adjacent list context');
      break;
    }
    if(step<0)first=i;else last=i;
  }
  const groupStart=blocks[first].range.start,groupEnd=blocks[last].range.end;
  const group=source.slice(groupStart,groupEnd);
  const compile=(text:string)=>{
    const p=prepareManuscript([{documentId:'list-edit',revision:'1',source:text,startOn:'page'}],'1','list-edit',{width:100000,height:100000},{
      scan,validate:s=>({diagnostics:s.diagnostics}),index:()=>({diagnostics:[]})
    });
    if(!p.input||p.items.some(item=>item.kind!=='list'||!item.listItem))return fail('Unsupported list structure');
    return p.items;
  };
  const before=compile(group),at=before.findIndex(item=>item.origin.range.start===target.start-groupStart);
  if(at<0)return fail('List item is not in supported structure');
  const oldDepth=before[at].listItem!.depth;
  if(before[at+1]?.listItem?.depth===1)return fail('Moving an item with following child or sibling items could change their parent');
  let indent=0;
  if(direction==='indent'){
    if(oldDepth!==0||at===0||!line(index-1))return fail('Indent requires a preceding item without a blank line');
    let parent=index-1;
    while(line(parent)?.indent)parent--;
    const root=line(parent);
    if(!root)return fail('Missing parent list item');
    indent=root.marker.length+1;
    if(indent>3)return fail('Parent marker requires unsupported indentation');
  }else if(oldDepth!==1)return fail('Only a nested item can be outdented');
  const patch={range:{start:target.start,end:target.start+target.indent},expected:' '.repeat(target.indent),replacement:' '.repeat(indent)};
  const nextGroup=group.slice(0,patch.range.start-groupStart)+patch.replacement+group.slice(patch.range.end-groupStart);
  const after=compile(nextGroup);
  // The only allowed semantic change besides derived numbering is this item's depth.
  if(after.length!==before.length||after.some((item,i)=>item.text!==before[i].text||item.listItem!.kind!==before[i].listItem!.kind||item.listItem!.depth!==(i===at?(direction==='indent'?1:0):before[i].listItem!.depth)))return fail('List edit would change unrelated items');
  const delta=indent-target.indent,next=source.slice(0,patch.range.start)+patch.replacement+source.slice(patch.range.end);
  const rescanned=scan(next);
  if(rescanned.source!==next||rescanned.diagnostics.length||rescanned.blocks.length!==blocks.length||rescanned.blocks.some((b,i)=>b.kind!==blocks[i].kind||b.range.start!==blocks[i].range.start+(i>index?delta:0)||b.range.end!==blocks[i].range.end+(i>=index?delta:0)))return fail('List edit would change scanner structure');
  const adjust=(n:number)=>target.start+indent+Math.max(0,n-target.start-target.indent);
  return {patch,selection:{start:adjust(start),end:adjust(end)},action:'replace'};
}
