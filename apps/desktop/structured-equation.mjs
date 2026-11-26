import {inspectDisplayMath,planDisplayMath} from '../../dist/index.js';

export function projectEquation(source,row,scan){
  if(row.kind!=='directive')return null;
  try{
    const target=inspectDisplayMath(source,row.range.start,row.range.end,scan);
    return target.mode==='edit'&&target.blockStart===row.range.start&&target.blockEnd===row.range.end?{...target,value:target.formula.replace(/\r\n/g,'\n')}:null;
  }catch{return null;}
}
export function planStructuredEquation(source,row,value,{scan,applyPatches,validateMath}){
  const target=projectEquation(source,row,scan);
  if(!target||source.slice(row.range.start,row.range.end)!==row.raw)throw Error('数式の原稿範囲が変わりました。開き直してください。');
  if(value===target.value)return source;
  const plan=planDisplayMath(source,target.start,target.end,value,scan,validateMath);
  return applyPatches(source,[plan.patch]);
}
// The visible textarea normalizes CRLF; use the original block's newline
// convention before sending a caret to the book-wide reference planner.
export function structuredReferenceOffset(source,row,value,start,end){
  if(row.kind!=='paragraph'||row.payload!==value||!Number.isSafeInteger(start)||start!==end||start<0||start>value.length||source.slice(row.range.start,row.range.end)!==row.raw)throw Error('本文の変更を先に反映し、参照位置にカーソルを置いてください。');
  const prefix=value.slice(0,start);
  const rawPrefix=row.raw.includes('\r\n')?prefix.replace(/\n/g,'\r\n'):prefix;
  if(!row.raw.startsWith(rawPrefix))throw Error('原稿の位置を特定できません。');
  return row.range.start+rawPrefix.length;
}
