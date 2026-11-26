// Conservative projection of BCM scanner ranges, using the existing inline parser.
import {projectList,isolatedListContext} from './structured-list.mjs';
import {projectMixed} from './structured-mixed.mjs';
const eol=/(?:\r\n|\r|\n)$/;
const normalize=s=>s.replace(/\r\n/g,'\n');
const supported=(s,parseInline)=>{
  if(!s||s.trim()!==s||s.split('\n').some(line=>!line||line.trim()!==line||/^\d+[.)]\s/.test(line)))return null;
  try{return parseInline(s);}catch{return null;}
};
export function projectBlocks(source,scan,parseInline){
  const result=scan(source),blocks=result.blocks,rows=[];
  for(let index=0;index<blocks.length;index++){
    const block=blocks[index];
    if(block.kind==='blank')continue;
    let last=index,kind=block.kind,label=({heading:'見出し',raw:'本文 / Markdown',math:'独立数式',code:'コード',directive:'部品・指示'})[kind]??kind;
    if(kind==='raw')while(blocks[last+1]?.kind==='raw'&&blocks[last].range.end===blocks[last+1].range.start)last++;
    const range={start:block.range.start,end:blocks[last].range.end},raw=source.slice(range.start,range.end);
    let payload=null,prefix='',suffix='',inline=null,list=null;
    const body=raw.replace(eol,''),ending=raw.slice(body.length);
    if(kind==='heading'){
      const match=/^( {0,3}#{1,6}[ \t]+)(.+)$/.exec(body);
      if(match&&(inline=supported(match[2],parseInline))&&!inline.inlineMath.length){prefix=match[1];payload=match[2];suffix=ending;}
      label='見出し H'+block.level;
    }else if(kind==='raw'&&/^(?: {0,3})(?:[-+*]|[1-9][0-9]{0,2}\.) /.test(raw)&&isolatedListContext(source,blocks,index,last)&&(list=projectList(raw,scan,parseInline))){
      kind='list';label='リスト';
    }else if(kind==='raw'&&(!blocks[index-1]||['blank','heading'].includes(blocks[index-1].kind))&&(!blocks[last+1]||blocks[last+1].kind==='blank')&&(inline=supported(normalize(body),parseInline))){
      kind='paragraph';label='本文';payload=normalize(body);suffix=ending;
    }else if(kind==='math'){
      const match=/^(\$\$[ \t]*(?:\r\n|\n))([\s\S]+?)((?:\r\n|\n)\$\$[ \t]*(?:\r\n|\n)?$)/.exec(raw);
      if(match){prefix=match[1];payload=normalize(match[2]);suffix=match[3];}
    }else if(kind==='directive'){label='部品・指示：'+block.header.name;}
    const mixed=!result.diagnostics.length&&block.kind==='raw'&&['paragraph','raw'].includes(kind)&&(!blocks[index-1]||['blank','heading'].includes(blocks[index-1].kind))&&(!blocks[last+1]||blocks[last+1].kind==='blank')&&!/\r(?!\n)/.test(body)&&(!raw.includes('\r\n')||!raw.replace(/\r\n/g,'').includes('\n'))?projectMixed(normalize(body)):null;
    rows.push({index,last,kind,label,range,raw,prefix,suffix,level:block.level,mixed,list:result.diagnostics.length?null:list,inline:result.diagnostics.length?null:inline,payload:result.diagnostics.length?null:payload});
    index=last;
  }
  return {rows,diagnostics:result.diagnostics};
}
export function planStructuredEdit(source,row,value,{scan,applyPatches,validateMath,parseInline,level=row.level}){
  const original=projectBlocks(source,scan,parseInline),current=original.rows.find(r=>r.index===row.index);
  if(!current||current.raw!==row.raw||current.range.start!==row.range.start||current.range.end!==row.range.end||current.payload===null)throw Error('原稿の構造が変わりました。開き直してください。');
  if(current.kind==='math'){
    if(!value.trim()||value.length>2048||value.includes('\r')||value.split('\n').some(line=>/^\$\$[ \t]*$/.test(line)))throw Error('数式の内容のみ入力してください。');
    validateMath(value);
  }else if(value.includes('\r')||!supported(value,parseInline)||(current.kind==='heading'&&(value.includes('\n')||parseInline(value).inlineMath.length)))throw Error('対応する文章・文字書式を入力してください。空行や複雑な記法はソース編集で扱います。');
  let prefix=current.prefix;
  if(current.kind==='heading'){
    if(!Number.isInteger(level)||level<1||level>6)throw Error('見出しレベルが不正です。');
    prefix=prefix.replace(/#{1,6}/,'#'.repeat(level));
  }
  if(value===current.payload&&prefix===current.prefix)return source;
  // Preserve the document's existing newline convention, even for a final block with no EOL.
  const crlf=current.raw.includes('\r\n')||(!current.raw.includes('\n')&&source.includes('\r\n'));
  const replacement=prefix+(crlf?value.replace(/\n/g,'\r\n'):value)+current.suffix;
  const next=applyPatches(source,[{range:current.range,expected:current.raw,replacement}]);
  const after=projectBlocks(next,scan,parseInline),pos=original.rows.indexOf(current);
  if(after.diagnostics.length||after.rows.length!==original.rows.length)throw Error('ブロック構造を変更する編集はソース編集で行ってください。');
  for(let i=0;i<original.rows.length;i++){
    const a=original.rows[i],b=after.rows[i];
    if(a.kind!==b.kind||(i!==pos&&a.raw!==b.raw))throw Error('他のブロックへの影響を検出したため変更しません。');
  }
  const changed=after.rows[pos];
  if(changed.raw!==replacement||changed.payload!==value||(current.kind==='heading'&&changed.level!==level))throw Error('対象範囲が変化しました。');
  return next;
}
