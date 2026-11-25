// Draft-only immutable history. A drag gesture is one commit, not one per pointer move.
const LIMIT=64;
export function createHistory(initial){return {past:[],present:initial,future:[]};}
export function commitHistory(history,next){
  if(JSON.stringify(history.present)===JSON.stringify(next))return history;
  return {past:[...history.past,history.present].slice(-LIMIT),present:next,future:[]};
}
export function undoHistory(h){
  if(!h.past.length)return h;
  return {past:h.past.slice(0,-1),present:h.past.at(-1),future:[h.present,...h.future]};
}
export function redoHistory(h){
  if(!h.future.length)return h;
  return {past:[...h.past,h.present].slice(-LIMIT),present:h.future[0],future:h.future.slice(1)};
}
