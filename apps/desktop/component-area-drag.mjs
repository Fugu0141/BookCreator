// Editor-only handles on the measured component root. No published DOM mutation.
export function areaPercentFromDrag(start,delta,extent,min=1){
  if(![start,delta,extent,min].every(Number.isFinite)||extent<=0)throw RangeError('Invalid area geometry');
  return Math.max(min,Math.min(100,Math.round(start+delta/extent*100)));
}
export function installComponentAreaDrag(root,{width,height,onCommit,onActive}){
  const el=root.querySelector('[data-component]:not([data-fragmentable-frame])');
  if(!el)return ()=>{};
  const um=25400/96,doc=el.ownerDocument,cleanups=[];
  let active=null,disposed=false;
  const frame=doc.createElement('span');
  frame.style.cssText='all:initial;position:absolute;inset:0;border:2px solid #3478b7;box-sizing:border-box;pointer-events:none;z-index:2147483645;';
  frame.dataset.labComponentAreaFrame='true';el.append(frame);
  const ghost=doc.createElement('span');ghost.style.cssText='all:initial;position:absolute;display:none;left:0;top:0;border:2px dashed #3478b7;box-sizing:border-box;pointer-events:none;z-index:2147483646;';
  el.append(ghost);
  const makeHandle=axis=>{
    const handle=doc.createElement('span');
    handle.dataset.labComponentAreaHandle=axis;
    handle.style.cssText='all:initial;display:block;position:absolute;box-sizing:border-box;background:white;border:2px solid #3478b7;border-radius:3px;z-index:2147483647;touch-action:none;'+(axis==='width'?'right:0;top:50%;width:10px;height:20px;transform:translateY(-50%);cursor:ew-resize;':'bottom:0;left:50%;height:10px;width:20px;transform:translateX(-50%);cursor:ns-resize;');
    const label=axis==='width'?'横の占有率':'縦の最小占有率';
    handle.title=label+'をドラッグで調整';handle.setAttribute('aria-label',label);handle.setAttribute('role','slider');handle.tabIndex=0;
    handle.setAttribute('aria-valuemin','1');handle.setAttribute('aria-valuemax','100');
    const extent=axis==='width'?width:height;
    const actual=()=>parseFloat(el.style[axis])*um;
    const start=()=>Math.max(1,Math.min(100,Math.round(actual()/extent*100)));
    handle.setAttribute('aria-valuenow',String(start()));
    const key=axis==='width'?'widthPercent':'minHeightPercent';
    function finish(commit){
      const a=active;if(!a||a.handle!==handle)return;
      active=null;ghost.style.display='none';try{if(handle.hasPointerCapture(a.id))handle.releasePointerCapture(a.id);}catch{}
      onActive(false);
      if(commit&&a.changed&&a.value!==a.start)onCommit({[key]:a.value});
    }
    const down=e=>{
      if(disposed||active||e.button!==0||!e.isPrimary)return;
      const r=el.getBoundingClientRect(),css=parseFloat(el.style[axis]),scale=(axis==='width'?r.width:r.height)/css;
      if(!Number.isFinite(scale)||scale<=0)return;
      e.preventDefault();e.stopPropagation();
      try{handle.setPointerCapture(e.pointerId);}catch{return;}
      active={handle,id:e.pointerId,origin:axis==='width'?e.clientX:e.clientY,extent:extent/um*scale,start:actual()/extent*100,value:start(),changed:false};
      ghost.style.width=el.style.width;ghost.style.height=el.style.height;ghost.style.display='block';onActive(true);
    };
    const move=e=>{
      const a=active;if(!a||a.handle!==handle||e.pointerId!==a.id)return;
      const delta=(axis==='width'?e.clientX:e.clientY)-a.origin;
      if(Math.abs(delta)<2&&!a.changed)return;
      a.changed=true;a.value=areaPercentFromDrag(a.start,delta,a.extent);ghost.style[axis]=a.value*extent/100/um+'px';handle.setAttribute('aria-valuenow',String(a.value));
    };
    const up=e=>{if(active?.id===e.pointerId)finish(true);};
    const cancel=e=>{if(active?.id===e.pointerId)finish(false);};
    const keyboard=e=>{
      if(e.key==='Escape'&&active?.handle===handle){e.preventDefault();e.stopPropagation();finish(false);return;}
      if(active||e.ctrlKey||e.metaKey||e.altKey)return;
      const delta=({ArrowLeft:-1,ArrowDown:-1,ArrowRight:1,ArrowUp:1})[e.key];
      if(!delta)return;
      e.preventDefault();e.stopPropagation();onCommit({[key]:Math.max(1,Math.min(100,start()+delta*(e.shiftKey?5:1)))});
    };
    for(const [name,fn] of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['lostpointercapture',cancel],['keydown',keyboard]])handle.addEventListener(name,fn);
    el.append(handle);cleanups.push(()=>{finish(false);handle.remove();});
  };
  makeHandle('width');makeHandle('height');
  return ()=>{disposed=true;for(const cleanup of cleanups)cleanup();frame.remove();ghost.remove();};
}
