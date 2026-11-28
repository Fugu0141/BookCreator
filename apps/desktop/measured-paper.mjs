import {installPaperNavigation} from './paper-navigation.mjs';
// A reused page preserves physical geometry; source bindings must still be
// rebuilt. Weak keys keep geometry from extending the lifetime of old DOM.
const thumbnailCache=new WeakMap();
// A sparse lease guarantees that reused fragments retain their DOM structure.
// Cache only node topology and local geometry offsets, never source ranges.
const fragmentTopology=new WeakMap();
function navigationNodes(fragment,reuse){
  const cached=reuse?fragmentTopology.get(fragment):undefined;
  if(cached)return cached;
  const math=Array.from(fragment.querySelectorAll('[data-inline-math],[data-slot-display-math]'),node=>({
    node,textStart:Number(node.dataset.mathStart),textEnd:Number(node.dataset.mathEnd),
    name:node.closest('[data-named-slot]')?.dataset.namedSlot
  }));
  const slots=Array.from(fragment.querySelectorAll('[data-named-slot]'),node=>({node,name:node.dataset.namedSlot}));
  const value={math,slots};
  fragmentTopology.set(fragment,value);
  return value;
}
// DOM adapter: measured paper metadata and source navigation bindings.
// Does not own editor state or perform a file operation.
export function describeMeasuredPaper(result,options,{previewSourceRange,paperThumbnail,onNavigate},assembly){
  const bindings=new WeakMap();
  const root=assembly?.root??result.element.shadowRoot;
  const pageRecords=assembly?assembly.pages:[...root.querySelectorAll('[data-page]')].map(node=>({node,reuse:false,fragments:[...node.querySelectorAll('[data-block]')]}));
  // Index by the two origin fields directly. Avoid temporary flatMap arrays
  // and serializing a composite key for every source block and fragment.
  const sourceBlocks=new Map();
  for(const {blocks} of options.sections)for(const block of blocks){
    if('kind' in block)continue;
    const {documentId,blockKey}=block.origin;
    let document=sourceBlocks.get(documentId);
    if(!document){document=new Map();sourceBlocks.set(documentId,document);}
    document.set(blockKey,block);
  }
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
      const block=sourceBlocks.get(slice.origin.documentId)?.get(slice.origin.blockKey);
      bind(el,previewSourceRange(block,slice));
      const topology=navigationNodes(el,reuse);
      for(const {node,textStart,textEnd,name} of topology.math){
        const local=name===undefined?slice:slice.namedSlots?.find(s=>s.name===name);
        if(local&&textStart>=local.textStart&&textEnd<=local.textEnd&&textEnd===textStart+1)bind(node,previewSourceRange(block,{textStart,textEnd},name));
      }
      for(const {node,name} of topology.slots){
        const named=slice.namedSlots?.find(s=>s.name===name);
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
