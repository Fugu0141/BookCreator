// Session-only frame ratio lock; dimensions are integer micrometres.
// Choose a dominant axis for pointer resizing, preserving current frame ratio to rounding precision.
export function proportionalImageSize(start,requested,limits,axis='width'){
  const {width:w,height:h}=start;
  if(![w,h,requested,limits.minWidth,limits.maxWidth,limits.minHeight,limits.maxHeight].every(Number.isFinite)||w<=0||h<=0||!['width','height'].includes(axis))throw RangeError('Invalid proportional image size');
  const min=Math.max(limits.minWidth/w,limits.minHeight/h),max=Math.min(limits.maxWidth/w,limits.maxHeight/h);
  if(min>max)throw RangeError('Proportional image size cannot fit');
  const scale=Math.max(min,Math.min(max,requested/(axis==='width'?w:h)));
  return {width:Math.max(limits.minWidth,Math.min(limits.maxWidth,Math.round(w*scale))),height:Math.max(limits.minHeight,Math.min(limits.maxHeight,Math.round(h*scale)))};
}
export const emptyCrop=()=>({left:0,top:0,right:0,bottom:0});
export function updateCrop(crop,edge,percent){
  const next={...(crop??emptyCrop())},opposite={left:'right',right:'left',top:'bottom',bottom:'top'}[edge];
  if(!opposite||!Number.isFinite(percent))throw RangeError('Invalid crop inset');
  next[edge]=Math.max(0,Math.min(9900-next[opposite],Math.round(percent*100)));
  return next;
}
