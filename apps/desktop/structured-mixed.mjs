import {parsePreviewInline} from '../../dist/index.js';
import {parseReferenceToken} from '../../../BookCreator_Markdown/dist/index.js';
import {parsePreviewMath} from '../../../BookCreator_LayoutEngine/dist/index.js';

// Private parser placeholders are never displayed as actual reference numbers.
export function projectMixed(value,allowPlain=false){
  try{
    if(!value||value.trim()!==value||value.includes('\r'))return null;
    const refs=new Map();
    const parsed=parsePreviewInline(value,0,parsePreviewMath,(token,offset)=>{
      const result=parseReferenceToken(token,'structured-paragraph',offset),ref=result.reference;
      if(result.diagnostics.length||!ref||!['number','label-number'].includes(ref.format))throw Error('Unsupported reference');
      refs.set(offset,ref);
      return ref.format==='number'?'1.1':'式 (1.1)';
    });
    if(!allowPlain&&!parsed.inlineMath.length&&!refs.size)return null;
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
  if(!original||!staged||JSON.stringify(fixedParts(staged.parts))!==JSON.stringify(fixedParts(original.parts)))throw Error('参照または書式が変化しました。');
  return staged;
}
function composeMixed(parts,values,allowPlain=false){
  if(!Array.isArray(values)||values.length!==parts.filter(p=>p.kind==='text').length||values.some(v=>typeof v!=='string'||v.includes('\r')))throw Error('文章入力が不正です。');
  let index=0;
  const value=parts.map(p=>p.kind==='text'?values[index++]:p.raw).join('');
  const check=projectMixed(value,allowPlain);
  index=0;
  if(!check||check.parts.length!==parts.length||check.parts.some((p,i)=>p.kind!==parts[i].kind||(p.kind==='text'?p.value!==values[index++]:p.raw!==parts[i].raw)))throw Error('数式・参照・書式の構造が変化する入力は反映できません。');
  return {value,parts:check.parts};
}
export function planMixedMath(draft,request){
  if(!draft?.mixed||!mixedOrigin(draft.row,draft))throw Error('混在本文を開き直してください。');
  const {formula}=request;
  if(typeof formula!=='string'||!formula||formula.length>2048||formula.trim()!==formula||/[\r\n$]/.test(formula))throw Error('数式に改行・ドル記号・前後の空白は入力できません。');
  parsePreviewMath(formula);
  const current=composeMixed(mixedDraftParts(mixedOrigin(draft.row,draft),draft).parts,draft.values);
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
  if(before.diagnostics.length||!row||!Array.isArray(draft.values))throw Error('本文の構造が変更されました。');
  const parts=mixedDraftParts(mixedOrigin(row,draft),draft).parts;
  const {value}=composeMixed(parts,draft.values);
  return replaceMixedParagraph(source,before,at,row,value,{scan,parseInline,applyPatches,project});
}
function replaceMixedParagraph(source,before,at,row,value,{scan,parseInline,applyPatches,project},allowReference=false,allowPlain=false){
  const body=row.raw.replace(/(?:\r\n|\n)$/,''),suffix=row.raw.slice(body.length);
  const crlf=row.raw.includes('\r\n')||(!row.raw.includes('\n')&&source.includes('\r\n'));
  const replacement=(crlf?value.replace(/\n/g,'\r\n'):value)+suffix;
  const next=applyPatches(source,[{range:row.range,expected:row.raw,replacement}]),after=project(next,scan,parseInline);
  if(after.diagnostics.length||after.rows.length!==before.rows.length||after.rows.some((r,i)=>i!==at&&(r.raw!==before.rows[i].raw||r.kind!==before.rows[i].kind))||(!after.rows[at]?.mixed&&!(allowPlain&&after.rows[at]?.kind==='paragraph'&&after.rows[at]?.payload===value))||after.rows[at].raw!==replacement||(!allowReference&&after.rows[at].kind!==row.kind))throw Error('周囲の原稿構造が変化しました。');
  return next;
}

// Return a candidate for the book-wide reference transaction. No reference changes
// are permitted through the normal mixed-draft apply path.
export function planMixedReference(source,draft,request,options){
  const currentSource=planMixedEdit(source,draft,options);
  const {scan,parseInline,project}=options,before=project(currentSource,scan,parseInline);
  const at=before.rows.findIndex(r=>r.range.start===draft.row.range.start),row=before.rows[at];
  if(!row?.mixed||before.diagnostics.length)throw Error('本文の構造が変化しました。');
  const parts=row.mixed.parts.slice(),part=parts[request.part];
  const {targetId,format}=request;
  if(!part||!Number.isSafeInteger(request.part)||!['number','label-number'].includes(format)||typeof targetId!=='string'||!/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(targetId))throw Error('参照先が不正です。');
  const atom={kind:'reference',raw:':ref{target="'+targetId+'" format="'+format+'"}',target:targetId,format};
  if(request.mode==='edit'){
    if(part.kind!=='reference'||part.raw!==request.original)throw Error('元の参照が変化しました。');
    parts[request.part]=atom;
  }else if(request.mode==='insert'){
    const pos=request.start;
    if(part.kind!=='text'||part.value!==request.original||!Number.isSafeInteger(pos)||pos!==request.end||pos<0||pos>part.value.length)throw Error('文章のカーソル位置を指定してください。');
    const boundaries=new Set([part.value.length,...Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(part.value),g=>g.index)]);
    if(!boundaries.has(pos))throw Error('文字の途中には挿入できません。');
    parts.splice(request.part,1,{kind:'text',value:part.value.slice(0,pos)},atom,{kind:'text',value:part.value.slice(pos)});
  }else throw Error('未対応の参照操作');
  const {value}=composeMixed(parts,parts.filter(p=>p.kind==='text').map(p=>p.value));
  return replaceMixedParagraph(currentSource,before,at,row,value,options,true);
}

