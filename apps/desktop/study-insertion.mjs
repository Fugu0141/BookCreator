import {projectBlocks} from './structured-blocks.mjs';

// A block insertion never splits a paragraph, list, formula or directive.
// At a caret inside a block insert after that block; in whitespace insert
// before the next block. The existing source bytes are never replaced.
export function planStudyInsertion(source,caret,template,bodyLine,{scan,parseInline,applyPatches,indexBlockIds,file}){
  if(!Number.isSafeInteger(caret)||caret<0||caret>source.length)throw Error('挿入位置が不正です。');
  const before=projectBlocks(source,scan,parseInline);
  if(before.diagnostics.length)throw Error('原稿の構文を確認してから挿入してください。');
  const rows=before.rows;
  const containing=rows.findIndex(row=>row.range.start<=caret&&caret<row.range.end);
  const following=rows.findIndex(row=>row.range.start>=caret);
  const index=containing>=0?containing+1:following>=0?following:rows.length;
  const offset=index<rows.length?rows[index].range.start:source.length;
  const eol=source.includes('\r\n')?'\r\n':'\n';
  if(/\r(?!\n)/.test(source)||source.includes('\r\n')&&source.replace(/\r\n/g,'').includes('\n'))throw Error('改行形式が混在しています。');
  const prefix=source.slice(0,offset),suffix=source.slice(offset);
  const lead=!prefix||prefix.endsWith(eol+eol)?'':prefix.endsWith(eol)?eol:eol+eol;
  const raw=template.replace(/\n/g,eol);
  if(!raw.endsWith(eol))throw Error('教材部品のひな型が不正です。');
  const trail=suffix?eol:'';
  const patch={range:{start:offset,end:offset},expected:'',replacement:lead+raw+trail};
  const next=applyPatches(source,[patch]),after=projectBlocks(next,scan,parseInline),parsed=scan(next);
  const start=offset+lead.length,inserted=parsed.blocks.find(b=>b.range.start===start&&b.range.end===start+raw.length);
  if(after.diagnostics.length||parsed.diagnostics.length||!inserted||inserted.kind!=='directive'||!inserted.closed||after.rows.length!==rows.length+1||after.rows[index]?.raw!==raw)throw Error('安全に教材部品を挿入できません。');
  for(let i=0;i<rows.length;i++){
    const a=rows[i],b=after.rows[i<index?i:i+1];
    const terminalExtension=i===rows.length-1&&index===rows.length&&!a.raw.endsWith(eol)&&b.raw===a.raw+eol;
    if(a.kind!==b.kind||a.level!==b.level||a.raw!==b.raw&&!terminalExtension)throw Error('周囲の構造が変化するため挿入を中止しました。');
  }
  if(indexBlockIds([{documentId:file.id,revision:file.revision,parsed}]).diagnostics.length)throw Error('原稿内で部品IDが重複しています。');
  const lines=raw.split(eol);
  if(!Number.isSafeInteger(bodyLine)||bodyLine<1||bodyLine>=lines.length-1)throw Error('教材部品の入力欄が不正です。');
  const p=start+lines.slice(0,bodyLine).join(eol).length+eol.length;
  return {patch,selection:{start:p,end:p+lines[bodyLine].length}};
}
