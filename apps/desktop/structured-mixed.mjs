import {parsePreviewInline} from '../../dist/index.js';
import {parseReferenceToken} from '../../../BookCreator_Markdown/dist/index.js';
import {parsePreviewMath} from '../../../BookCreator_LayoutEngine/dist/index.js';

// Private parser placeholders are never displayed as actual reference numbers.
export function projectMixed(value){
  try{
    if(!value||value.trim()!==value||value.includes('\r'))return null;
    const refs=new Map();
    const parsed=parsePreviewInline(value,0,parsePreviewMath,(token,offset)=>{
      const result=parseReferenceToken(token,'structured-paragraph',offset),ref=result.reference;
      if(result.diagnostics.length||!ref||!['number','label-number'].includes(ref.format))throw Error('Unsupported reference');
      refs.set(offset,ref);
      return ref.format==='number'?'1.1':'式 (1.1)';
    });
    if(!parsed.inlineMath.length&&!refs.size)return null;
    const parts=[];let cursor=0;
    for(const s of parsed.sourceMap.segments){
      const ref=refs.get(s.outerStart),math=parsed.inlineMath.find(a=>a.start===s.start&&s.end===s.start+1),style=parsed.inlineStyles.find(a=>a.start===s.start&&a.end===s.end);
      if(!ref&&!math&&!style&&s.rawStart===s.outerStart&&s.outerEnd-s.outerStart===s.end-s.start)continue;
      if(s.outerStart<cursor||s.outerEnd>value.length)return null;
      parts.push({kind:'text',value:value.slice(cursor,s.outerStart)});
      const raw=value.slice(s.outerStart,s.outerEnd);
      if(ref)parts.push({kind:'reference',raw,target:ref.target,format:ref.format});
      else if(math)parts.push({kind:'math',raw,formula:math.formula});
      else if(style)parts.push({kind:'style',raw,text:parsed.text.slice(s.start,s.end),style});
      else parts.push({kind:'literal',raw,text:parsed.text.slice(s.start,s.end)});
      cursor=s.outerEnd;
    }
    parts.push({kind:'text',value:value.slice(cursor)});
    return {parts};
  }catch{return null;}
}
const fixedParts=parts=>parts.filter(p=>p.kind!=='text'&&p.kind!=='math').map(p=>[p.kind,p.raw]);
export function mixedDraftParts(original,draft){
  const staged=draft.mixedLayout===undefined?original:projectMixed(draft.mixedLayout);
  if(!staged||JSON.stringify(fixedParts(staged.parts))!==JSON.stringify(fixedParts(original.parts)))throw Error('参照または書式が変化しました。');
  return staged;
}
function composeMixed(parts,values){
  if(!Array.isArray(values)||values.length!==parts.filter(p=>p.kind==='text').length||values.some(v=>typeof v!=='string'||v.includes('\r')))throw Error('文章入力が不正です。');
  let index=0;
  const value=parts.map(p=>p.kind==='text'?values[index++]:p.raw).join('');
  const check=projectMixed(value);
  index=0;
  if(!check||check.parts.length!==parts.length||check.parts.some((p,i)=>p.kind!==parts[i].kind||(p.kind==='text'?p.value!==values[index++]:p.raw!==parts[i].raw)))throw Error('数式・参照・書式の構造が変化する入力は反映できません。');
  return {value,parts:check.parts};
}
export function planMixedMath(draft,request){
  if(!draft?.mixed||!draft.row?.mixed)throw Error('混在本文を開き直してください。');
  const {formula}=request;
  if(typeof formula!=='string'||!formula||formula.length>2048||formula.trim()!==formula||/[\r\n$]/.test(formula))throw Error('数式に改行・ドル記号・前後の空白は入力できません。');
  parsePreviewMath(formula);
  const current=composeMixed(mixedDraftParts(draft.row.mixed,draft).parts,draft.values);
  const parts=current.parts.slice(),at=request.part;
  if(!Number.isSafeInteger(at)||!parts[at])throw Error('数式の位置が変化しました。');
  const atom={kind:'math',raw:'$'+formula+'$',formula};
  if(request.mode==='edit'){
    if(parts[at].kind!=='math'||parts[at].raw!==request.original)throw Error('元の数式が変化しました。');
    parts[at]=atom;
  }else if(request.mode==='insert'){
    const part=parts[at],pos=request.start;
    if(part.kind!=='text'||part.value!==request.original||request.end!==pos||!Number.isSafeInteger(pos)||pos<0||pos>part.value.length)throw Error('文章内のカーソル位置を指定してください。');
    const boundaries=new Set([part.value.length,...Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(part.value),g=>g.index)]);
    if(!boundaries.has(pos))throw Error('文字の途中には挿入できません。');
    parts.splice(at,1,{kind:'text',value:part.value.slice(0,pos)},atom,{kind:'text',value:part.value.slice(pos)});
  }else throw Error('未対応の数式操作');
  const values=parts.filter(p=>p.kind==='text').map(p=>p.value);
  const next=composeMixed(parts,values);
  return {...draft,mixedLayout:next.value,values,inlineEdit:null};
}
export function planMixedEdit(source,draft,{scan,parseInline,applyPatches,project}){
  if(draft.source!==source)throw Error('原稿が変更されました。');
  const before=project(source,scan,parseInline),at=before.rows.findIndex(r=>r.range.start===draft.row.range.start&&r.raw===draft.row.raw),row=before.rows[at];
  if(before.diagnostics.length||!row?.mixed||!Array.isArray(draft.values))throw Error('本文の構造が変更されました。');
  const parts=mixedDraftParts(row.mixed,draft).parts;
  const {value}=composeMixed(parts,draft.values);
  const body=row.raw.replace(/(?:\r\n|\n)$/,''),suffix=row.raw.slice(body.length);
  const crlf=row.raw.includes('\r\n')||(!row.raw.includes('\n')&&source.includes('\r\n'));
  const replacement=(crlf?value.replace(/\n/g,'\r\n'):value)+suffix;
  const next=applyPatches(source,[{range:row.range,expected:row.raw,replacement}]),after=project(next,scan,parseInline);
  if(after.diagnostics.length||after.rows.length!==before.rows.length||after.rows.some((r,i)=>i!==at&&(r.raw!==before.rows[i].raw||r.kind!==before.rows[i].kind))||!after.rows[at]?.mixed||after.rows[at].raw!==replacement||after.rows[at].kind!==row.kind)throw Error('周囲の原稿構造が変化しました。');
  return next;
}
