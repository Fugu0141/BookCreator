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


// Preserve the pointer's initial offset; CSS zoom is represented by body pixels.
// Reject, rather than clamp, a destination outside the measured footprint bounds.
export function paperPositionFromDrag(position,bounds,body,delta){
  if(!position||!bounds||!body||!delta||![position.page,position.x,position.y,bounds.maxX,bounds.maxY,body.width,body.height].every(Number.isSafeInteger)||![body.pixelWidth,body.pixelHeight,delta.x,delta.y].every(Number.isFinite)||body.width<=0||body.height<=0||body.pixelWidth<=0||body.pixelHeight<=0)return null;
  const x=position.x+Math.round(delta.x/body.pixelWidth*body.width),y=position.y+Math.round(delta.y/body.pixelHeight*body.height);
  if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y)||x<0||y<0||x>bounds.maxX||y>bounds.maxY)return null;
  return {page:position.page,x,y};
}


// Convert a pointer in a target page's body to its local physical origin.
// Preserve the grab offset in µm across different page origins and zoom.
export function paperPositionFromPagePointer(page,body,pointer,grab,bounds){
  if(!page||!body||!pointer||!grab||!bounds||![page.page,body.width,body.height,bounds.maxX,bounds.maxY].every(Number.isSafeInteger)||page.page<0||body.width<=0||body.height<=0||bounds.maxX<0||bounds.maxY<0||![page.left,page.top,page.width,page.height,pointer.x,pointer.y,grab.x,grab.y].every(Number.isFinite)||page.width<=0||page.height<=0)return null;
  if(pointer.x<page.left||pointer.y<page.top||pointer.x>=page.left+page.width||pointer.y>=page.top+page.height)return null;
  const x=Math.round((pointer.x-page.left)/page.width*body.width-grab.x),y=Math.round((pointer.y-page.top)/page.height*body.height-grab.y);
  if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y)||x<0||y<0||x>bounds.maxX||y>bounds.maxY)return null;
  return {page:page.page,x,y};
}
