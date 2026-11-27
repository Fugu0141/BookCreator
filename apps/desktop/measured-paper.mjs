import {installPaperNavigation} from './paper-navigation.mjs';
// A reused page preserves physical geometry; source bindings must still be
// rebuilt. Weak keys keep geometry from extending the lifetime of old DOM.
const thumbnailCache=new WeakMap();
// DOM adapter: measured paper metadata and source navigation bindings.
// Does not own editor state or perform a file operation.
export function describeMeasuredPaper(result,options,{previewSourceRange,paperThumbnail,onNavigate},assembly){
  const bindings=new WeakMap();
  const root=assembly?.root??result.element.shadowRoot;
  const pageRecords=assembly?assembly.pages:[...root.querySelectorAll('[data-page]')].map(node=>({node,reuse:false,fragments:[...node.querySelectorAll('[data-block]')]}));
  const sourceBlocks=new Map(options.sections.flatMap(s=>s.blocks.filter(b=>!('kind' in b)).map(b=>[JSON.stringify([b.origin.documentId,b.origin.blockKey]),b])));
  let cursor=0;
  const pages=pageRecords.map(({node:page,reuse,fragments},index)=>{
    const documents=new Set();
    for(const el of fragments){
      const slice=result.slices[cursor++];if(!slice)continue;
      documents.add(slice.origin.documentId);
      const bind=(node,range)=>{
        if(!range){if(reuse){node.removeAttribute('tabindex');node.style.removeProperty('cursor');}return;}
        if(node.tabIndex!==0)node.tabIndex=0;
        if(node.style.cursor!=='pointer')node.style.cursor='pointer';
        bindings.set(node,{documentId:slice.origin.documentId,range});
      };
      const block=sourceBlocks.get(JSON.stringify([slice.origin.documentId,slice.origin.blockKey]));
      bind(el,previewSourceRange(block,slice));
      for(const node of el.querySelectorAll('[data-inline-math],[data-slot-display-math]')){
        const textStart=Number(node.dataset.mathStart),textEnd=Number(node.dataset.mathEnd);
        const name=node.closest('[data-named-slot]')?.dataset.namedSlot;
        const local=name===undefined?slice:slice.namedSlots?.find(s=>s.name===name);
        if(local&&textStart>=local.textStart&&textEnd<=local.textEnd&&textEnd===textStart+1)bind(node,previewSourceRange(block,{textStart,textEnd},name));
      }
      for(const node of el.querySelectorAll('[data-named-slot]')){
        const named=slice.namedSlots?.find(s=>s.name===node.dataset.namedSlot);
        if(named)bind(node,previewSourceRange(block,named,named.name));
      }
    }
    let thumbnail;
    const cached=reuse?thumbnailCache.get(page):undefined;
    if(cached&&cached.adapter===paperThumbnail)thumbnail=cached.value;
    else{
      thumbnail=paperThumbnail(page,fragments);
      thumbnailCache.set(page,{adapter:paperThumbnail,value:thumbnail});
    }
    return {number:index+1,documents:[...documents],blocks:fragments.length,thumbnail};
  });
  installPaperNavigation(root,bindings,onNavigate);
  return pages;
}
