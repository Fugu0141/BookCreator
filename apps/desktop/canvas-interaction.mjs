import {snapCanvasPosition,installSnapGuides} from './canvas-snap.mjs';
const UM_PER_CSS_PX=25400/96;
const clamp=(v,max)=>Math.max(0,Math.min(max,v));
// Coordinates are micrometres. Use measured bounding boxes, not a guessed text height.
// Bounds rounded down; tiny browser subpixel rounding must not push an existing valid node out.
export function dragPosition(start,delta,bounds,snap=100){
  if(![start.x,start.y,delta.x,delta.y,bounds.x,bounds.y,snap].every(Number.isFinite)||bounds.x<0||bounds.y<0||snap<=0)throw RangeError('Invalid canvas drag geometry');
  const axis=(v,d,b)=>clamp(Math.round((v+d)/snap)*snap,Math.floor(b));
  return {x:axis(start.x,delta.x,bounds.x),y:axis(start.y,delta.y,bounds.y)};
}
// Keyboard steps preserve the untouched axis and never round an existing off-grid position.
export function nudgePosition(start,key,bounds,large=false){
  if(![start.x,start.y,bounds.x,bounds.y].every(Number.isFinite)||bounds.x<0||bounds.y<0)throw RangeError('Invalid canvas nudge geometry');
  const step=large?1000:100;
  switch(key){
    case 'ArrowLeft':return {...start,x:clamp(start.x-step,Math.floor(bounds.x))};
    case 'ArrowRight':return {...start,x:clamp(start.x+step,Math.floor(bounds.x))};
    case 'ArrowUp':return {...start,y:clamp(start.y-step,Math.floor(bounds.y))};
    case 'ArrowDown':return {...start,y:clamp(start.y+step,Math.floor(bounds.y))};
    default:return null;
  }
}
// Width is always explicit in a Canvas; only rectangles and Canvas groups have fixed height.
// Text and flow groups must be remeasured, not scaled.
export function resizeSize(start,delta,limits,snap=100){
  const axis=(value,d,min,max)=>{
    if(![value,d,min,max,snap].every(Number.isFinite)||snap<=0||min<=0||max<min)throw RangeError('Invalid canvas resize geometry');
    if(d===0)return value;
    return Math.max(min,Math.min(Math.floor(max),Math.round((value+d)/snap)*snap));
  };
  const result={width:axis(start.width,delta.x,limits.minWidth,limits.maxWidth)};
  if(start.height!==undefined)result.height=axis(start.height,delta.y,limits.minHeight,limits.maxHeight);
  return result;
}
// The same actual measured preview DOM is used for hit testing, not a second renderer.
export function installCanvasDrag(root,{lookup,onSelect,onActive,onCommit,smartSnap=()=>true}){
  const cleanups=[];let active=null,disposed=false;
  const restore=()=>{if(active){active.el.style.left=active.left;active.el.style.top=active.top;active.el.removeAttribute('data-lab-dragging');if(active.ghost){active.ghost.style.display='none';}active.guides?.show({});}};
  function end(commit,event){
    const a=active;if(!a||event&&event.pointerId!==a.pointerId)return;
    restore();active=null;
    try{if(a.el.hasPointerCapture(a.pointerId))a.el.releasePointerCapture(a.pointerId);}catch{}
    onActive(false);
    if(commit&&a.position&&Object.keys(a.position).some(k=>a.position[k]!==a.start[k]))onCommit(a.id,a.position);
  }
  for(const canvas of root.querySelectorAll('[data-component-canvas]')){
    const direct=Array.from(canvas.children).filter(el=>el.dataset.componentNode);
    const parent=lookup(direct[0]?.dataset.componentNode)?.parent;
    if(!parent||parent.direction!=='canvas')continue;
    const guides=installSnapGuides(canvas,parent.padding);cleanups.push(()=>guides.dispose());
    for(const el of direct){
      const id=el.dataset.componentNode;if(!id)continue;
      const entry=lookup(id);if(!entry||entry.parent?.direction!=='canvas')continue;
      el.dataset.labDraggable='true';el.style.cursor='grab';el.style.touchAction='none';el.style.userSelect='none';
      // These editor-only children never enter the book preview or the saved definition.
      const fixedHeight=entry.node.type==='rect'||(entry.node.type==='group'&&entry.node.direction==='canvas');
      const handle=el.ownerDocument.createElement('span');
      handle.dataset.labResizeHandle=fixedHeight?'both':'width';
      handle.setAttribute('aria-hidden','true');
      handle.title=fixedHeight?'幅と高さを変更':'幅を変更（高さは自動）';
      handle.style.cssText='all:initial;position:absolute;display:none;box-sizing:border-box;z-index:2147483647;right:0;width:10px;height:10px;background:#fff;border:2px solid #2679c7;touch-action:none;'+(fixedHeight?'bottom:0;cursor:nwse-resize;':'top:50%;transform:translateY(-50%);cursor:ew-resize;');
      const ghost=el.ownerDocument.createElement('span');
      ghost.setAttribute('aria-hidden','true');
      ghost.style.cssText='all:initial;position:absolute;display:none;box-sizing:border-box;left:0;top:0;border:2px dashed #2679c7;pointer-events:none;z-index:2147483646;';
      el.append(ghost,handle);
      cleanups.push(()=>{ghost.remove();handle.remove();});
      el.removeAttribute('aria-hidden');
      el.tabIndex=0;
      el.setAttribute('aria-label',id+'：矢印キーで移動、Shiftで1mm');
      const start={x:entry.node.x,y:entry.node.y},pad=entry.parent.padding;
      const bounds=()=>({x:Math.max(start.x,Math.floor(parseFloat(canvas.style.width)*UM_PER_CSS_PX+.1)-2*pad-entry.node.width),y:Math.max(start.y,Math.floor((parseFloat(canvas.style.height)-parseFloat(el.style.height))*UM_PER_CSS_PX+.1)-2*pad)});
      const focus=()=>onSelect(id);
      const key=e=>{
        if(disposed)return;
        if(e.key==='Escape'&&active?.el===el){e.preventDefault();e.stopPropagation();end(false);return;}
        if(active||e.ctrlKey||e.metaKey||e.altKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
        const b=bounds();if(![b.x,b.y].every(Number.isFinite))return;
        e.preventDefault();e.stopPropagation();
        const next=nudgePosition(start,e.key,b,e.shiftKey);
        if(next&&(next.x!==start.x||next.y!==start.y))onCommit(id,next);
      };
      const down=e=>{
        if(disposed||active||e.button!==0||!e.isPrimary)return;
        e.preventDefault();e.stopPropagation();
        const c=canvas.getBoundingClientRect(),r=el.getBoundingClientRect();
        const sx=c.width/parseFloat(canvas.style.width),sy=c.height/parseFloat(canvas.style.height);
        if(!Number.isFinite(sx)||!Number.isFinite(sy)||sx<=0||sy<=0)return;
        const b=bounds();
        if(![r.width,r.height,b.x,b.y].every(Number.isFinite))return;
        const resizing=e.target===handle;
        const size={width:entry.node.width,...(fixedHeight?{height:entry.node.height}:{})};
        const innerW=Math.floor(parseFloat(canvas.style.width)*UM_PER_CSS_PX+.1)-2*pad-start.x;
        const innerH=Math.floor(parseFloat(canvas.style.height)*UM_PER_CSS_PX+.1)-2*pad-start.y;
        const minimum=entry.node.type==='group'?2*entry.node.padding+1:1;
        const limits={minWidth:Math.max(minimum,Math.min(100,size.width)),maxWidth:Math.min(100000,Math.max(size.width,innerW)),minHeight:Math.max(minimum,Math.min(100,size.height??100)),maxHeight:Math.min(100000,Math.max(size.height??0,innerH))};
        const um=v=>Math.round(parseFloat(v)*UM_PER_CSS_PX);
        const snapBounds={width:um(canvas.style.width)-2*pad,height:um(canvas.style.height)-2*pad};
        const measuredSize={width:entry.node.width,height:um(el.style.height)};
        const targets=direct.filter(n=>n!==el).map(n=>{const v=lookup(n.dataset.componentNode)?.node;return {id:n.dataset.componentNode,x:v?.x,y:v?.y,width:v?.width,height:um(n.style.height)};});
        active={guides,snapBounds,measuredSize,targets,id,el,pointerId:e.pointerId,cx:e.clientX,cy:e.clientY,sx,sy,start:resizing?size:start,bounds:b,left:el.style.left,top:el.style.top,position:null,resizing,limits,ghost};
        try{el.setPointerCapture(e.pointerId);}catch{active=null;return;}
        el.dataset.labDragging='true';el.focus({preventScroll:true});onSelect(id);onActive(true);
      };
      const move=e=>{
        const a=active;if(!a||a.el!==el||a.pointerId!==e.pointerId)return;
        e.preventDefault();e.stopPropagation();
        const delta={x:(e.clientX-a.cx)*UM_PER_CSS_PX/a.sx,y:(e.clientY-a.cy)*UM_PER_CSS_PX/a.sy};
        if(!a.position&&Math.hypot(e.clientX-a.cx,e.clientY-a.cy)<2)return;
        if(a.resizing){
          a.position=resizeSize(a.start,delta,a.limits);
          ghost.style.display='block';
          ghost.style.width=a.position.width/UM_PER_CSS_PX+'px';
          ghost.style.height=a.position.height===undefined?el.style.height:a.position.height/UM_PER_CSS_PX+'px';
          return;
        }
        a.position=dragPosition(a.start,delta,a.bounds);
        if(smartSnap()&&!e.altKey&&a.snapBounds.width>=a.measuredSize.width&&a.snapBounds.height>=a.measuredSize.height&&Object.values(a.measuredSize).every(n=>Number.isFinite(n)&&n>0)){
          const snapped=snapCanvasPosition(a.position,a.measuredSize,a.snapBounds,a.targets);
          a.position=snapped.position;a.guides.show(snapped.guides);
        }else a.guides.show({});
        el.style.left=(parseFloat(a.left)+(a.position.x-a.start.x)/UM_PER_CSS_PX)+'px';
        el.style.top=(parseFloat(a.top)+(a.position.y-a.start.y)/UM_PER_CSS_PX)+'px';
      };
      const up=e=>{if(active?.el===el&&active.pointerId===e.pointerId){move(e);end(true,e);}};
      const cancel=e=>{if(active?.el===el)end(false,e);};
      for(const [name,fn] of [['focus',focus],['keydown',key],['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['lostpointercapture',cancel]]){el.addEventListener(name,fn);cleanups.push(()=>el.removeEventListener(name,fn));}
    }
  }
  return ()=>{disposed=true;end(false);for(const cleanup of cleanups)cleanup();};
}
export function highlightCanvasSelection(root,id){
  const ids=Array.isArray(id)?id:[id];
  for(const el of root.querySelectorAll('[data-lab-draggable]')){
    const selected=ids.includes(el.dataset.componentNode);
    el.style.outline=selected?'2px solid #2679c7':'';
    el.style.outlineOffset=selected?'-1px':'';
    for(const child of el.children)if(child.dataset.labResizeHandle)child.style.display=selected&&ids.length===1?'block':'none';
  }
}

export function focusCanvasSelection(root,id){
  for(const el of root.querySelectorAll('[data-lab-draggable]'))if(el.dataset.componentNode===id){el.focus({preventScroll:true});return;}
}
