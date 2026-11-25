// All geometry is integer micrometres in the same Canvas inner coordinate space.
const modes=['left','center','right','top','middle','bottom','distribute-x','distribute-y'];
export function alignCanvasRects(rects,mode,bounds){
  if(!modes.includes(mode)||!Array.isArray(rects)||rects.length<2||rects.length>8||
    ![bounds.width,bounds.height].every(n=>Number.isSafeInteger(n)&&n>0))throw RangeError('Invalid alignment request');
  const ids=new Set();
  for(const r of rects){
    if(typeof r.id!=='string'||ids.has(r.id)||![r.x,r.y,r.width,r.height].every(Number.isSafeInteger)||
      r.x<0||r.y<0||r.width<=0||r.height<=0||r.x+r.width>bounds.width||r.y+r.height>bounds.height)throw RangeError('Invalid measured alignment rectangle');
    ids.add(r.id);
  }
  const horizontal=['left','center','right','distribute-x'].includes(mode),axis=horizontal?'x':'y',size=horizontal?'width':'height';
  if(mode.startsWith('distribute-')){
    if(rects.length<3)throw RangeError('Distribution requires at least three selected children');
    // Stable ordering by leading edge, then ID; keep the first leading and last trailing edge.
    const sorted=[...rects].sort((a,b)=>a[axis]-b[axis]||(a.id<b.id?-1:a.id>b.id?1:0));
    const start=sorted[0][axis],end=sorted.at(-1)[axis]+sorted.at(-1)[size];
    const free=end-start-sorted.reduce((sum,r)=>sum+r[size],0);
    if(free<0)throw RangeError('選択範囲が狭いため、重ならない均等配置ができません');
    const positions=new Map();let used=0;
    sorted.forEach((r,i)=>{
      const pos=start+used+Math.round(free*i/(sorted.length-1));
      if(pos>100000||pos+r[size]>bounds[size])throw RangeError('Distributed position exceeds Canvas limits');
      positions.set(r.id,pos);used+=r[size];
    });
    return rects.map(r=>({id:r.id,x:horizontal?positions.get(r.id):r.x,y:horizontal?r.y:positions.get(r.id)}));
  }
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