export function mixedOrigin(row,draft){
  if(row?.mixed)return row.mixed;
  if(row?.kind!=='paragraph'||row.payload===null||typeof draft?.mixedBase!=='string')return null;
  const base=projectMixed(draft.mixedBase,true);
  return base&&!base.parts.some(p=>p.kind==='math'||p.kind==='reference')?base:null;
}
export function startRichMath(draft,offset,formula){
  if(!draft?.rich||draft.richError||draft.row.kind!=='paragraph'||draft.row.mixed)throw Error('文章編集を開き直してください。');
  const base=projectMixed(draft.value,true);
  if(!base||base.parts.some(p=>p.kind==='math'||p.kind==='reference'))throw Error('対応する文章を入力してください。');
  if(typeof formula!=='string'||!formula||formula.length>2048||formula.trim()!==formula||/[\r\n$]/.test(formula))throw Error('数式に改行・ドル記号・前後の空白は入力できません。');
  parsePreviewMath(formula);
  if(!Number.isSafeInteger(offset)||offset<0||offset>draft.value.length)throw Error('挿入位置が不正です。');
  let cursor=0,at=-1,relative=0;
  for(let i=0;i<base.parts.length;i++){
    const p=base.parts[i],length=(p.kind==='text'?p.value:p.raw).length;
    if(p.kind==='text'&&offset>=cursor&&offset<=cursor+length){at=i;relative=offset-cursor;break;}
    cursor+=length;
  }
  if(at<0)throw Error('書式の途中には挿入できません。');
  const parts=base.parts.slice(),text=parts[at].value;
  const boundaries=new Set([text.length,...Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text),g=>g.index)]);
  if(!boundaries.has(relative))throw Error('文字の途中には挿入できません。');
  parts.splice(at,1,{kind:'text',value:text.slice(0,relative)},{kind:'math',raw:'$'+formula+'$',formula},{kind:'text',value:text.slice(relative)});
  const values=parts.filter(p=>p.kind==='text').map(p=>p.value);
  const next=composeMixed(parts,values);
  return {...draft,rich:false,mixed:true,mixedBase:draft.value,mixedLayout:next.value,values,inlineEdit:null};
}

// A confirmed removal is a dedicated book-validated transaction, not a normal
// mixed draft edit. It removes exactly one selected atom, keeping both text sides.
export function planMixedRemoval(source,draft,request,options){
  const currentSource=planMixedEdit(source,draft,options);
  const {scan,parseInline,project}=options,before=project(currentSource,scan,parseInline);
  const at=before.rows.findIndex(r=>r.range.start===draft.row.range.start),row=before.rows[at];
  if(!row?.mixed||before.diagnostics.length)throw Error('本文の構造が変化しました。');
  const parts=row.mixed.parts.slice(),i=request.part,part=parts[i];
  if(request.mode!=='delete'||!Number.isSafeInteger(i)||!part||!['math','reference'].includes(part.kind)||part.kind!==request.kind||part.raw!==request.original||parts[i-1]?.kind!=='text'||parts[i+1]?.kind!=='text')throw Error('削除対象が変化しました。');
  parts.splice(i-1,3,{kind:'text',value:parts[i-1].value+parts[i+1].value});
  const {value}=composeMixed(parts,parts.filter(p=>p.kind==='text').map(p=>p.value),true);
  return replaceMixedParagraph(currentSource,before,at,row,value,options,true,true);
}
