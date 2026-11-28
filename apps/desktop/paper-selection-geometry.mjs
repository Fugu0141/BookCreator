export function clipPaperRect(rect,viewport){
  const left=Math.max(rect.left,viewport.left),top=Math.max(rect.top,viewport.top);
  const right=Math.min(rect.right,viewport.right),bottom=Math.min(rect.bottom,viewport.bottom);
  if(![left,top,right,bottom].every(Number.isFinite)||right<=left||bottom<=top)return null;
  return {left,top,width:right-left,height:bottom-top};
}


// Anchor a measured floating panel beside the selection when possible.
// Fall back to the opposite edge rather than extending outside the viewport.
export function placePaperPropertyPanel(selection,bounds,size,margin=8){
  const width=Math.min(size.width,Math.max(0,bounds.right-bounds.left-2*margin));
  const height=Math.min(size.height,Math.max(0,bounds.bottom-bounds.top-2*margin));
  const clamp=(value,min,max)=>Math.max(min,Math.min(value,max));
  const left=clamp(selection.left,bounds.left+margin,bounds.right-width-margin);
  const below=selection.top+selection.height+margin,above=selection.top-height-margin;
  const bottomLimit=bounds.bottom-height-margin,topLimit=bounds.top+margin;
  const top=below<=bottomLimit?below:above>=topLimit?above:clamp(below,topLimit,bottomLimit);
  return {left,top,width,maxHeight:Math.max(0,bounds.bottom-bounds.top-2*margin)};
}
