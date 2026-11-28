import {proportionalImageSize} from './image-frame.mjs';
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
export function flowDropIndex(index,centers,coordinate){
  if(!Number.isInteger(index)||index<0||index>=centers.length||!Number.isFinite(coordinate)||
    !centers.every((v,i)=>Number.isFinite(v)&&(i===0||v>centers[i-1])))return index;
  // The dragged node's original centre is ignored. Move only after
  // crossing another sibling's centre; preserve the original order otherwise.
  let target=index;
  while(target>0&&coordinate<centers[target-1])target--;
  while(target<centers.length-1&&coordinate>centers[target+1])target++;
  return target;
}
// Flow dimensions stay explicit only where the schema already allows them.
export function flowResizeLimits(node,direction,availableWidth,availableHeight,otherWidth=0){
  const min=node.type==='group'?2*node.padding+1:1;
  const fixedWidth=node.type!=='content'&&Number.isSafeInteger(node.width);
  const fixedHeight=['rect','image'].includes(node.type)||(node.type==='group'&&node.direction==='canvas');
  if(!fixedWidth&&!fixedHeight)return null;
  if(![availableWidth,availableHeight,otherWidth,min].every(Number.isFinite))return null;
  const maxWidth=Math.min(100000,Math.max(fixedWidth?node.width:0,Math.floor(availableWidth-(direction==='row'?otherWidth:0))));
  const maxHeight=Math.min(100000,Math.max(fixedHeight?node.height:0,Math.floor(availableHeight)));
  if(fixedWidth&&maxWidth<min||fixedHeight&&maxHeight<min)return null;
  return {fixedWidth,fixedHeight,minWidth:min,maxWidth,minHeight:min,maxHeight};
}
export function installCanvasDrag(root,{lookup,onSelect,onActive,onCommit,onReorder=()=>{},onFlowResize=()=>{},flowDirection=entry=>entry.parent?.direction,flowContainer=entry=>entry.parent,smartSnap=()=>true,isLocked=()=>false,ratioLocked=()=>false}){
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
      const fixedHeight=entry.node.type==='rect'||entry.node.type==='image'||(entry.node.type==='group'&&entry.node.direction==='canvas');
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
        if(isLocked(id)){e.preventDefault();e.stopPropagation();return;}
        const b=bounds();if(![b.x,b.y].every(Number.isFinite))return;
        e.preventDefault();e.stopPropagation();
        const next=nudgePosition(start,e.key,b,e.shiftKey);
        if(next&&(next.x!==start.x||next.y!==start.y))onCommit(id,next);
      };
      const down=e=>{
        if(disposed||active||e.button!==0||!e.isPrimary)return;
        e.preventDefault();e.stopPropagation();
        if(isLocked(id)){el.focus({preventScroll:true});onSelect(id);return;}
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
          if(entry.node.type==='image'&&ratioLocked(id)){
            const axis=Math.abs(delta.x/a.start.width)>=Math.abs(delta.y/a.start.height)?'width':'height';
            const d=axis==='width'?delta.x:delta.y;
            const requested=Math.round((a.start[axis]+d)/100)*100;
            a.position=proportionalImageSize(a.start,requested,a.limits,axis);
          }else a.position=resizeSize(a.start,delta,a.limits);
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
  // Flow nodes retain automatic sizing. Move only within the same sibling
  // list, using the real measured centres and a transient visual indicator.
  let flowActive=null;
  function finishFlow(commit,event){
    const a=flowActive;if(!a||event&&a.pointerId!==event.pointerId)return;
    flowActive=null;
    a.el.style.transform=a.transform;a.el.style.zIndex=a.zIndex;
    a.mark?.remove();
    try{if(a.el.hasPointerCapture(a.pointerId))a.el.releasePointerCapture(a.pointerId);}catch{}
    onActive(false);
    if(a.ghost)a.ghost.remove();
    if(commit&&!isLocked(a.id)){
      if(a.resizing&&a.patch&&Object.entries(a.patch).some(([k,v])=>a.node[k]!==v))onFlowResize(a.id,a.patch);
      else if(!a.resizing&&a.target!==a.index)onReorder(a.id,a.target);
    }
  }
  for(const el of root.querySelectorAll('[data-component-node]')){
    const id=el.dataset.componentNode,entry=lookup(id);
    if(!id||!entry||el.hasAttribute('data-lab-draggable'))continue;
    el.dataset.labSelectable='true';
    el.tabIndex=0;
    el.removeAttribute('aria-hidden');
    const direction=flowDirection(entry),horizontal=direction==='row';
    const movable=['row','column'].includes(direction)&&entry.siblings.length>1;
    if(movable)el.dataset.labFlowDraggable='true';
    el.setAttribute('aria-label',id+(movable?'：ドラッグまたは矢印キーで並べ替え':'：選択'));
    el.style.cursor=movable?'grab':'pointer';
    el.style.touchAction='none';
    const node=entry.node,container=flowContainer(entry);
    const canWidth=node.type!=='content'&&Number.isSafeInteger(node.width),canHeight=['rect','image'].includes(node.type)||(node.type==='group'&&node.direction==='canvas');
    let handle;
    if((canWidth||canHeight)&&container&&['row','column'].includes(direction)){
      handle=el.ownerDocument.createElement('span');
      handle.dataset.labResizeHandle=canWidth&&canHeight?'both':canWidth?'width':'height';
      handle.setAttribute('aria-hidden','true');handle.title='ドラッグでサイズを変更';
      handle.style.cssText='all:initial;position:absolute;display:none;box-sizing:border-box;z-index:2147483647;width:12px;height:12px;background:white;border:2px solid #2679c7;touch-action:none;'+(canWidth&&canHeight?'right:0;bottom:0;cursor:nwse-resize;':canWidth?'right:0;top:50%;cursor:ew-resize;':'left:50%;bottom:0;cursor:ns-resize;');
      el.append(handle);cleanups.push(()=>handle.remove());
    }
    const select=()=>{if(!disposed)onSelect(id);};
    const down=e=>{
      if(disposed||active||flowActive||e.button!==0||!e.isPrimary)return;
      e.preventDefault();e.stopPropagation();
      el.focus({preventScroll:true});select();
      if(isLocked(id))return;
      if(handle&&e.target===handle){
        const parent=el.parentElement,r=parent.getBoundingClientRect(),sx=r.width/parent.offsetWidth,sy=r.height/parent.offsetHeight;
        if(!Number.isFinite(sx)||!Number.isFinite(sy)||sx<=0||sy<=0)return;
        const um=v=>Math.round(parseFloat(v)*UM_PER_CSS_PX);
        const availableWidth=um(parent.style.width)-2*container.padding;
        const otherWidth=entry.siblings.filter(n=>n.id!==id).reduce((sum,n)=>sum+(Number.isSafeInteger(n.width)?n.width:1000),0)+(entry.siblings.length-1)*container.gap;
        const limits=flowResizeLimits(node,direction,availableWidth,100000,otherWidth);
        if(!limits)return;
        try{el.setPointerCapture(e.pointerId);}catch{return;}
        const ghost=el.ownerDocument.createElement('span');
        ghost.style.cssText='all:initial;position:absolute;display:block;box-sizing:border-box;left:0;top:0;border:2px dashed #2679c7;pointer-events:none;z-index:2147483646;width:'+el.style.width+';height:'+el.style.height+';';
        el.append(ghost);
        flowActive={resizing:true,el,id,node,limits,ghost,pointerId:e.pointerId,cx:e.clientX,cy:e.clientY,sx,sy,transform:el.style.transform,zIndex:el.style.zIndex};
        onActive(true);return;
      }
      if(!movable)return;
      const siblings=entry.siblings.map(n=>Array.from(el.parentElement.children).find(c=>c.dataset.componentNode===n.id));
      if(siblings.some(n=>!n))return; // omitted optional content: do not infer its position
      const rects=siblings.map(n=>n.getBoundingClientRect());
      const centers=rects.map(r=>horizontal?r.left+r.width/2:r.top+r.height/2);
      if(!centers.every((v,i)=>Number.isFinite(v)&&(i===0||v>centers[i-1])))return;
      const parent=el.parentElement,r=parent.getBoundingClientRect();
      const sx=r.width/parent.offsetWidth,sy=r.height/parent.offsetHeight;
      if(!Number.isFinite(sx)||!Number.isFinite(sy)||sx<=0||sy<=0)return;
      try{el.setPointerCapture(e.pointerId);}catch{return;}
      const mark=el.ownerDocument.createElement('span');
      mark.style.cssText='all:initial;position:absolute;display:none;pointer-events:none;background:#2679c7;z-index:2147483646;';
      parent.append(mark);
      flowActive={el,id,index:entry.index,target:entry.index,pointerId:e.pointerId,coordinate:horizontal?e.clientX:e.clientY,centers,siblings,horizontal,sx,sy,transform:el.style.transform,zIndex:el.style.zIndex,mark};
      onActive(true);
    };
    const move=e=>{
      const a=flowActive;if(!a||a.el!==el||a.pointerId!==e.pointerId)return;
      e.preventDefault();e.stopPropagation();
      if(a.resizing){
        const dx=(e.clientX-a.cx)*UM_PER_CSS_PX/a.sx,dy=(e.clientY-a.cy)*UM_PER_CSS_PX/a.sy;
        if(Math.hypot(e.clientX-a.cx,e.clientY-a.cy)<2&&!a.patch)return;
        const axis=(value,delta,min,max)=>delta===0?value:Math.max(min,Math.min(max,Math.round((value+delta)/100)*100));
        if(node.type==='image'&&a.limits.fixedWidth&&a.limits.fixedHeight&&ratioLocked(id)){
          const key=Math.abs(dx/node.width)>=Math.abs(dy/node.height)?'width':'height';
          a.patch=proportionalImageSize(node,Math.round((node[key]+(key==='width'?dx:dy))/100)*100,a.limits,key);
        }else{
          a.patch={...(a.limits.fixedWidth?{width:axis(node.width,dx,a.limits.minWidth,a.limits.maxWidth)}:{}),...(a.limits.fixedHeight?{height:axis(node.height,dy,a.limits.minHeight,a.limits.maxHeight)}:{})};
        }
        if(a.patch.width!==undefined)a.ghost.style.width=a.patch.width/UM_PER_CSS_PX+'px';
        if(a.patch.height!==undefined)a.ghost.style.height=a.patch.height/UM_PER_CSS_PX+'px';
        return;
      }
      const delta=(horizontal?e.clientX:e.clientY)-a.coordinate;
      if(Math.abs(delta)<2&&a.target===a.index)return;
      a.target=flowDropIndex(a.index,a.centers,a.centers[a.index]+delta);
      el.style.transform=(a.transform?a.transform+' ':'')+(horizontal?'translateX(':'translateY(')+(delta/(horizontal?a.sx:a.sy))+'px)';
      el.style.zIndex='2147483645';
      if(a.target===a.index){a.mark.style.display='none';return;}
      const other=a.siblings[a.target],after=a.target>a.index;
      Object.assign(a.mark.style,horizontal?{display:'block',left:(other.offsetLeft+(after?other.offsetWidth:0)-1)+'px',top:other.offsetTop+'px',width:'2px',height:other.offsetHeight+'px'}:{display:'block',left:other.offsetLeft+'px',top:(other.offsetTop+(after?other.offsetHeight:0)-1)+'px',width:other.offsetWidth+'px',height:'2px'});
    };
    const up=e=>{if(flowActive?.el===el&&flowActive.pointerId===e.pointerId){move(e);finishFlow(true,e);}};
    const cancel=e=>{if(flowActive?.el===el)finishFlow(false,e);};
    const key=e=>{
      if(disposed||e.ctrlKey||e.metaKey||e.altKey)return;
      if(e.key==='Escape'&&flowActive?.el===el){e.preventDefault();e.stopPropagation();finishFlow(false);return;}
      if(['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();select();return;}
      const delta=e.key===(horizontal?'ArrowLeft':'ArrowUp')?-1:e.key===(horizontal?'ArrowRight':'ArrowDown')?1:0;
      if(!movable||!delta||flowActive||isLocked(id))return;
      e.preventDefault();e.stopPropagation();
      const next=entry.index+delta;
      if(next>=0&&next<entry.siblings.length)onReorder(id,next);
    };
    for(const [name,fn] of [['pointerdown',down],['focus',select],['keydown',key],['pointermove',move],['pointerup',up],['pointercancel',cancel],['lostpointercapture',cancel]]){
      el.addEventListener(name,fn);cleanups.push(()=>el.removeEventListener(name,fn));
    }
  }
  return ()=>{disposed=true;end(false);finishFlow(false);for(const cleanup of cleanups)cleanup();};
}
export function highlightCanvasSelection(root,id,isLocked=()=>false){
  const ids=Array.isArray(id)?id:[id];
  for(const el of root.querySelectorAll('[data-lab-draggable],[data-lab-selectable]')){
    const selected=ids.includes(el.dataset.componentNode);
    const locked=isLocked(el.dataset.componentNode);
    el.dataset.labLocked=String(locked);el.style.cursor=locked?'not-allowed':(el.hasAttribute('data-lab-draggable')||el.hasAttribute('data-lab-flow-draggable'))?'grab':'pointer';
    el.style.outline=selected?(locked?'2px dashed #64748b':'2px solid #2679c7'):'';
    el.style.outlineOffset=selected?'-1px':'';
    for(const child of el.children)if(child.dataset.labResizeHandle)child.style.display=selected&&!locked&&ids.length===1?'block':'none';
  }
}

export function focusCanvasSelection(root,id){
  for(const el of root.querySelectorAll('[data-lab-draggable],[data-lab-selectable]'))if(el.dataset.componentNode===id){el.focus({preventScroll:true});return;}
}
