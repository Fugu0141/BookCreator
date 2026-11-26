import {projectBlocks} from './structured-blocks.mjs';
import {studyTemplate} from '../../dist/index.js';

const stripEnd=s=>s.replace(/(?:\r\n|\n)$/,'');
const simple=row=>row&&row.payload!==null&&['paragraph','math'].includes(row.kind);
const same=(a,b)=>a.kind===b.kind&&a.level===b.level&&stripEnd(a.raw)===stripEnd(b.raw);
const templates={heading:()=> '## 新しい見出し\n',paragraph:()=> '新しい本文を入力してください。\n',math:()=> '$$\nx^2\n$$\n'};
export const insertionChoices=[['paragraph','本文'],['heading','見出し H2'],['math','独立数式'],...Object.entries({example:'例題',exercise:'練習問題',explanation:'解説',note:'補足',tip:'ポイント',warning:'注意',important:'重要'})];
const blankGap=(source,a,b)=>a&&b&&/^(?:[ \t]*(?:\r\n|\n))+$/.test(source.slice(a.range.end,b.range.start));
export function canBlockOperation(source,rows,index,action){
  const row=rows[index];
  if(action==='insert')return index===rows.length||!!row&&(index===0||blankGap(source,rows[index-1],row));
  if(!simple(row))return false;
  if(action==='duplicate')return canBlockOperation(source,rows,index+1,'insert');
  if(action==='delete')return true;
  const other=action==='up'?index-1:action==='down'?index+1:-1;
  return simple(rows[other])&&blankGap(source,rows[Math.min(index,other)],rows[Math.max(index,other)]);
}
export function planBlockOperation(source,request,{scan,parseInline,applyPatches,validateMath}){
  const before=projectBlocks(source,scan,parseInline),rows=before.rows;
  if(before.diagnostics.length||request.source!==source)throw Error('原稿が変化しました。構造を確認してください。');
  const {action,index}=request;
  if(!Number.isInteger(index)||!canBlockOperation(source,rows,index,action))throw Error('この位置・ブロックでは操作できません。');
  const eol=source.includes('\r\n')?'\r\n':'\n';
  const expected=rows.slice();
  let patch;
  if(action==='insert'||action==='duplicate'){
    const at=action==='duplicate'?index+1:index;
    let raw;
    if(action==='duplicate')raw=stripEnd(rows[index].raw)+eol;
    else{
      if(!insertionChoices.some(([v])=>v===request.kind))throw Error('不明な挿入種類');
      raw=(templates[request.kind]?.()??studyTemplate(request.kind)).replace(/\n/g,eol);
    }
    const created=projectBlocks(raw,scan,parseInline);
    if(created.diagnostics.length||created.rows.length!==1)throw Error('挿入する構造が不正です。');
    if(created.rows[0].kind==='math')validateMath(created.rows[0].payload);
    expected.splice(at,0,created.rows[0]);
    const offset=at<rows.length?rows[at].range.start:source.length;
    const prefix=source.slice(0,offset);
    // Insert a blank separator without deleting any existing whitespace.
    const lead=at<rows.length||!prefix?'':prefix.endsWith(eol+eol)?'':prefix.endsWith(eol)?eol:eol+eol;
    const replacement=lead+raw+(at<rows.length?eol:'');
    patch={range:{start:offset,end:offset},expected:'',replacement};
  }else if(action==='delete'){
    const row=rows[index];expected.splice(index,1);
    patch={range:row.range,expected:row.raw,replacement:''};
  }else{
    const j=action==='up'?index-1:index+1,a=Math.min(index,j),b=Math.max(index,j),left=rows[a],right=rows[b];
    const gap=source.slice(left.range.end,right.range.start);
    const ending=r=>r.raw.slice(stripEnd(r.raw).length);
    patch={range:{start:left.range.start,end:right.range.end},expected:source.slice(left.range.start,right.range.end),replacement:stripEnd(right.raw)+ending(left)+gap+stripEnd(left.raw)+ending(right)};
    [expected[a],expected[b]]=[expected[b],expected[a]];
  }
  const next=applyPatches(source,[patch]),after=projectBlocks(next,scan,parseInline);
  if(after.diagnostics.length||after.rows.length!==expected.length||after.rows.some((r,i)=>!same(r,expected[i])))throw Error('周囲の構造が変化するため操作を中止しました。');
  // The only permitted row envelope change is its terminal newline when a new
  // final boundary is created or when two eligible rows swap positions.
  return next;
}
