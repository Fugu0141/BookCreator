import {projectBlocks} from './structured-blocks.mjs';
import {projectStructuredEditor} from './structured-projection.mjs';
import {slottedStudyTemplate,isCustomComponentId,namedSlotDefinitions} from '../../dist/index.js';
import {projectStudy} from './structured-study.mjs';

const stripEnd=s=>s.replace(/(?:\r\n|\n)$/,'');
const simple=row=>row&&row.payload!==null&&['paragraph','math'].includes(row.kind);
const movable=row=>simple(row)||!!row?.study;
// An anonymous, unlinked study block cannot be an explicit answer/reference
// target in another manuscript. Identified or linked blocks remain protected.
const copyable=row=>simple(row)||!!(row?.study&&!row.study.id&&!row.study.answerTo);
// IDs and answer targets may move intact, but do not invert a linked pair.
const linkedPair=(a,b)=>!!(a?.study?.id&&b?.study?.answerTo===a.study.id||b?.study?.id&&a?.study?.answerTo===b.study.id);
const same=(a,b)=>a.kind===b.kind&&a.level===b.level&&stripEnd(a.raw)===stripEnd(b.raw);
const templates={heading:()=> '## 新しい見出し\n',paragraph:()=> '新しい本文を入力してください。\n',math:()=> '$$\nx^2\n$$\n'};
export const insertionChoices=[['paragraph','本文'],['heading','見出し H2'],['math','独立数式'],...Object.entries({example:'例題',exercise:'練習問題',explanation:'解説',note:'補足',tip:'ポイント',warning:'注意',important:'重要'})];
export function structuredInsertionOptions(library){
  return [...insertionChoices,...(library?.entries??[]).filter(e=>e.usage==='study'&&isCustomComponentId(e.id)).map(e=>[e.id,e.name])];
}
export function studyInsertionSlots(kind,theme){
  const entries=theme?.library?.entries??[];
  const custom=isCustomComponentId(kind),binding=theme?.studyBindings?.[kind];
  if(custom||binding){
    const entry=entries.find(e=>e.id===(custom?kind:binding)&&e.usage==='study');
    if(!entry)throw Error('登録部品の定義が見つかりません。デザインを確認してください。');
    return namedSlotDefinitions(entry.design);
  }
  return namedSlotDefinitions(theme?.studyDesigns?.[kind]);
}
const blankGap=(source,a,b)=>a&&b&&/^(?:[ \t]*(?:\r\n|\n))+$/.test(source.slice(a.range.end,b.range.start));
export function canBlockOperation(source,rows,index,action){
  const row=rows[index];
  if(action==='split')return row?.kind==='paragraph'&&row.payload!==null&&row.payload.includes('\n');
  if(action==='join')return row?.kind==='paragraph'&&rows[index+1]?.kind==='paragraph'&&blankGap(source,row,rows[index+1]);
  if(action==='insert')return index===rows.length||!!row&&(index===0||blankGap(source,rows[index-1],row));
  if(action==='up'||action==='down'){
    const other=action==='up'?index-1:index+1;
    return movable(row)&&movable(rows[other])&&!linkedPair(row,rows[other])&&blankGap(source,rows[Math.min(index,other)],rows[Math.max(index,other)]);
  }
  if(!copyable(row))return false;
  if(action==='duplicate')return canBlockOperation(source,rows,index+1,'insert');
  if(action==='delete')return true;
  return false;
}
export function planBlockOperation(source,request,{scan,parseInline,applyPatches,validateMath,theme}){
  const needsStudy=['up','down','duplicate','delete'].includes(request.action);
  const before=(needsStudy?projectStructuredEditor:projectBlocks)(source,scan,parseInline),rows=before.rows;
  if(before.diagnostics.length||request.source!==source)throw Error('原稿が変化しました。構造を確認してください。');
  const {action,index}=request;
  const caretSplit=action==='split'&&Number.isSafeInteger(request.offset)&&rows[index]?.kind==='paragraph'&&rows[index].payload!==null;
  if(!Number.isInteger(index)||(!caretSplit&&!canBlockOperation(source,rows,index,action)))throw Error('この位置・ブロックでは操作できません。');
  const eol=source.includes('\r\n')?'\r\n':'\n';
  const expected=rows.slice();
  let patch;
  if(action==='split'||action==='join'){
    const row=rows[index];
    if(action==='split'){
      // Split on an existing hard-line boundary, keeping all source bytes.
      let at,separator;
      if(caretSplit){
        const body=stripEnd(row.raw);
        if(row.inline?.inlineStyles.length||row.inline?.inlineMath.length||row.inline?.text!==row.payload||request.offset<=0||request.offset>=row.payload.length)throw Error('書式・数式のない本文の途中で分割してください。');
        const boundaries=new Set(Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(row.payload),g=>g.index));
        if(!boundaries.has(request.offset))throw Error('文字の途中では分割できません。');
        const prefix=row.payload.slice(0,request.offset);
        at=(row.raw.includes('\r\n')?prefix.replace(/\n/g,'\r\n'):prefix).length;
        if(!body.slice(0,at).trim()||!body.slice(at).trim())throw Error('空の段落は作成できません。');
        separator=body.slice(0,at).endsWith('\n')||body.slice(at).startsWith('\n')||body.slice(at).startsWith('\r\n')?eol:eol+eol;
      }else{
        const m=/\r?\n/.exec(stripEnd(row.raw));if(!m)throw Error('分割する改行がありません。');
        at=m.index+m[0].length;separator=m[0];
      }
      const offset=row.range.start+at;
      patch={range:{start:offset,end:offset},expected:'',replacement:separator};
      const parts=projectBlocks(row.raw.slice(0,at)+separator+row.raw.slice(at),scan,parseInline).rows;
      if(parts.length!==2||parts.some(r=>r.kind!=='paragraph'))throw Error('安全に段落分割できません。');
      expected.splice(index,1,...parts);
    }else{
      const right=rows[index+1],gap=source.slice(row.range.end,right.range.start);
      patch={range:{start:row.range.end,end:right.range.start},expected:gap,replacement:''};
      const joined=projectBlocks(row.raw+right.raw,scan,parseInline).rows;
      if(joined.length!==1||joined[0].kind!=='paragraph')throw Error('安全に結合できません。');
      expected.splice(index,2,joined[0]);
    }
  }else if(action==='insert'||action==='duplicate'){
    const at=action==='duplicate'?index+1:index;
    let raw;
    if(action==='duplicate')raw=stripEnd(rows[index].raw)+eol;
    else{
      if(!structuredInsertionOptions(theme?.library).some(([v])=>v===request.kind))throw Error('不明な挿入種類または未登録の部品');
      const choice=request.kind;
      if(Object.hasOwn(templates,choice))raw=templates[choice]().replace(/\n/g,eol);
      else{
        const slots=studyInsertionSlots(choice,theme).filter(s=>!s.optional||request.includeOptional===true).map(s=>s.name);
        raw=slottedStudyTemplate(choice,undefined,undefined,slots).replace(/\n/g,eol);
        const parsed=scan(raw),study=projectStudy(raw,parsed.blocks[0]??{});
        if(parsed.diagnostics.length||parsed.blocks.length!==1||!study||JSON.stringify(study.fields.map(f=>f.name))!==JSON.stringify(['content',...slots]))throw Error('登録部品の入力欄を作成できません。');
      }
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
