import {planPaperPageReuse} from './paper-page-reuse.mjs';
import {preparePaperNavigationTransfer} from './paper-navigation.mjs';

// The old host stays inert throughout the synchronous transaction. A failed
// plan or transfer uses the original detached result as the full replacement.
function patchPaper(host,next){
  const previousRoot=host.shadowRoot,nextRoot=next.shadowRoot;
  const plan=planPaperPageReuse(previousRoot,nextRoot);
  if(!plan?.reused)return false;
  const bind=preparePaperNavigationTransfer(previousRoot,nextRoot,plan);
  if(!bind)return false;
  try{
    for(const page of plan.pages){
      if(page.reuse)continue;
      if(page.previous)page.previous.replaceWith(page.next);
      else previousRoot.append(page.next);
    }
    for(const page of plan.removed)page.remove();
    bind();
    host.dataset.reusedPages=String(plan.reused);
    return true;
  }catch{
    // Reassemble the untouched candidate pages and any moved replacements.
    // The old host is still inert and will be discarded by publish.
    nextRoot.replaceChildren(...plan.pages.map(p=>p.next));
    return false;
  }
}
// The paper display owns the last successful host, not the editor or its data.
export function createPaperDisplay(){
  let target=null,host=null;
  function clear(viewport){
    viewport?.replaceChildren();target=null;host=null;
  }
  function retain(viewport,key){
    if(!host||target!==key||host.parentNode!==viewport){clear(viewport);return false;}
    host.inert=true;
    host.dataset.paperFreshness='previous';
    return true;
  }
  function publish(viewport,key,next,{reusePages=false}={}){
    const same=!!host&&target===key&&host.parentNode===viewport;
    const top=same?viewport.scrollTop:0,left=same?viewport.scrollLeft:0;
    if(same&&reusePages&&patchPaper(host,next)){
      host.inert=false;host.dataset.paperFreshness='current';
    }else{
      next.inert=false;next.dataset.paperFreshness='current';
      next.dataset.reusedPages='0';viewport.replaceChildren(next);
      target=key;host=next;
    }
    viewport.scrollTop=top;viewport.scrollLeft=left;
    return same;
  }
  return {clear,retain,publish};
}
