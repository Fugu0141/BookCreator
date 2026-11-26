// DOM adapter: measured paper metadata and source navigation bindings.
// Does not own editor state or perform a file operation.
export function describeMeasuredPaper(result,options,{previewSourceRange,paperThumbnail,onNavigate}){
  const pageNodes=[...result.element.shadowRoot.querySelectorAll('[data-page]')];
  const sourceIds=new Map(pageNodes.map(node=>[node,new Set()]));
  const sourceBlocks=new Map(options.sections.flatMap(s=>s.blocks.filter(b=>!('kind' in b)).map(b=>[JSON.stringify([b.origin.documentId,b.origin.blockKey]),b])));
  [...result.element.shadowRoot.querySelectorAll('[data-block]')].forEach((el,i)=>{
    const slice=result.slices[i];if(!slice)return;
    sourceIds.get(el.closest('[data-page]'))?.add(slice.origin.documentId);
    const bind=(node,range)=>{if(!range)return;node.tabIndex=0;node.style.cursor='pointer';
      const focus=()=>onNavigate(slice.origin.documentId,range);
      node.addEventListener('click',e=>{e.stopPropagation();focus();});node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();focus();}});
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
  });
  return pageNodes.map((node,index)=>({number:index+1,documents:[...sourceIds.get(node)],blocks:node.querySelectorAll('[data-block]').length,thumbnail:paperThumbnail(node)}));
}
