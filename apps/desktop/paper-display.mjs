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
  function publish(viewport,key,next){
    const same=!!host&&target===key&&host.parentNode===viewport;
    const top=same?viewport.scrollTop:0,left=same?viewport.scrollLeft:0;
    next.inert=false;next.dataset.paperFreshness='current';
    viewport.replaceChildren(next);
    target=key;host=next;
    viewport.scrollTop=top;viewport.scrollLeft=left;
    return same;
  }
  return {clear,retain,publish};
}
