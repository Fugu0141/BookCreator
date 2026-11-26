import {serializeInlineStyle} from '../../dist/index.js';

export function richProjection(raw,parseInline){
  try{
    const parsed=parseInline(raw);
    if(parsed.inlineMath.length||parsed.sourceMap.segments.some(s=>s.derived)||parsed.text.includes('\r'))return null;
    return parsed;
  }catch{return null;}
}
const styleOf=({start,end,...style})=>style;
const plainSegment=s=>s.rawStart===s.outerStart&&s.outerEnd-s.outerStart===s.end-s.start;
function boundary(parsed,pos,side){
  const segments=parsed.sourceMap.segments;
  const edge=segments.find(s=>side==='start'?s.start===pos:s.end===pos);
  if(edge)return side==='start'?edge.outerStart:edge.outerEnd;
  const inside=segments.find(s=>s.start<pos&&pos<s.end);
  if(inside&&plainSegment(inside))return inside.rawStart+pos-inside.start;
  if(pos===0)return 0;
  if(pos===parsed.text.length)return segments.at(-1)?.outerEnd??0;
  throw Error('書式の途中をまたぐ変更は記法編集で行ってください。');
}
export function logicalFormatRange(parsed,start,end){
  if(start===end)throw Error('文字を選択してください。');
  return {start:boundary(parsed,start,'start'),end:boundary(parsed,end,'end')};
}
// For a range crossing style boundaries, surviving text keeps its old style.
// Newly inserted text in a mixed selection is unstyled. Only cut runs are
// reserialized; untouched source outside the selected envelope stays exact.
function replaceAcrossStyles(raw,before,value,start,end,tail,parseInline){
  const old=before.text,inserted=value.slice(start,tail),delta=inserted.length-(end-start);
  const expected=before.inlineStyles.flatMap(run=>{
    if(run.end<=start)return [run];
    if(run.start>=end)return [{...run,start:run.start+delta,end:run.end+delta}];
    const fragments=[];
    if(run.start<start)fragments.push({...run,end:start});
    if(run.end>end)fragments.push({...run,start:tail,end:run.end+delta});
    return fragments;
  });
  function cut(pos,side,preferSpan){
    const inside=before.sourceMap.segments.find(s=>s.start<pos&&pos<s.end);
    const run=inside&&before.inlineStyles.find(r=>r.start===inside.start&&r.end===inside.end);
    if(!run){const offset=boundary(before,pos,side==='left'?'start':'end');return side==='left'?raw.slice(0,offset):raw.slice(offset);}
    const text=side==='left'?old.slice(run.start,pos):old.slice(pos,run.end);
    const fragment=serializeInlineStyle(text,styleOf(run),preferSpan||raw.startsWith(':style{',inside.outerStart)).raw;
    return side==='left'?raw.slice(0,inside.outerStart)+fragment:fragment+raw.slice(inside.outerEnd);
  }
  // Adjacent emphasis delimiters can collide after a deletion. Try explicit
  // style markup for cut fragments only; reject rather than alter other runs.
  for(const [leftSpan,rightSpan] of [[false,false],[true,false],[false,true],[true,true]]){
    try{
      const next=cut(start,'left',leftSpan)+inserted+cut(end,'right',rightSpan),after=richProjection(next,parseInline);
      if(after&&after.text===value&&JSON.stringify(after.inlineStyles)===JSON.stringify(expected))return next;
    }catch{/* Try the next safe serialization. */}
  }
  throw Error('書式を保持できない結合です。範囲を調整してください。');
}
export function replaceLogicalText(raw,value,parseInline,selection){
  const before=richProjection(raw,parseInline);
  if(!before)throw Error('この文章は記法編集で扱ってください。');
  const old=before.text;
  if(old===value)return raw;
  let start=0,end=old.length,tail=value.length;
  while(start<end&&start<tail&&old[start]===value[start])start++;
  while(end>start&&tail>start&&old[end-1]===value[tail-1]){end--;tail--;}
  const graphemes=s=>new Set([s.length,...Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(s),g=>g.index)]);
  const a=graphemes(old),b=graphemes(value);
  // A verified selection disambiguates repeated characters across style
  // boundaries. Input events without a usable snapshot retain the diff path.
  if(selection&&Number.isSafeInteger(selection.start)&&Number.isSafeInteger(selection.end)&&selection.start>=0&&selection.end>selection.start&&selection.end<=old.length){
    const s=selection.start,e=selection.end,t=value.length-(old.length-e);
    if(t>=s&&a.has(s)&&a.has(e)&&b.has(s)&&b.has(t)&&old.slice(0,s)===value.slice(0,s)&&old.slice(e)===value.slice(t)){start=s;end=e;tail=t;}
  }
  while(start>0&&(!a.has(start)||!b.has(start)))start--;
  while(end<old.length&&(!a.has(end)||!b.has(tail))){end++;tail++;}
  const inserted=value.slice(start,tail),delta=inserted.length-(end-start);
  const hits=before.inlineStyles.filter(r=>start<r.end&&end>r.start||start===end&&r.start<start&&start<r.end);
  let next,expected;
  if(hits.length){
    const run=hits[0];
    if(hits.length!==1||start<run.start||end>run.end)return replaceAcrossStyles(raw,before,value,start,end,tail,parseInline);
    const segment=before.sourceMap.segments.find(s=>s.start===run.start&&s.end===run.end);
    if(!segment)throw Error('書式範囲を確認できません。');
    const text=old.slice(run.start,start)+inserted+old.slice(end,run.end);
    const replacement=text?serializeInlineStyle(text,styleOf(run),raw.startsWith(':style{',segment.outerStart)).raw:'';
    next=raw.slice(0,segment.outerStart)+replacement+raw.slice(segment.outerEnd);
    expected=before.inlineStyles.flatMap(r=>r===run?(text?[{...r,end:r.end+delta}]:[]):[{...r,start:r.start+(r.start>=run.end?delta:0),end:r.end+(r.start>=run.end?delta:0)}]);
  }else{
    const from=boundary(before,start,'start'),to=start===end?from:boundary(before,end,'end');
    next=raw.slice(0,from)+inserted+raw.slice(to);
    expected=before.inlineStyles.map(r=>r.start>=end?{...r,start:r.start+delta,end:r.end+delta}:r);
  }
  const after=richProjection(next,parseInline);
  if(!after||after.text!==value||JSON.stringify(after.inlineStyles)!==JSON.stringify(expected))throw Error('入力によって書式や構造が変化するため反映できません。記法編集を利用してください。');
  return next;
}

// A rich-text caret maps to a source boundary, never into a style token.
export function richCaretOffset(raw,parseInline,start,end){
  const p=richProjection(raw,parseInline);
  if(!p||!Number.isSafeInteger(start)||start!==end||start<0||start>p.text.length)throw Error('文章の挿入位置にカーソルを置いてください。');
  const boundaries=new Set([p.text.length,...Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(p.text),g=>g.index)]);
  if(!boundaries.has(start))throw Error('文字の途中には挿入できません。');
  return boundary(p,start,'start');
}
