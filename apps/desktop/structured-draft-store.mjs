// Workspace-local uncommitted editor state. Only opening/closing a draft
// changes the parent workspace's subscription. Functional updates use the
// latest snapshot, even if several editor events occur in one batch.
export function createStructuredDraftStore(){
  let draft=null;
  const draftListeners=new Set(),activeListeners=new Set();
  const subscribe=set=>listener=>{set.add(listener);return ()=>set.delete(listener);};
  function set(update){
    const next=typeof update==='function'?update(draft):update;
    if(Object.is(next,draft))return;
    const activeChanged=!!next!==!!draft;
    draft=next;
    if(activeChanged)for(const listener of [...activeListeners])listener();
    for(const listener of [...draftListeners])listener();
  }
  return {set,getSnapshot:()=>draft,getActive:()=>!!draft,subscribe:subscribe(draftListeners),subscribeActive:subscribe(activeListeners)};
}
