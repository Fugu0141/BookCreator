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
        state.onNavigate(binding.documentId,binding.range);
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
