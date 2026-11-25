// Restricted preview subset, not a general CommonMark parser.
// Raw UTF-16 offsets remain authoritative; delimiters never enter logical text.
export interface InlineRun {start:number;end:number;fontWeight?:number;italic?:boolean}
export interface InlineSourceSegment {start:number;end:number;rawStart:number;outerStart:number;outerEnd:number}
export interface InlineSourceMap {length:number;segments:InlineSourceSegment[]}
const allowed=(s:string)=>/^[\p{L}\p{M}\p{N} .,!?、。・「」『』（）！？　]+$/u.test(s);
const whitespace=(c:string)=>!c||/\s/u.test(c);
const punctuation=(c:string)=>/[\p{P}\p{S}]/u.test(c);
const left=(a:string,b:string)=>!whitespace(b)&&(!punctuation(b)||whitespace(a)||punctuation(a));
const right=(a:string,b:string)=>!whitespace(a)&&(!punctuation(a)||whitespace(b)||punctuation(b));
export function parsePreviewInline(raw:string,offset=0){
  if(typeof raw!=='string'||!raw.length||raw.length>10000||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(offset+raw.length)||/\r(?!\n)/.test(raw)||(raw.match(/\n/g)?.length??0)>255)throw RangeError('Unsupported inline source');
  let text='',cursor=0;
  const inlineStyles:InlineRun[]=[],segments:InlineSourceSegment[]=[];
  function append(a:number,b:number,outerStart=a,outerEnd=b,marker?:string){
    if(a===b)return;
    const start=text.length; text+=raw.slice(a,b);
    segments.push({start,end:text.length,rawStart:offset+a,outerStart:offset+outerStart,outerEnd:offset+outerEnd});
    if(marker)inlineStyles.push({start,end:text.length,...(marker==='**'?{fontWeight:700}:{italic:true})});
  }
  // Parse within individual hard lines only. No nesting, escape, links, HTML or other syntax.
  for(const m of raw.matchAll(/[^\r\n]*(?:\r\n|\n|$)/g)){
    const row=m[0];if(!row)continue;
    const line=row.replace(/(?:\r\n|\n)$/,'');
    if(line&&(/^\s|^\d+\.\s/.test(line)||/ {2}$/.test(line)))throw RangeError('Unsupported line context');
    let i=0;
    while(i<line.length){
      const start=i;
      if(line[i]!=='*'){
        while(i<line.length&&line[i]!=='*')i++;
        if(!allowed(line.slice(start,i)))throw RangeError('Unsupported inline syntax');
        append(cursor+start,cursor+i);continue;
      }
      while(line[i]==='*')i++;
      const marker=line.slice(start,i);
      if(marker.length>2||!left(line[start-1]??'',line[i]??''))throw RangeError('Unsupported emphasis opener');
      const close=line.indexOf('*',i);
      if(close<0||line.slice(close,close+marker.length)!==marker||line[close+marker.length]==='*'||!right(line[close-1]??'',line[close+marker.length]??'')||!allowed(line.slice(i,close)))throw RangeError('Unsupported emphasis closer or nesting');
      append(cursor+i,cursor+close,cursor+start,cursor+close+marker.length,marker);
      i=close+marker.length;
      if(inlineStyles.length>128)throw RangeError('Too many inline styles');
    }
    append(cursor+line.length,cursor+row.length);
    cursor+=row.length;
  }
  if(!text.trim()||cursor!==raw.length)throw RangeError('Empty or incomplete inline source');
  const boundaries=new Set([...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(g=>g.index));boundaries.add(text.length);
  if(segments.some(s=>!boundaries.has(s.start)||!boundaries.has(s.end)))throw RangeError('Inline delimiter splits grapheme');
  return {text,inlineStyles,sourceMap:{length:text.length,segments} as InlineSourceMap};
}
/** Map a logical half-open fragment to its contiguous raw envelope, including delimiters
 * at the endpoints of styled runs. Never claim that the envelope equals logical text. */
export function inlineSourceRange(map:InlineSourceMap,start:number,end:number){
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>map.length)throw RangeError('Invalid logical source range');
  const first=map.segments.find(s=>s.start<=start&&start<s.end),last=map.segments.find(s=>s.start<end&&end<=s.end);
  if(!first||!last)throw RangeError('Incomplete inline source map');
  return {start:start===first.start?first.outerStart:first.rawStart+start-first.start,end:end===last.end?last.outerEnd:last.rawStart+end-last.start};
}
