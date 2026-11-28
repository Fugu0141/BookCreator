import React,{useLayoutEffect,useRef} from 'react';
import {clipPaperRect} from './paper-selection-geometry.mjs';

// Both frames are siblings of the measured viewport, never part of its DOM.
// They cannot enter sparse-page snapshots or the printable page tree.
export function PaperSelectionOverlay({viewport,node,enabled,getDrop,onMove}){
  const frame=useRef(null),guide=useRef(null),handle=useRef(null),gesture=useRef(null);
  const latest=useRef(null);latest.current={enabled,getDrop,onMove};
  const viewportRect=()=>{
    const v=viewport.current;
    if(!v||!v.offsetWidth||!v.offsetHeight||!v.getClientRects().length)return null;
    const r=v.getBoundingClientRect(),sx=r.width/v.offsetWidth,sy=r.height/v.offsetHeight;
    const left=r.left+v.clientLeft*sx,top=r.top+v.clientTop*sy;
    return {left,top,right:left+v.clientWidth*sx,bottom:top+v.clientHeight*sy};
  };
  const show=(el,target)=>{
    if(!el)return;
    const v=viewport.current,host=v?.firstElementChild,bounds=viewportRect();
    const clipped=host&&!host.inert&&target?.isConnected&&target.getRootNode()===host.shadowRoot&&bounds?clipPaperRect(target.getBoundingClientRect(),bounds):null;
    el.hidden=!clipped;
    if(clipped)Object.assign(el.style,{left:clipped.left+'px',top:clipped.top+'px',width:clipped.width+'px',height:clipped.height+'px'});
  };
  const cancel=()=>{
    const g=gesture.current;gesture.current=null;
    if(guide.current)guide.current.hidden=true;
    const h=handle.current;
    if(g&&h?.hasPointerCapture(g.id))h.releasePointerCapture(g.id);
  };
  const targetAt=e=>{
    const g=gesture.current;
    if(!g||e.pointerId!==g.id||!latest.current.enabled||Math.hypot(e.clientX-g.x,e.clientY-g.y)<6)return null;
    return latest.current.getDrop(e.clientX,e.clientY);
  };
  function finish(e){
    const g=gesture.current;
    if(!g||g.id!==e.pointerId)return;
    // End the capture before the final DOM hit test; Chromium can retarget
    // the release to the capture handle even when the pointer is on paper.
    const x=e.clientX,y=e.clientY,moved=Math.hypot(x-g.x,y-g.y)>=6;
    cancel();
    if(!moved||!latest.current.enabled)return;
    const hit=latest.current.getDrop(x,y);
    if(hit)latest.current.onMove(hit.target);
  }
  useLayoutEffect(()=>{
    const el=frame.current,v=viewport.current;
    if(!el||!v||!node)return;
    const update=()=>{cancel();show(el,node);};
    const escape=e=>{if(e.key==='Escape'&&gesture.current){e.preventDefault();e.stopPropagation();cancel();}};
    const observer=new ResizeObserver(update);
    observer.observe(v);observer.observe(node);
    window.addEventListener('scroll',update,true);window.addEventListener('resize',update);
    window.addEventListener('blur',cancel);window.addEventListener('keydown',escape,true);
    window.addEventListener('pointerup',finish,true);
    update();
    return ()=>{cancel();observer.disconnect();window.removeEventListener('scroll',update,true);window.removeEventListener('resize',update);window.removeEventListener('blur',cancel);window.removeEventListener('keydown',escape,true);window.removeEventListener('pointerup',finish,true);el.hidden=true;};
  },[viewport,node]);
  useLayoutEffect(()=>{if(!enabled)cancel();},[enabled]);
  return <>
    <div ref={frame} id="paper-selection-frame" className="paper-selection-frame" hidden>
      {enabled&&<button ref={handle} id="paper-block-drag" className="paper-block-drag" type="button" aria-label="ブロックをドラッグして移動（上下矢印キーでも操作）" title="移動先のブロックへドラッグ"
        onPointerDown={e=>{if(e.button!==0||!e.isPrimary||gesture.current)return;e.preventDefault();e.currentTarget.focus({preventScroll:true});try{e.currentTarget.setPointerCapture(e.pointerId);}catch{return;}gesture.current={id:e.pointerId,x:e.clientX,y:e.clientY};}}
        onPointerMove={e=>{if(gesture.current?.id!==e.pointerId)return;show(guide.current,targetAt(e)?.node);}}
        onPointerUp={finish}
        onPointerCancel={e=>{if(gesture.current?.id===e.pointerId)cancel();}}
        onLostPointerCapture={e=>{if(gesture.current?.id===e.pointerId)cancel();}}
        onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();latest.current.onMove(e.key==='ArrowUp'?'up':'down');}}}>↕</button>}
    </div>
    <div ref={guide} id="paper-drop-guide" className="paper-drop-guide" aria-hidden="true" hidden/>
  </>;
}
