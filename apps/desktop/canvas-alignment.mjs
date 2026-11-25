// All geometry is integer micrometres in the same Canvas inner coordinate space.
const modes=['left','center','right','top','middle','bottom'];
export function alignCanvasRects(rects,mode,bounds){
  if(!modes.includes(mode)||!Array.isArray(rects)||rects.length<2||rects.length>8||
    ![bounds.width,bounds.height].every(n=>Number.isSafeInteger(n)&&n>0))throw RangeError('Invalid alignment request');
  const ids=new Set();
  for(const r of rects){
    if(typeof r.id!=='string'||ids.has(r.id)||![r.x,r.y,r.width,r.height].every(Number.isSafeInteger)||
      r.x<0||r.y<0||r.width<=0||r.height<=0||r.x+r.width>bounds.width||r.y+r.height>bounds.height)throw RangeError('Invalid measured alignment rectangle');
    ids.add(r.id);
  }
  const horizontal=['left','center','right'].includes(mode),axis=horizontal?'x':'y',size=horizontal?'width':'height';
  const first=Math.min(...rects.map(r=>r[axis])),last=Math.max(...rects.map(r=>r[axis]+r[size]));
  return rects.map(r=>{
    const pos=mode==='left'||mode==='top'?first:mode==='right'||mode==='bottom'?last-r[size]:Math.round((first+last-r[size])/2);
    if(pos<0||pos>100000||pos+r[size]>bounds[size])throw RangeError('Aligned position exceeds Canvas limits');
    return {id:r.id,x:horizontal?pos:r.x,y:horizontal?r.y:pos};
  });
}

// Read the Engine's measured CSS geometry only; never estimate text height.
export function measuredAlignment(root,parent,ids){
  const canvas=Array.from(root.querySelectorAll('[data-component-canvas]')).find(el=>el.dataset.componentNode===parent.id);
  if(!canvas)throw Error('Canvas not measured');
  const um=value=>Math.round(parseFloat(value)*25400/96);
  const bounds={width:um(canvas.style.width)-2*parent.padding,height:um(canvas.style.height)-2*parent.padding};
  const rects=ids.map(id=>{
    const node=parent.children.find(n=>n.id===id);
    const el=Array.from(canvas.children).find(e=>e.dataset.componentNode===id);
    if(!node||!el)throw Error('Selected Canvas child not measured');
    return {id,x:node.x,y:node.y,width:node.width,height:um(el.style.height)};
  });
  return {rects,bounds};
}
