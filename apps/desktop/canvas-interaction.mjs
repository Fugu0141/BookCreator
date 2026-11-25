const UM_PER_CSS_PX=25400/96;
const clamp=(v,max)=>Math.max(0,Math.min(max,v));
// Coordinates are micrometres. Use measured bounding boxes, not a guessed text height.
// Bounds rounded down; tiny browser subpixel rounding must not push an existing valid node out.
export function dragPosition(start,delta,bounds,snap=100){
  if(![start.x,start.y,delta.x,delta.y,bounds.x,bounds.y,snap].every(Number.isFinite)||bounds.x<0||bounds.y<0||snap<=0)throw RangeError('Invalid canvas drag geometry');
  const axis=(v,d,b)=>clamp(Math.round((v+d)/snap)*snap,Math.floor(b));
  return {x:axis(start.x,delta.x,bounds.x),y:axis(start.y,delta.y,bounds.y)};
}
// The same actual measured preview DOM is used for hit testing, not a second renderer.
export function installCanvasDrag(root,{lookup,onSelect,onActive,onCommit}){
  const cleanups=[];let active=null,disposed=false;
  const restore=()=>{if(active){active.el.style.left=active.left;active.el.style.top=active.top;active.el.removeAttribute('data-lab-dragging');}};
  function end(commit,event){
    const a=active;if(!a||event&&event.pointerId!==a.pointerId)return;
    restore();active=null;
    try{if(a.el.hasPointerCapture(a.pointerId))a.el.releasePointerCapture(a.pointerId);}catch{}
    onActive(false);
    if(commit&&a.position&&(a.position.x!==a.start.x||a.position.y!==a.start.y))onCommit(a.id,a.position);
  }
  for(const canvas of root.querySelectorAll('[data-component-canvas]')){
    for(const el of canvas.children){
      const id=el.dataset.componentNode;if(!id)continue;
      const entry=lookup(id);if(!entry||entry.parent?.direction!=='canvas')continue;
      el.dataset.labDraggable='true';el.style.cursor='grab';el.style.touchAction='none';el.style.userSelect='none';
      const down=e=>{
        if(disposed||active||e.button!==0||!e.isPrimary)return;
        e.preventDefault();e.stopPropagation();
        const c=canvas.getBoundingClientRect(),r=el.getBoundingClientRect();
        const sx=c.width/parseFloat(canvas.style.width),sy=c.height/parseFloat(canvas.style.height);
        if(!Number.isFinite(sx)||!Number.isFinite(sy)||sx<=0||sy<=0)return;
        const start={x:entry.node.x,y:entry.node.y},pad=entry.parent.padding;
        const bounds={x:Math.max(start.x,Math.floor(parseFloat(canvas.style.width)*UM_PER_CSS_PX+.1)-2*pad-entry.node.width),y:Math.max(start.y,Math.floor((parseFloat(canvas.style.height)-parseFloat(el.style.height))*UM_PER_CSS_PX+.1)-2*pad)};
        if(![r.width,r.height,bounds.x,bounds.y].every(Number.isFinite))return;
        active={id,el,pointerId:e.pointerId,cx:e.clientX,cy:e.clientY,sx,sy,start,bounds,left:el.style.left,top:el.style.top,position:null};
        try{el.setPointerCapture(e.pointerId);}catch{active=null;return;}
        el.dataset.labDragging='true';onSelect(id);onActive(true);
      };
      const move=e=>{
        const a=active;if(!a||a.el!==el||a.pointerId!==e.pointerId)return;
        e.preventDefault();e.stopPropagation();
        const delta={x:(e.clientX-a.cx)*UM_PER_CSS_PX/a.sx,y:(e.clientY-a.cy)*UM_PER_CSS_PX/a.sy};
        if(!a.position&&Math.hypot(e.clientX-a.cx,e.clientY-a.cy)<2)return;
        a.position=dragPosition(a.start,delta,a.bounds);
        el.style.left=(parseFloat(a.left)+(a.position.x-a.start.x)/UM_PER_CSS_PX)+'px';
        el.style.top=(parseFloat(a.top)+(a.position.y-a.start.y)/UM_PER_CSS_PX)+'px';
      };
      const up=e=>{if(active?.el===el&&active.pointerId===e.pointerId){e.stopPropagation();end(true,e);}};
      const cancel=e=>{if(active?.el===el)end(false,e);};
      for(const [name,fn] of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['lostpointercapture',cancel]]){el.addEventListener(name,fn);cleanups.push(()=>el.removeEventListener(name,fn));}
    }
  }
  return ()=>{disposed=true;end(false);for(const cleanup of cleanups)cleanup();};
}
export function highlightCanvasSelection(root,id){
  for(const el of root.querySelectorAll('[data-lab-draggable]')){
    const selected=el.dataset.componentNode===id;
    el.style.outline=selected?'2px solid #2679c7':'';
    el.style.outlineOffset=selected?'-1px':'';
  }
}
