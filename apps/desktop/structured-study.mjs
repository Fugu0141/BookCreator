import {studyKind,customStudyId,validNamedSlot,parsePreviewInline} from '../../dist/index.js';
import {parsePreviewMath,parseDisplayMath} from '../../../BookCreator_LayoutEngine/dist/index.js';

const endLine=/(?:\r\n|\n)$/;
const normalize=s=>s.replace(/\r\n/g,'\n');
export function parseStudyText(value){return parsePreviewInline(value,0,parsePreviewMath,undefined,true,parseDisplayMath);}
function field(source,children,name){
  const visible=children.filter(c=>c.kind!=='blank');
  if(!visible.length||visible.some(c=>!['raw','math'].includes(c.kind)))return null;
  const start=visible[0].range.start,end=visible.at(-1).range.end;
  const raw=source.slice(start,end),body=raw.replace(endLine,''),suffix=raw.slice(body.length),value=normalize(body);
  try{
    const parsed=parseStudyText(value);
    if(parsed.inlineMath.filter(a=>a.display).length!==visible.filter(c=>c.kind==='math').length)return null;
    return {name,range:{start,end},raw,suffix,value,parsed};
  }catch{return null;}
}
export function projectStudy(source,block){
  if(block.kind!=='directive'||!block.closed||block.header.kind!=='container')return null;
  const h=block.header,attrs=Object.fromEntries(h.attributes.map(a=>[a.key,a.value])),kind=studyKind(h.name,attrs),customId=customStudyId(h.name,attrs);
  if(!kind&&!customId)return null;
  const children=block.children.filter(c=>c.kind!=='blank'),fields=[];
  if(children.every(c=>['raw','math'].includes(c.kind))){
    const f=field(source,block.children,'content');if(!f)return null;fields.push(f);
  }else if(h.name==='component'&&children.length<=9){
    const seen=new Set();
    for(const slot of children){
      if(slot.kind!=='directive'||!slot.closed||slot.header.kind!=='container'||slot.header.name!=='slot'||slot.header.id||slot.header.attributes.length!==1||slot.header.attributes[0].key!=='name')return null;
      const name=slot.header.attributes[0].value;
      if((name!=='content'&&!validNamedSlot(name))||seen.has(name))return null;
      const f=field(source,slot.children,name);if(!f)return null;fields.push(f);seen.add(name);
    }
    if(!seen.has('content'))return null;
  }else return null;
  // Every non-content byte (header, blank separators, closing fences) is immutable.
  const envelope=[];let cursor=block.range.start;
  for(const f of fields){envelope.push(source.slice(cursor,f.range.start));cursor=f.range.end;}
  envelope.push(source.slice(cursor,block.range.end));
  return {kind,customId,id:h.id,title:attrs.title,answerTo:attrs['answer-to'],fields,envelope,range:{...block.range},raw:source.slice(block.range.start,block.range.end)};
}
export function planStudyEdit(source,original,values,{scan,applyPatches}){
  const before=scan(source);
  if(before.diagnostics.length)throw Error('原稿構造の診断を解消してください。');
  const index=before.blocks.findIndex(b=>b.range.start===original.range.start&&b.range.end===original.range.end);
  const current=projectStudy(source,before.blocks[index]??{});
  if(!current||current.raw!==original.raw)throw Error('部品の内容が変わりました。開き直してください。');
  if(!Array.isArray(values)||values.length!==current.fields.length)throw Error('部品の入力欄が変化しました。');
  const patches=current.fields.flatMap((f,i)=>{
    const value=values[i];
    if(typeof value!=='string'||!value.trim()||value.includes('\r')||value.trim()!==value)throw Error('入力欄の先頭・末尾の空白や空の本文は編集できません。');
    parseStudyText(value);
    if(value===f.value)return [];
    const crlf=f.raw.includes('\r\n')||(!f.raw.includes('\n')&&source.includes('\r\n'));
    return [{range:f.range,expected:f.raw,replacement:(crlf?value.replace(/\n/g,'\r\n'):value)+f.suffix}];
  });
  if(!patches.length)return source;
  const next=applyPatches(source,patches),after=scan(next);
  if(after.diagnostics.length||after.blocks.length!==before.blocks.length)throw Error('部品の外側の構造が変化しました。');
  for(let i=0;i<before.blocks.length;i++){
    const a=before.blocks[i],b=after.blocks[i];
    if(a.kind!==b.kind||i!==index&&source.slice(a.range.start,a.range.end)!==next.slice(b.range.start,b.range.end))throw Error('対象外の原稿が変化しました。');
  }
  const changed=projectStudy(next,after.blocks[index]);
  if(!changed||JSON.stringify(changed.envelope)!==JSON.stringify(current.envelope)||changed.fields.length!==current.fields.length||changed.fields.some((f,i)=>f.name!==current.fields[i].name||f.value!==values[i]))throw Error('部品のID・スロット・外枠を維持できないため反映しません。');
  return next;
}
