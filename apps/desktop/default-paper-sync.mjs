// Default paper display has no fit-to-window computation. Restore a host
// once on entry or replacement. Sparse publications keep the same host and
// create fresh pages with visible guides, so readiness changes are irrelevant.
export function createDefaultPaperSync(viewport){
  let previous=null;
  return ()=>{
    const host=viewport.firstElementChild;
    if(host===previous)return false;
    previous=host;
    if(!host)return false;
    if(host.style.zoom!=='1')host.style.zoom='1';
    if(host.style.width!=='')host.style.width='';
    if(viewport.dataset.paperZoom!=='1')viewport.dataset.paperZoom='1';
    for(const guide of host.shadowRoot?.querySelectorAll('[data-content-guide]')??[])
      if(guide.style.visibility!=='')guide.style.visibility='';
    return true;
  };
}
