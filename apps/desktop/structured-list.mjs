import {prepareManuscript,planListFormat,planListBatch,planListIndent} from '../../dist/index.js';
const eol=/(?:\r\n|\n)$/;
const marker=/^( {0,3})([-+*]|[1-9][0-9]{0,2}\.) (\S.*)$/;
const listLike=/^[ \t]*([-+*]|[0-9]+[.)])(?:[ \t]|$)/;
export function projectList(raw,scan,parseInline){
  try{
    const p=prepareManuscript([{documentId:'structured-list',revision:'1',source:raw,startOn:'page'}],'1','structured-list',{width:100000,height:100000},{scan,validate:s=>({diagnostics:s.diagnostics}),index:()=>({diagnostics:[]})});
    if(!p.input||!p.items.length||p.items.some(i=>i.kind!=='list'))return null;
    return p.items.map(i=>{
      const r=i.origin.range,line=raw.slice(r.start,r.end),body=line.replace(eol,''),m=marker.exec(body);
      if(!m)throw Error('Invalid list item');
      return {range:r,raw:line,prefix:m[1]+m[2]+' ',value:m[3],suffix:line.slice(body.length),parsed:parseInline(m[3]),...i.listItem};
    });
  }catch{return null;}
}
export function isolatedListContext(source,blocks,first,last){
  for(const [index,step] of [[first,-1],[last,1]]){
    let j=index+step;while(blocks[j]?.kind==='blank')j+=step;
    const near=blocks[j];
    if(near&&(near.kind==='code'||near.kind==='raw'&&(j===index+step||listLike.test(source.slice(near.range.start,near.range.end)))))return false;
  }
  return true;
}
// Resize only unambiguous, single-level lists with consistent markers and line endings.
export function canResizeList(items){
  if(!items?.length||items.some(i=>i.depth!==0||i.kind!==items[0].kind))return false;
  const ending=items[0].suffix;
  if(items.some((i,j)=>j<items.length-1?(!ending||i.suffix!==ending):!!i.suffix&&i.suffix!==ending))return false;
  return items.every((i,j)=>i.kind==='ordered'?i.prefix===(j+1)+'. '&&i.number===j+1:/^[-+*] $/.test(i.prefix)&&i.prefix===items[0].prefix);
}
export function planListValues(source,row,values,{scan,parseInline,applyPatches,project}){
  const current=project(source,scan,parseInline).rows.find(r=>r.range.start===row.range.start&&r.raw===row.raw);
  if(!current?.list||!Array.isArray(values)||!values.length)throw Error('リストが変更されました。');
  const resizing=values.length!==current.list.length;
  if(resizing&&(!canResizeList(current.list)||values.length>999))throw Error('このリストでは項目数を変更できません。');
  const first=current.list[0],last=current.list.at(-1),newline=first.suffix||(source.includes('\r\n')?'\r\n':'\n');
  const replacement=values.map((value,i)=>{
    if(typeof value!=='string'||!value||value.trim()!==value||/[\r\n]/.test(value))throw Error('項目には空でない1行の文章を入力してください。');
    parseInline(value);
    if(resizing)return (first.kind==='ordered'?(i+1)+'. ':first.prefix)+value+(i===values.length-1?last.suffix:newline);
    const item=current.list[i];
    return item.prefix+value+item.suffix;
  }).join('');
  const next=applyPatches(source,[{range:current.range,expected:current.raw,replacement}]);
  const after=project(next,scan,parseInline),before=project(source,scan,parseInline),at=before.rows.findIndex(r=>r.range.start===current.range.start);
  if(after.diagnostics.length||after.rows.length!==before.rows.length||after.rows.some((r,i)=>i!==at&&(r.kind!==before.rows[i].kind||r.raw!==before.rows[i].raw)))throw Error('周囲の原稿が変化しました。');
  const changed=after.rows[at];
  if(!changed.list||changed.raw!==replacement||changed.list.length!==values.length||changed.list.some((i,j)=>i.value!==values[j]||(resizing?(i.depth!==0||i.kind!==first.kind||(first.kind==='ordered'&&i.number!==j+1)):(i.depth!==current.list[j].depth||i.kind!==current.list[j].kind||i.number!==current.list[j].number))))throw Error('リストの構造が変化しました。');
  return next;
}
export function planListAction(source,row,request,{scan,parseInline,applyPatches,project}){
  const before=project(source,scan,parseInline),current=before.rows.find(r=>r.range.start===row.range.start&&r.raw===row.raw);
  if(before.diagnostics.length||!current||!['paragraph','list'].includes(current.kind))throw Error('対象が変更されました。');
  const end=current.range.end-(current.raw.match(eol)?.[0].length??0);
  let p;
  if(request.action==='indent'||request.action==='outdent'){
    const item=current.list?.[request.item];if(!item)throw Error('項目を選択してください。');
    const start=current.range.start+item.range.start;
    p=planListIndent(source,start,start,request.action,scan);
  }else{
    if(!['bullet','ordered'].includes(request.kind))throw Error('不明なリスト形式');
    const multi=current.raw.replace(eol,'').includes('\n');
    p=(multi?planListBatch:planListFormat)(source,current.range.start,end,request.kind,scan);
  }
  const next=applyPatches(source,[p.patch]),after=project(next,scan,parseInline),at=before.rows.indexOf(current);
  if(after.diagnostics.length||after.rows.length!==before.rows.length||after.rows.some((r,i)=>i!==at&&(r.kind!==before.rows[i].kind||r.raw!==before.rows[i].raw))||!['paragraph','list'].includes(after.rows[at]?.kind))throw Error('周囲の構造が変化するため中止しました。');
  return next;
}

// A hierarchy operation may stage a validated intermediate source, never commit it.
export function listDraftRow(source,draft,{scan,parseInline,project}){
  if(draft.source!==source)throw Error('原稿が変更されました。');
  const before=project(source,scan,parseInline),at=before.rows.findIndex(r=>r.range.start===draft.row.range.start&&r.raw===draft.row.raw);
  if(before.diagnostics.length||at<0||!before.rows[at].list)throw Error('対象リストが変更されました。');
  const layout=draft.listLayout??source,after=project(layout,scan,parseInline);
  if(after.diagnostics.length||after.rows.length!==before.rows.length||after.rows.some((r,i)=>i!==at&&(r.kind!==before.rows[i].kind||r.raw!==before.rows[i].raw))||!after.rows[at].list)throw Error('リスト以外の構造が変化しました。');
  const row=after.rows[at];
  // Require unchanged bytes before and after the list, including blank lines.
  const original=before.rows[at];
  if(layout.slice(0,row.range.start)!==source.slice(0,original.range.start)||layout.slice(row.range.end)!==source.slice(original.range.end))throw Error('リスト以外の原文が変化しました。');
  return row;
}
export function planListDraft(source,draft,options){
  const row=listDraftRow(source,draft,options);
  return planListValues(draft.listLayout??source,row,draft.values,options);
}
export function splitListInput(value,start,end,parseInline){
  if(start!==end||!Number.isInteger(start)||start<0||start>value.length)return null;
  if(start===value.length)return [value,''];
  try{
    const p=parseInline(value);
    if(p.text!==value||p.inlineMath.length||p.inlineStyles.length||p.sourceMap.segments.some(s=>s.derived))return null;
    if(!new Set(Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(value),g=>g.index)).has(start))return null;
    return [value.slice(0,start),value.slice(start)];
  }catch{return null;}
}
