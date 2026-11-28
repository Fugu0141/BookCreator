// A measured fragment may be a single line, named slot, or an entire block.
// Select the containing source row only when the mapping is unambiguous.
export function resolvePaperBlock(rows,range){
  if(!Array.isArray(rows)||!range||!Number.isSafeInteger(range.start)||!Number.isSafeInteger(range.end)||range.start<0||range.end<=range.start)return null;
  const matches=rows.map((row,index)=>({row,index})).filter(({row})=>row.range.start<=range.start&&range.end<=row.range.end);
  return matches.length===1?matches[0]:null;
}

/** Only the existing, validated adjacent moves are exposed by the drag UI. */
export function resolvePaperDrop(selection,binding){
  if(!selection||!binding||binding.documentId!==selection.command.file.id)return null;
  const target=resolvePaperBlock(selection.rows,binding.range);
  if(!target)return null;
  const action=target.index===selection.index-1?'up':target.index===selection.index+1?'down':null;
  return action&&selection[action]?action:null;
}
