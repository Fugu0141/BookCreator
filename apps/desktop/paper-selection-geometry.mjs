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


// Selection is scoped to the current shadow root by the caller. Never pick
// an arbitrary matching DOM fragment if a persistent block is split.
export function resolvePaperSelectionNodes(nodes,documentId,blockKeys){
  if(typeof documentId!=='string'||!documentId||!Array.isArray(blockKeys)||!blockKeys.length||new Set(blockKeys).size!==blockKeys.length)return [];
  const wanted=new Set(blockKeys),matches=new Map(),duplicate=new Set();
  for(const node of nodes){
    const data=node?.dataset;
    if(data?.document!==documentId||!wanted.has(data.block))continue;
    if(matches.has(data.block))duplicate.add(data.block);
    else matches.set(data.block,node);
  }
  return blockKeys.flatMap((key,index)=>matches.has(key)&&!duplicate.has(key)?[{key,index,node:matches.get(key)}]:[]);
}


// Keep the user's actual preferred intent, not the fallback placement.
// When it cannot be edited under the current same-page/footprint contract,
// require explicit rebasing instead of silently substituting measured values.
export function preferredPositionEditStart(position,bounds,body,stored){
  const defaults={x:Math.min(5000,body.width),y:Math.min(5000,body.height)};
  if(!stored)return {position,tolerance:defaults,requiresRebase:false};
  const p=stored.position,t=stored.tolerance;
  const positionValid=p?.page===position.page&&Number.isSafeInteger(p.x)&&Number.isSafeInteger(p.y)&&p.x>=0&&p.y>=0&&p.x<=bounds.maxX&&p.y<=bounds.maxY;
  const toleranceValid=Number.isSafeInteger(t?.x)&&Number.isSafeInteger(t?.y)&&t.x>=0&&t.y>=0&&t.x<=body.width&&t.y<=body.height;
  return {position:positionValid?p:position,tolerance:t,requiresRebase:!positionValid||!toleranceValid};
}


// The position panel must not cover the actual drag handle when there is
// insufficient room above or below the selected block. Restrict its real
// maxHeight to the chosen free strip rather than the whole viewport.
export function placeBookPositionPanel(selection,handle,bounds,size,margin=8){
  const base=placePaperPropertyPanel(selection,bounds,size,margin);
  if(!handle)return base;
  const left=bounds.left+margin,right=bounds.right-margin,top=bounds.top+margin,bottom=bounds.bottom-margin;
  const width=Math.min(size.width,Math.max(0,right-left));
  const h={left:handle.left-margin,top:handle.top-margin,right:handle.left+handle.width+margin,bottom:handle.top+handle.height+margin};
  const clamp=(n,min,max)=>Math.max(min,Math.min(n,max));
  const x=clamp(selection.left,left,right-width);
  const strips=[
    {left:x,top:Math.max(top,selection.top+selection.height+margin,h.bottom),width,height:bottom-Math.max(top,selection.top+selection.height+margin,h.bottom)},
    {left:x,top:Math.max(top,Math.min(selection.top-margin,h.top)-size.height),width,height:Math.min(selection.top-margin,h.top)-top},
    {left:Math.max(left,h.right),top,width:Math.min(width,right-Math.max(left,h.right)),height:bottom-top},
    {left:Math.max(left,h.left-width),top,width:Math.min(width,h.left-left),height:bottom-top},
    {left:x,top:Math.max(top,h.bottom),width,height:bottom-Math.max(top,h.bottom)},
    {left:x,top,width,height:Math.min(bottom,h.top)-top}
  ].filter(v=>v.width>0&&v.height>0);
  const best=strips.find(v=>v.width>=width&&v.height>=size.height)??strips.reduce((a,v)=>!a||v.width*Math.min(v.height,size.height)>a.width*Math.min(a.height,size.height)?v:a,null);
  if(!best)return base;
  return {left:best.left,top:best.top,width:best.width,maxHeight:Math.min(best.height,Math.max(0,bottom-best.top),size.height)};
}


// Parse decimal millimetres into exact integer micrometres. A partial,
// negative, oversized or over-precise input is not silently rounded/clamped.
export function parsePaperMillimetres(value,max){
  if(typeof value!=='string'||!/^\d+(?:\.\d{1,3})?$/.test(value)||!Number.isSafeInteger(max)||max<0)return null;
  const [whole,fraction='']=value.split('.');
  const result=Number(whole)*1000+Number(fraction.padEnd(3,'0'));
  return Number.isSafeInteger(result)&&result>=0&&result<=max?result:null;
}

export function paperPositionFromCoordinates(position,bounds,values){
  if(!position||!bounds||!values||!Number.isSafeInteger(position.page)||position.page<0)return null;
  const x=parsePaperMillimetres(values.x,bounds.maxX),y=parsePaperMillimetres(values.y,bounds.maxY);
  return x===null||y===null?null:{page:position.page,x,y};
}
