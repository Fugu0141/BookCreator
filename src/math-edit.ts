import type {Scan} from './manuscript-poc.js';
import type {InlineEditPlan} from './inline-edit.js';

type Scanner=(source:string)=>Scan;
type Target={mode:'edit';start:number;end:number;formula:string;blockStart:number;blockEnd:number}|{mode:'insert';start:number;end:number;formula:string};
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
  if(b?.kind==='math'){
    const match=fence(source.slice(b.range.start,b.range.end));
    if(!match)return fail('Only a single-line display formula can be edited');
    const p=b.range.start+match[1].length;
    return {mode:'edit',start:p,end:p+match[2].length,formula:match[2],blockStart:b.range.start,blockEnd:b.range.end};
  }
  if(start!==end||(start!==source.length&&b?.kind!=='blank'))return fail('Place the caret on a blank line or at the end, or select an existing display formula');
  const p=start===source.length?start:b!.range.start;
  return {mode:'insert',start:p,end:p,formula:'x^2'};
}
/** Exact BCM patch; never change fences when editing or reinterpret protected source. */
export function planDisplayMath(source:string,start:number,end:number,formula:string,scan:Scanner,validate:(formula:string)=>unknown):InlineEditPlan{
  if(typeof formula!=='string'||!formula.trim()||formula.length>2048||/[\r\n]/.test(formula)||typeof validate!=='function')return fail('Expected a single-line supported formula');
  validate(formula);
  const target=inspectDisplayMath(source,start,end,scan),before=scanned(source,scan);
  if(target.mode==='edit'){
    const patch={range:{start:target.start,end:target.end},expected:target.formula,replacement:formula};
    const next=source.slice(0,target.start)+formula+source.slice(target.end),delta=formula.length-target.formula.length;
    const after=scanned(next,scan);
    if(after.length!==before.length||after.some((b,i)=>{
      const old=before[i],shift=old.range.start>=target.blockEnd?delta:0;
      return b.kind!==old.kind||b.range.start!==old.range.start+shift||b.range.end!==old.range.end+(old.range.start===target.blockStart?delta:shift);
    }))return fail('Math edit would change scanner structure');
    return {patch,selection:{start:target.start,end:target.start+formula.length},action:'replace'};
  }
  const endings=new Set(source.match(/\r\n|\r|\n/g)??[]);
  if(endings.has('\r')||endings.size>1)return fail('Mixed or unsupported line endings');
  const nl=endings.has('\r\n')?'\r\n':'\n',pos=target.start;
  const leading=pos===0?'':source.slice(0,pos).endsWith(nl)?nl:nl+nl;
  const opening='$$'+nl,closing=nl+'$$'+nl+nl,replacement=leading+opening+formula+closing;
  const next=source.slice(0,pos)+replacement+source.slice(pos),after=scanned(next,scan);
  const mathStart=pos+leading.length,mathEnd=mathStart+opening.length+formula.length+nl.length+2+nl.length;
  const inserted=after.find(b=>b.range.start===mathStart&&b.range.end===mathEnd&&b.kind==='math');
  if(!inserted)return fail('Insertion is not an independent math block');
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
