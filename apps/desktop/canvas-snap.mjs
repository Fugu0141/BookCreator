// Smart snapping is computed in physical micrometres, independently per axis.
// Candidate target order is deterministic: canvas first, then sibling ID, then edge order.
export function snapCanvasPosition(position,size,bounds,targets,tolerance=800){
  if(![position.x,position.y,size.width,size.height,bounds.width,bounds.height,tolerance].every(Number.isFinite)||size.width<=0||size.height<=0||bounds.width<size.width||bounds.height<size.height||tolerance<0)throw RangeError('Invalid snap geometry');
  const guides={};
  const result={...position};
  for(const [axis,dim] of [['x','width'],['y','height']]){
    const max=Math.min(100000,Math.floor(bounds[dim]-size[dim]));
    const raw=Math.max(0,Math.min(max,position[axis]));
    result[axis]=raw;
    const candidates=[0,bounds[dim]/2,bounds[dim]];
    for(const t of [...targets].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)){
      if(![t[axis],t[dim]].every(Number.isFinite)||t[dim]<=0)continue;
      candidates.push(t[axis],t[axis]+t[dim]/2,t[axis]+t[dim]);
    }
    let best=null;
    for(const target of candidates)for(const offset of [0,size[dim]/2,size[dim]]){
      const p=Math.round(target-offset),distance=Math.abs(p-raw);
      if(p<0||p>max||distance>tolerance)continue;
      if(!best||distance<best.distance)best={p,distance,target};
    }
    if(best){result[axis]=best.p;guides[axis]=best.target;}
  }
  return {position:result,guides};
}

export function installSnapGuides(canvas,padding){
  const doc=canvas.ownerDocument,lines={};
  for(const axis of ['x','y']){
    const line=doc.createElement('span');
    line.dataset.labSnapGuide=axis;
    line.setAttribute('aria-hidden','true');
    line.style.cssText='all:initial;position:absolute;display:none;pointer-events:none;z-index:2147483647;box-sizing:border-box;'+(axis==='x'?'border-left:1px dashed #d946ef;':'border-top:1px dashed #d946ef;');
    canvas.append(line);lines[axis]=line;
  }
  const px=n=>n*96/25400+'px';
  return {
    show(guides){
      for(const axis of ['x','y']){
        const line=lines[axis],value=guides[axis];
        line.style.display=value===undefined?'none':'block';
        if(value===undefined)continue;
        if(axis==='x')Object.assign(line.style,{left:px(padding+value),top:px(padding),height:'calc(100% - '+px(2*padding)+')',width:'0px'});
        else Object.assign(line.style,{top:px(padding+value),left:px(padding),width:'calc(100% - '+px(2*padding)+')',height:'0px'});
      }
    },
    dispose(){for(const line of Object.values(lines))line.remove();}
  };
}
