// Geometry only, read once at the start of a retained rendering job.
// The caller supplies the exact prior paper lease; never inspect another book.
const limit=64;
function validRect(r){return r&&[r.left,r.right,r.top,r.bottom].every(Number.isFinite)&&r.right>r.left&&r.bottom>r.top;}
export function visiblePaperPageIndices(viewport,host){
  if(!viewport||!host||host.parentNode!==viewport||viewport.firstElementChild!==host||viewport.closest('[hidden]'))return [];
  const bounds=viewport.getBoundingClientRect();
  if(!validRect(bounds)||viewport.clientWidth<=0||viewport.clientHeight<=0)return [];
  const left=bounds.left+viewport.clientLeft,top=bounds.top+viewport.clientTop;
  const right=Math.min(bounds.right,left+viewport.clientWidth),bottom=Math.min(bounds.bottom,top+viewport.clientHeight);
  const view={left,right,top,bottom};
  if(!validRect(view))return [];
  const visible=[],seen=new Set();
  for(const page of host.shadowRoot?.children??[]){
    const raw=page.dataset.page;
    if(typeof raw!=='string'||!/^(0|[1-9][0-9]*)$/.test(raw))continue;
    const index=Number(raw);
    if(!Number.isSafeInteger(index)||seen.has(index))continue;
    const rect=page.getBoundingClientRect();
    if(!validRect(rect)||rect.right<=left||rect.left>=right||rect.bottom<=top||rect.top>=bottom)continue;
    seen.add(index);
    visible.push(index);
    if(visible.length===limit)break;
  }
  return visible;
}
