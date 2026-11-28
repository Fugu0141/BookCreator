// One pair of listeners per paper root. Replace the source mapping when a
// new measured result is published; no per-fragment callbacks survive reuse.
const roots=new WeakMap();
export function installPaperNavigation(root,bindings,onNavigate){
  let state=roots.get(root);
  if(!state){
    state={bindings,onNavigate};
    const dispatch=(event,keyboard)=>{
      if(root.host?.inert||keyboard&&event.key!=='Enter'&&event.key!==' ')return;
      for(const node of event.composedPath()){
        if(node===root)break;
        const binding=state.bindings.get(node);
        if(!binding)continue;
        if(keyboard)event.preventDefault();
        event.stopPropagation();
        state.onNavigate(binding.documentId,binding.range,node);
        return;
      }
    };
    root.addEventListener('click',event=>dispatch(event,false));
    root.addEventListener('keydown',event=>dispatch(event,true));
    roots.set(root,state);
  }else{
    state.bindings=bindings;state.onNavigate=onNavigate;
  }
}

// Build a fresh map for the final root before mutating any displayed page.
// Equal subtrees have corresponding child order, not necessarily equal ranges.
export function preparePaperNavigationTransfer(previousRoot,nextRoot,plan){
  const next=roots.get(nextRoot);
  if(!next)return null;
  const bindings=new WeakMap();
  function transfer(source,target){
    if(source.nodeType!==target.nodeType)return false;
    const binding=next.bindings.get(source);
    if(binding)bindings.set(target,binding);
    if(source.childNodes.length!==target.childNodes.length)return false;
    for(let i=0;i<source.childNodes.length;i++){
      if(!transfer(source.childNodes[i],target.childNodes[i]))return false;
    }
    return true;
  }
  for(const page of plan.pages){
    if(!transfer(page.next,page.reuse?page.previous:page.next))return null;
  }
  return ()=>installPaperNavigation(previousRoot,bindings,next.onNavigate);
}

/** Resolve the actual measured fragment under a pointer without navigating. */
export function paperBindingAtPoint(root,x,y){
  if(!root||root.host?.inert||!Number.isFinite(x)||!Number.isFinite(y))return null;
  const state=roots.get(root);
  if(!state||typeof root.elementFromPoint!=='function')return null;
  for(let node=root.elementFromPoint(x,y);node&&node!==root;node=node.parentNode){
    const binding=state.bindings.get(node);
    if(binding)return {...binding,node};
  }
  return null;
}
