import {prepareManuscript,isStudyBlockId} from '../../dist/index.js';
import {projectStudy} from './structured-study.mjs';

function validated(documents,deps){
  if(!deps.parseReference||!deps.validateDisplayMath||!deps.validateInlineMath)throw Error('全冊参照の検証が利用できません。');
  const result=prepareManuscript(documents,'1','study-instance-operation',{width:100000,height:100000},deps);
  if(!result.input)throw Error('書籍の検証に失敗しました：'+result.diagnostics.map(d=>d.documentId+'：'+d.message).join('; '));
  return result.items;
}
// Use the same semantic validation as preview, including cross-file IDs and
// equation references. Never change the referenced target or any other file.
export function planStudyInstanceOperation(documents,documentId,range,action,{deps,applyPatches,newId}){
  if(!['duplicate','delete'].includes(action))throw Error('不明な教材部品操作です。');
  const doc=documents.find(d=>d.documentId===documentId);
  if(!doc)throw Error('対象の原稿が見つかりません。');
  const before=validated(documents,deps);
  const item=before.find(i=>i.kind==='study'&&i.origin.documentId===documentId&&i.origin.range.start===range.start&&i.origin.range.end===range.end);
  const block=deps.scan(doc.source).blocks.find(b=>b.range.start===range.start&&b.range.end===range.end);
  const study=projectStudy(doc.source,block??{});
  if(!item||!study||(!study.id&&!study.answerTo)||study.id!==item.origin.persistentId)throw Error('ID付きまたは関連付け済みの対応教材部品を選択してください。');
  const source=doc.source,raw=study.raw;
  if(action==='delete'&&study.id){
    const incoming=before.filter(i=>i.kind==='study'&&i.attributes?.['answer-to']===study.id);
    if(incoming.length)throw Error('この部品は解答・解説から参照されています：'+incoming.map(i=>i.origin.documentId+'（'+(i.origin.persistentId??'IDなし')+'）').join('、'));
  }
  let patch,copyRange;
  if(action==='delete'){
    patch={range,expected:raw,replacement:''};
  }else{
    if(typeof newId!=='string'||!isStudyBlockId(newId)||newId===study.id)throw Error('複製には新しい部品IDが必要です。');
    const head=source.slice(block.header.range.start,block.header.range.end);
    if(!head.endsWith('}')||block.header.range.start!==range.start)throw Error('対応するヘッダ形式ではありません。');
    // Remove only an unambiguous standalone ID token. A quoted attribute may
    // contain similar text; reject ambiguous headers rather than guess.
    let newHead;
    if(study.id){
      const token='#'+study.id;
      const matches=[...head.matchAll(/(?:^|[{\s])#([A-Za-z][A-Za-z0-9_.-]{0,127})(?=[\s}])/g)].filter(m=>m[1]===study.id);
      if(matches.length!==1)throw Error('部品IDの位置を安全に特定できません。');
      const offset=matches[0].index+matches[0][0].lastIndexOf(token);
      newHead=head.slice(0,offset)+'#'+newId+head.slice(offset+token.length);
    }else newHead=head.slice(0,-1)+' #'+newId+'}';
    let copy=newHead+raw.slice(head.length);
    const endings=new Set(source.match(/\r\n|\r|\n/g)??[]);
    if(endings.has('\r')||endings.size>1)throw Error('改行形式が混在しています。');
    const eol=endings.has('\r\n')?'\r\n':'\n';
    if(!copy.endsWith(eol))copy+=eol;
    const at=range.end,lead=raw.endsWith(eol)?eol:eol+eol,trail=at<source.length?eol:'';
    patch={range:{start:at,end:at},expected:'',replacement:lead+copy+trail};
    copyRange={start:at+lead.length,end:at+lead.length+copy.length};
    const copyBlock=deps.scan(copy).blocks.find(b=>b.kind==='directive');
    const projected=projectStudy(copy,copyBlock??{});
    if(!projected||projected.id!==newId||projected.answerTo!==study.answerTo||projected.kind!==study.kind||projected.customId!==study.customId||projected.title!==study.title||JSON.stringify(projected.fields.map(f=>[f.name,f.raw]))!==JSON.stringify(study.fields.map(f=>[f.name,f.raw])))throw Error('複製時に部品の内容が変化しました。');
  }
  const next=applyPatches(source,[patch]);
  const after=validated(documents.map(d=>d===doc?{...d,source:next}:d),deps);
  const oldItems=before.filter(i=>i!==item||action!=='delete'),newItems=after.filter(i=>!(action==='duplicate'&&i.origin.documentId===documentId&&i.origin.range.start===copyRange.start&&i.origin.persistentId===newId));
  if(after.length!==before.length+(action==='delete'?-1:1)||newItems.length!==oldItems.length||newItems.some((a,i)=>{
    const b=oldItems[i];
    return a.kind!==b.kind||a.origin.documentId!==b.origin.documentId||a.origin.persistentId!==b.origin.persistentId||a.text!==b.text||a.studyKind!==b.studyKind||a.componentId!==b.componentId||JSON.stringify(a.attributes)!==JSON.stringify(b.attributes);
  }))throw Error('対象外の原稿構造が変化しました。');
  return next;
}
