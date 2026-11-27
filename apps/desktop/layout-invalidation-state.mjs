// Preserve state identity when a visible layout is already invalidated.
// Generation cancellation is deliberately not part of this pure projection.
export function invalidateLayoutState(previous,clear=false){
  if(clear){
    if(previous.phase==='idle'&&previous.scope===null&&previous.pages===0)return previous;
    return {phase:'idle',scope:null,pages:0};
  }
  if(previous.phase==='idle'||previous.phase==='stale'&&previous.pages===0)return previous;
  return {...previous,phase:'stale',pages:0};
}
export function emptyIfNeeded(previous){
  return previous.length===0?previous:[];
}
