export function clipPaperRect(rect,viewport){
  const left=Math.max(rect.left,viewport.left),top=Math.max(rect.top,viewport.top);
  const right=Math.min(rect.right,viewport.right),bottom=Math.min(rect.bottom,viewport.bottom);
  if(![left,top,right,bottom].every(Number.isFinite)||right<=left||bottom<=top)return null;
  return {left,top,width:right-left,height:bottom-top};
}
