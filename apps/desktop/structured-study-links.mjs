import {prepareManuscript,createStudyNumbering,studyKindName,isStudyBlockId} from '../../dist/index.js';

function prepared(documents,deps){
  const result=prepareManuscript(documents,'1','structured-study-links',{width:100000,height:100000},deps);
  if(!result.input)throw Error('書籍の検証に失敗しました：'+result.diagnostics.map(d=>d.message).join('; '));
  return result;
}
const canLink=i=>i.studyKind==='explanation'||!!i.componentId;
const canTarget=i=>!i.attributes?.['answer-to']&&(i.studyKind==='example'||i.studyKind==='exercise'||!!i.componentId);
function context(documents,documentId,range,deps,library){
  const result=prepared(documents,deps),item=result.items.find(i=>i.kind==='study'&&i.origin.documentId===documentId&&i.origin.range.start===range.start&&i.origin.range.end===range.end);
  if(!item)throw Error('対応する教材部品が見つかりません。');
  const numbering=createStudyNumbering(),targets=[];
  let ownNumber;
  for(const section of result.input.sections){
    numbering.beginSection();
    for(const block of section.blocks){
      if(block.kind==='pagebreak')continue;
      const i=block.item;
      if(i.kind==='heading')numbering.heading(i.level);
      if(i.kind!=='study')continue;
      const n=numbering.next(i.componentId??i.studyKind),number=n.chapter+'.'+n.index;
      if(i===item)ownNumber=number;
      const entry=i.componentId?library?.entries.find(e=>e.id===i.componentId&&e.usage==='study'):null;
      if(i.componentId&&!entry)continue;
      if(i!==item&&i.origin.persistentId&&canTarget(i))targets.push({id:i.origin.persistentId,number,documentId:i.origin.documentId,name:entry?.name??studyKindName(i.studyKind),title:i.attributes?.title,excerpt:i.text.slice(0,60)});
    }
  }
  if(item.componentId&&!library?.entries.some(e=>e.id===item.componentId&&e.usage==='study'))throw Error('登録部品の定義がありません。');
  return {item,targets,ownNumber,result};
}
export function inspectStudyLinks(documents,documentId,range,deps,library){
  const c=context(documents,documentId,range,deps,library);
  return {id:c.item.origin.persistentId??'',answerTo:c.item.attributes?.['answer-to']??'',canLink:canLink(c.item),canTarget:canTarget(c.item),targets:c.targets,number:c.ownNumber};
}
export function planStudyLinks(documents,documentId,range,request,{deps,library,applyPatches}){
  const c=context(documents,documentId,range,deps,library),item=c.item,doc=documents.find(d=>d.documentId===documentId);
  const oldId=item.origin.persistentId,oldAnswer=item.attributes?.['answer-to']??'',id=request.id,answer=request.answerTo;
  if((oldId&&id!==oldId)||(!oldId&&id&&!isStudyBlockId(id))||typeof id!=='string'||typeof answer!=='string')throw Error('既存IDは変更できません。');
  if(answer&&(!canLink(item)||!c.targets.some(t=>t.id===answer)))throw Error('有効な問題部品を選択してください。');
  if(answer&&answer===id)throw Error('自分自身には関連付けできません。');
  if(id=== (oldId??'')&&answer===oldAnswer)return doc.source;
  const block=deps.scan(doc.source).blocks.find(b=>b.kind==='directive'&&b.range.start===range.start&&b.range.end===range.end);
  if(!block||!block.closed)throw Error('教材部品の構造が変化しました。');
  const h=block.header,head=doc.source.slice(h.range.start,h.range.end);
  if(!head.endsWith('}'))throw Error('対応するヘッダ形式ではありません。');
  let nextHeader=head;
  const attr=h.attributes.find(a=>a.key==='answer-to');
  if(attr&&answer!==oldAnswer){
    const a=attr.range.start-h.range.start,b=attr.range.end-h.range.start;
    nextHeader=head.slice(0,a)+(answer?'answer-to="'+answer+'"':'')+head.slice(b);
  }else if(!attr&&answer)nextHeader=nextHeader.slice(0,-1)+' answer-to="'+answer+'"}';
  if(!oldId&&id)nextHeader=nextHeader.slice(0,-1)+' #'+id+'}';
  const next=applyPatches(doc.source,[{range:h.range,expected:head,replacement:nextHeader}]);
  const after=prepared(documents.map(d=>d===doc?{...d,source:next}:d),deps),index=c.result.items.indexOf(item),updated=after.items[index];
  if(after.items.length!==c.result.items.length||!updated||updated.kind!=='study'||updated.origin.persistentId!==(id||undefined)||(updated.attributes?.['answer-to']??'')!==answer||updated.text!==item.text||updated.componentId!==item.componentId||updated.studyKind!==item.studyKind||updated.attributes?.title!==item.attributes?.title)throw Error('関連付け以外の構造が変化しました。');
  return next;
}
