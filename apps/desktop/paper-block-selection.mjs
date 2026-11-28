// A measured fragment may be a single line, named slot, or an entire block.
// Select the containing source row only when the mapping is unambiguous.
export function resolvePaperBlock(rows,range){
  if(!Array.isArray(rows)||!range||!Number.isSafeInteger(range.start)||!Number.isSafeInteger(range.end)||range.start<0||range.end<=range.start)return null;
  const matches=rows.map((row,index)=>({row,index})).filter(({row})=>row.range.start<=range.start&&range.end<=row.range.end);
  return matches.length===1?matches[0]:null;
}

/** Resolve a target index inside the prevalidated reachable interval. */
export function resolvePaperDrop(selection,binding){
  if(!selection?.bounds||!binding||binding.documentId!==selection.command.file.id)return null;
  const target=resolvePaperBlock(selection.rows,binding.range);
  if(!target||target.index===selection.index||target.index<selection.bounds.min||target.index>selection.bounds.max)return null;
  return target.index;
}
