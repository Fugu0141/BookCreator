// Restricted preview subset, not a general CommonMark parser.
// Raw UTF-16 offsets remain authoritative; delimiters never enter logical text.
import type {PreviewFontFamily} from './preview-typography.js';
export interface InlineStyle {fontWeight?:number;italic?:boolean;underline?:boolean;color?:string;fontFamily?:PreviewFontFamily;fontSize?:number;baseline?:'normal'|'super'|'sub'}
export interface InlineRun extends InlineStyle {start:number;end:number}
export interface InlineMathAtom {start:number;formula:string}
const fontIds:Readonly<Record<string,PreviewFontFamily>>=Object.freeze({'noto-sans-jp':'BCFont_NotoSansJP','system-serif':'serif','system-sans':'sans-serif','system-monospace':'monospace'});
export function inlineFontFamily(id:string):PreviewFontFamily{
  if(Object.hasOwn(fontIds,id))return fontIds[id];
  if(/^font-[a-f0-9]{64}$/.test(id))return ('BCFont_'+id.slice(5)) as PreviewFontFamily;
  throw RangeError('Invalid inline font ID');
}
function inlineFontId(family:PreviewFontFamily){
  for(const [id,value] of Object.entries(fontIds))if(value===family)return id;
  if(/^BCFont_[a-f0-9]{64}$/.test(family))return 'font-'+family.slice(7);
  throw RangeError('Invalid inline font family');
}
/** Canonical typed style, omitting inherited properties. */
export function normalizeInlineStyle(value:InlineStyle):InlineStyle{
  if(Object.keys(value).some(k=>!['fontWeight','italic','underline','color','fontFamily','fontSize','baseline'].includes(k)))throw RangeError('Unknown inline style');
  const out:InlineStyle={};
  if(value.fontWeight!==undefined){if(!Number.isInteger(value.fontWeight)||value.fontWeight<100||value.fontWeight>900)throw RangeError('Invalid inline weight');out.fontWeight=value.fontWeight;}
  for(const key of ['italic','underline'] as const){if(value[key]!==undefined&&typeof value[key]!=='boolean')throw RangeError('Invalid inline boolean');if(value[key])out[key]=true;}
  if(value.color!==undefined){if(typeof value.color!=='string'||!/^#[0-9a-fA-F]{6}$/.test(value.color))throw RangeError('Invalid inline color');out.color=value.color.toLowerCase();}
  if(value.fontFamily!==undefined){inlineFontId(value.fontFamily);out.fontFamily=value.fontFamily;}
  if(value.fontSize!==undefined){if(!Number.isSafeInteger(value.fontSize)||value.fontSize<1000||value.fontSize>30000)throw RangeError('Invalid inline font size');out.fontSize=value.fontSize;}
  if(value.baseline!==undefined){if(!['normal','super','sub'].includes(value.baseline))throw RangeError('Invalid inline baseline');if(value.baseline!=='normal')out.baseline=value.baseline;}
  return out;
}
export function serializeInlineStyle(text:string,style:InlineStyle,preferSpan=false){
  const s=normalizeInlineStyle(style);
  if(!allowed(text)||!text.trim()||text.trim()!==text)throw RangeError('Invalid inline style text');
  const keys=Object.keys(s);
  if(!keys.length)return {raw:text,innerOffset:0};
  if(keys.length===1&&s.baseline&&/^[0-9]{1,32}$/.test(text)){const mark=s.baseline==='super'?'^':'~';return {raw:mark+text+mark,innerOffset:1};}
  if(!preferSpan&&keys.length===1&&(s.fontWeight===700||s.italic)){const mark=s.italic?'*':'**';return {raw:mark+text+mark,innerOffset:mark.length};}
  const attributes=[s.fontWeight===undefined?'':' weight="'+s.fontWeight+'"',s.italic?' italic="true"':'',s.underline?' underline="true"':'',s.color?' color="'+s.color+'"':'',s.fontFamily?' font="'+inlineFontId(s.fontFamily)+'"':'',s.fontSize!==undefined?' font-size="'+(s.fontSize/1000)+'mm"':'',s.baseline?' baseline="'+s.baseline+'"':''].join('');
  return {raw:':style{text="'+text+'"'+attributes+'}',innerOffset:13};
}
export interface InlineSourceSegment {start:number;end:number;rawStart:number;outerStart:number;outerEnd:number;derived?:true}
export interface InlineSourceMap {length:number;segments:InlineSourceSegment[]}
const allowed=(s:string)=>/^[\p{L}\p{M}\p{N} .,!?、。・「」『』（）！？　]+$/u.test(s);
const whitespace=(c:string)=>!c||/\s/u.test(c);
const punctuation=(c:string)=>/[\p{P}\p{S}]/u.test(c);
const left=(a:string,b:string)=>!whitespace(b)&&(!punctuation(b)||whitespace(a)||punctuation(a));
const right=(a:string,b:string)=>!whitespace(a)&&(!punctuation(a)||whitespace(b)||punctuation(b));
export function parsePreviewInline(raw:string,offset=0,validateMath?:(formula:string)=>unknown,resolveReference?:(token:string,offset:number)=>string){
  if(typeof raw!=='string'||!raw.length||raw.length>10000||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(offset+raw.length)||/\r(?!\n)/.test(raw)||(raw.match(/\n/g)?.length??0)>255)throw RangeError('Unsupported inline source');
  let text='',cursor=0;
  const inlineStyles:InlineRun[]=[],inlineMath:InlineMathAtom[]=[],segments:InlineSourceSegment[]=[];
  function append(a:number,b:number,outerStart=a,outerEnd=b,style?:InlineStyle){
    if(a===b)return;
    const start=text.length; text+=raw.slice(a,b);
    segments.push({start,end:text.length,rawStart:offset+a,outerStart:offset+outerStart,outerEnd:offset+outerEnd});
    if(style)inlineStyles.push({start,end:text.length,...style});
  }
  // Parse within individual hard lines only. No nesting, escape, links, HTML or other syntax.
  for(const m of raw.matchAll(/[^\r\n]*(?:\r\n|\n|$)/g)){
    const row=m[0];if(!row)continue;
    const line=row.replace(/(?:\r\n|\n)$/,'');
    if(line&&(/^\s|^\d+\.\s/.test(line)||/ {2}$/.test(line)))throw RangeError('Unsupported line context');
    let i=0;
    while(i<line.length){
      const start=i;
      if(line.startsWith(':ref{',i)){
        if(!resolveReference)throw RangeError('Reference resolution unavailable');
        const match=/^:ref\{(?:[a-z-]+="[^"{}\r\n]*" ?)+\}/.exec(line.slice(i));
        if(!match)throw RangeError('Invalid reference token');
        const token=match[0],label=resolveReference(token,offset+cursor+i);
        if(typeof label!=='string'||!label.length||label.length>64||!/^(?:[1-9][0-9]{0,5}\.[1-9][0-9]{0,5}|式 \([1-9][0-9]{0,5}\.[1-9][0-9]{0,5}\))$/.test(label))throw RangeError('Invalid resolved equation label');
        const start=text.length;text+=label;
        segments.push({start,end:text.length,rawStart:offset+cursor+i,outerStart:offset+cursor+i,outerEnd:offset+cursor+i+token.length,derived:true});
        i+=token.length;continue;
      }
      if(line.startsWith('\\$',i)){
        if(!validateMath)throw RangeError('Escaped dollar requires supported inline math context');
        append(cursor+i+1,cursor+i+2,cursor+i,cursor+i+2);i+=2;continue;
      }
      if(line[i]==='$'){
        if(!validateMath||line[i-1]==='$'||line[i+1]==='$'||whitespace(line[i+1]??''))throw RangeError('Invalid inline math opener');
        // A dollar inside a formula must not be escaped or part of a double fence.
        const close=line.indexOf('$',i+1);
        if(close<0||close===i+1||whitespace(line[close-1])||line[close-1]==='\\'||line[close+1]==='$'||/[0-9]/.test(line[close+1]??''))throw RangeError('Invalid inline math closer');
        const formula=line.slice(i+1,close);
        validateMath(formula);
        const logical=text.length;text+='\uFFFC';
        inlineMath.push({start:logical,formula});
        segments.push({start:logical,end:logical+1,rawStart:offset+cursor+i+1,outerStart:offset+cursor+i,outerEnd:offset+cursor+close+1});
        if(inlineMath.length>128)throw RangeError('Too many inline formulas');
        i=close+1;continue;
      }
      if(line[i]==='^'||line[i]==='~'){
        const mark=line[i],match=/^([~^])([0-9]{1,32})\1/.exec(line.slice(i));
        if(!match||line[i-1]===mark||line[i+match[0].length]===mark)throw RangeError('Unsupported script shorthand');
        append(cursor+i+1,cursor+i+1+match[2].length,cursor+i,cursor+i+match[0].length,{baseline:mark==='^'?'super':'sub'});
        i+=match[0].length;if(inlineStyles.length>128)throw RangeError('Too many inline styles');continue;
      }
      if(line.startsWith(':style{',i)){
        if(/[A-Za-z0-9_:]/.test(line[i-1]??''))throw RangeError('Unsupported inline directive boundary');
        const match=/^:style\{text="([^"]+)"((?: [a-z]+(?:-[a-z]+)*="[^"]*")*)\}/.exec(line.slice(i));
        if(!match||!allowed(match[1])||!match[1].trim()||match[1].trim()!==match[1])throw RangeError('Invalid inline style text');
        const style:InlineStyle={},seen=new Set<string>();
        for(const attr of match[2].matchAll(/ ([a-z]+(?:-[a-z]+)*)="([^"]*)"/g)){
          const [,key,value]=attr;
          if(seen.has(key))throw RangeError('Duplicate inline style attribute');seen.add(key);
          if(key==='weight'&&/^[1-9]\d{2}$/.test(value))style.fontWeight=Number(value);
          else if(key==='italic'&&value==='true')style.italic=true;
          else if(key==='underline'&&value==='true')style.underline=true;
          else if(key==='color')style.color=value;
          else if(key==='font')style.fontFamily=inlineFontFamily(value);
          else if(key==='font-size'&&/^(?:[1-9]|[12][0-9]|30)(?:\.[0-9]{1,3})?mm$/.test(value))style.fontSize=Math.round(Number(value.slice(0,-2))*1000);
          else if(key==='baseline'&&(value==='super'||value==='sub'))style.baseline=value;
          else throw RangeError('Unsupported inline style attribute');
        }
        const normalized=normalizeInlineStyle(style);
        if(!Object.keys(normalized).length)throw RangeError('Empty inline style');
        const inner=i+13;
        append(cursor+inner,cursor+inner+match[1].length,cursor+i,cursor+i+match[0].length,normalized);
        i+=match[0].length;
        if(inlineStyles.length>128)throw RangeError('Too many inline styles');
        continue;
      }
      if(line[i]!=='*'){
        while(i<line.length&&line[i]!=='*'&&line[i]!=='^'&&line[i]!=='~'&&line[i]!=='$'&&!line.startsWith('\\$',i)&&!line.startsWith(':style{',i)&&!line.startsWith(':ref{',i))i++;
        if(!allowed(line.slice(start,i)))throw RangeError('Unsupported inline syntax');
        append(cursor+start,cursor+i);continue;
      }
      while(line[i]==='*')i++;
      const marker=line.slice(start,i);
      if(marker.length>2||!left(line[start-1]??'',line[i]??''))throw RangeError('Unsupported emphasis opener');
      const close=line.indexOf('*',i);
      if(close<0||line.slice(close,close+marker.length)!==marker||line[close+marker.length]==='*'||!right(line[close-1]??'',line[close+marker.length]??'')||!allowed(line.slice(i,close)))throw RangeError('Unsupported emphasis closer or nesting');
      append(cursor+i,cursor+close,cursor+start,cursor+close+marker.length,marker==='**'?{fontWeight:700}:{italic:true});
      i=close+marker.length;
      if(inlineStyles.length>128)throw RangeError('Too many inline styles');
    }
    append(cursor+line.length,cursor+row.length);
    cursor+=row.length;
  }
  if(!text.trim()||cursor!==raw.length)throw RangeError('Empty or incomplete inline source');
  const boundaries=new Set([...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(g=>g.index));boundaries.add(text.length);
  if(segments.some(s=>!boundaries.has(s.start)||!boundaries.has(s.end)))throw RangeError('Inline delimiter splits grapheme');
  return {text,inlineStyles,inlineMath,sourceMap:{length:text.length,segments} as InlineSourceMap};
}
/** Map a logical half-open fragment to its contiguous raw envelope, including delimiters
 * at the endpoints of styled runs. Never claim that the envelope equals logical text. */
export function inlineSourceRange(map:InlineSourceMap,start:number,end:number){
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>map.length)throw RangeError('Invalid logical source range');
  const first=map.segments.find(s=>s.start<=start&&start<s.end),last=map.segments.find(s=>s.start<end&&end<=s.end);
  if(!first||!last)throw RangeError('Incomplete inline source map');
  return {start:first.derived||start===first.start?first.outerStart:first.rawStart+start-first.start,end:last.derived||end===last.end?last.outerEnd:last.rawStart+end-last.start};
}
