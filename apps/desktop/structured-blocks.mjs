// Deliberately conservative projection of BCM's lossless scanner, not a Markdown AST.
// Only isolated plain paragraphs, plain ATX headings and closed standalone equations
// are directly editable. Everything else retains its original source envelope.
const plain=value=>typeof value==='string'&&/^[\p{L}\p{M}\p{N}。、，．！？「」『』（）・　 ,.!?()]+$/u.test(value)&&value.trim()===value&&!/^\d+[.)]\s/.test(value);
const eol=/(?:\r\n|\r|\n)$/;
export function projectBlocks(source,scan){
  const result=scan(source),blocks=result.blocks,rows=[];
  for(let index=0;index<blocks.length;index++){
    const block=blocks[index],raw=source.slice(block.range.start,block.range.end);
    if(block.kind==='blank')continue;
    let kind=block.kind,label=({heading:'見出し',raw:'本文 / Markdown',math:'独立数式',code:'コード',directive:'部品・指示'})[kind]??kind;
    let payload=null,prefix='',suffix='';
    const body=raw.replace(eol,''),ending=raw.slice(body.length);
    if(kind==='heading'){
      const match=/^( {0,3}#{1,6}[ \t]+)(.+)$/.exec(body);
      if(match&&plain(match[2])){prefix=match[1];payload=match[2];suffix=ending;}
      label='見出し H'+block.level;
    }else if(kind==='raw'&&plain(body)&&(!blocks[index-1]||blocks[index-1].kind==='blank'||blocks[index-1].kind==='heading')&&(!blocks[index+1]||blocks[index+1].kind==='blank')){
      kind='paragraph';label='本文';payload=body;suffix=ending;
    }else if(kind==='math'){
      const match=/^(\$\$[ \t]*(?:\r\n|\n))([\s\S]+?)((?:\r\n|\n)\$\$[ \t]*(?:\r\n|\n)?$)/.exec(raw);
      if(match){prefix=match[1];payload=match[2].replace(/\r\n/g,'\n');suffix=match[3];}
    }else if(kind==='directive'){label='部品・指示：'+block.header.name;}
    rows.push({index,kind,label,range:{...block.range},raw,prefix,suffix,payload:result.diagnostics.length?null:payload});
  }
  return {rows,diagnostics:result.diagnostics};
}
export function planStructuredEdit(source,row,value,{scan,applyPatches,validateMath}){
  const original=projectBlocks(source,scan),current=original.rows.find(r=>r.index===row.index);
  if(!current||current.raw!==row.raw||current.range.start!==row.range.start||current.range.end!==row.range.end||current.payload===null)throw Error('原稿の構造が変わりました。開き直してください。');
  if(current.kind==='math'){
    if(!value.trim()||value.length>2048||value.includes('\r')||value.split('\n').some(line=>/^\$\$[ \t]*$/.test(line)))throw Error('数式の内容のみ入力してください。');
    validateMath(value);
  }else if(!plain(value))throw Error('この編集欄は1行の平文専用です。Markdown記法はソース編集で入力してください。');
  const normalized=current.kind==='math'&&current.prefix.endsWith('\r\n')?value.replace(/\n/g,'\r\n'):value;
  const replacement=current.prefix+normalized+current.suffix;
  const next=applyPatches(source,[{range:current.range,expected:current.raw,replacement}]);
  const before=scan(source),after=scan(next);
  if(after.diagnostics.length||before.blocks.length!==after.blocks.length)throw Error('ブロック構造を変更する編集はソース編集で行ってください。');
  for(let i=0;i<before.blocks.length;i++){
    const a=before.blocks[i],b=after.blocks[i];
    if(a.kind!==b.kind||a.level!==b.level||i!==current.index&&source.slice(a.range.start,a.range.end)!==next.slice(b.range.start,b.range.end))throw Error('他のブロックへの影響を検出したため変更しません。');
  }
  if(next.slice(after.blocks[current.index].range.start,after.blocks[current.index].range.end)!==replacement)throw Error('対象範囲が変化しました。');
  return next;
}
