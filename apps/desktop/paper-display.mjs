import {createProvisionalPaper} from './provisional-paper.mjs';
import {prepareSparsePaperAssembly} from './sparse-paper-assembly.mjs';
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
  let target=null,host=null,sparseBase=null;
  const provisional=createProvisionalPaper();
  function forgetSparseBase(){provisional.clear();sparseBase=null;}
  function getSparseBase(viewport,key){
    return sparseBase&&host===sparseBase.host&&target===key&&host.parentNode===viewport&&host.inert===true?sparseBase:null;
  }
  function clear(viewport){
    forgetSparseBase();
    if(viewport?.firstChild??viewport?.firstElementChild)viewport.replaceChildren();
    target=null;host=null;
  }
  function retain(viewport,key){
    provisional.clear();
    if(!host||target!==key||host.parentNode!==viewport){clear(viewport);return false;}
    if(!host.inert)host.inert=true;
    if(host.dataset.paperFreshness!=='previous')host.dataset.paperFreshness='previous';
    return true;
  }
  function publish(viewport,key,next,{reusePages=false}={}){
    forgetSparseBase();
    const same=!!host&&target===key&&host.parentNode===viewport;
    const top=same?viewport.scrollTop:0,left=same?viewport.scrollLeft:0;
    if(same&&reusePages&&patchPaper(host,next)){
      host.inert=false;host.dataset.paperFreshness='current';host.dataset.sparsePaper='false';
    }else{
      next.inert=false;next.dataset.paperFreshness='current';
      next.dataset.reusedPages='0';next.dataset.sparsePaper='false';viewport.replaceChildren(next);
      target=key;host=next;
    }
    viewport.scrollTop=top;viewport.scrollLeft=left;
    return same;
  }
  // A sparse result is usable only against the exact published lease. Never
  // attach a partial host. The caller supplies a synchronous metadata adapter
  // which binds the latest source ranges to the final ordered nodes.
  function publishSparse(viewport,key,result,lease,describe,timing){
    const started=timing?performance.now():0;
    provisional.clear();
    const omitted=result.pageDelta?.reusedPageIndices?.length;
    const base=getSparseBase(viewport,key);
    if(omitted&&(!base||base!==lease))return null;
    const assembly=prepareSparsePaperAssembly(omitted?host.shadowRoot:null,result);
    if(!assembly)return null;
    const assembled=timing?performance.now():0;
    const same=!!host&&target===key&&host.parentNode===viewport;
    const top=same?viewport.scrollTop:0,left=same?viewport.scrollLeft:0;
    const next=result.changedElement;
    // Report only complete transactions. Commit includes scroll restoration,
    // host attributes and the new lease, not browser paint.
    const report=(described)=>{
      if(timing)Object.assign(timing,{assemblyMs:assembled-started,describeMs:described-assembled,commitMs:performance.now()-described});
    };
    try{
      if(!assembly.reused){
        const pages=describe(next.shadowRoot,assembly.pages);
        const described=timing?performance.now():0;
        const retained=publish(viewport,key,next);
        host.dataset.sparsePaper='true';host.dataset.generatedPages=String(assembly.pages.length);
        sparseBase=Object.freeze({host,snapshot:result.pageDelta.snapshot});
        report(described);
        return {retained,pages};
      }
      const root=host.shadowRoot;
      // The host remains inert while all mappings and DOM are updated.
      const pages=describe(root,assembly.pages);
      const described=timing?performance.now():0;
      const old=Array.from(root.children);
      for(const page of assembly.pages){
        if(page.reuse)continue;
        if(old[page.index])old[page.index].replaceWith(page.node);
        else root.append(page.node);
      }
      for(const node of assembly.removed)node.remove();
      host.dataset.reusedPages=String(assembly.reused);
      host.dataset.sparsePaper='true';host.dataset.generatedPages=String(assembly.pages.length-assembly.reused);
      host.dataset.paperFreshness='current';host.inert=false;
      sparseBase=Object.freeze({host,snapshot:result.pageDelta.snapshot});
      viewport.scrollTop=top;viewport.scrollLeft=left;
      report(described);
      return {retained:true,pages};
    }catch{
      // Incomplete candidate cannot serve as a full fallback. Discard an
      // uncertain transaction and let the caller generate a complete preview.
      clear(viewport);return null;
    }
  }
  function beginProvisional(viewport,key,lease,current){
    if(!lease||getSparseBase(viewport,key)!==lease)return null;
    return provisional.begin({viewport,host:lease.host,current,owns:()=>getSparseBase(viewport,key)===lease});
  }
  return {clear,retain,publish,getSparseBase,forgetSparseBase,publishSparse,beginProvisional};
}
