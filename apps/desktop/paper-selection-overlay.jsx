import React,{useLayoutEffect,useRef} from 'react';
import {clipPaperRect} from './paper-selection-geometry.mjs';

// The frame is a sibling of the measured viewport, never part of its DOM.
// It cannot enter sparse-page snapshots or the printable page tree.
export function PaperSelectionOverlay({viewport,node}){
  const frame=useRef(null);
  useLayoutEffect(()=>{
    const el=frame.current,v=viewport.current;
    if(!el||!v||!node)return;
    const update=()=>{
      const host=v.firstElementChild;
      if(!host||host.inert||!node.isConnected||node.getRootNode()!==host.shadowRoot||!v.getClientRects().length){el.hidden=true;return;}
      const r=v.getBoundingClientRect(),sx=r.width/v.offsetWidth,sy=r.height/v.offsetHeight;
      const left=r.left+v.clientLeft*sx,top=r.top+v.clientTop*sy;
      const clipped=clipPaperRect(node.getBoundingClientRect(),{left,top,right:left+v.clientWidth*sx,bottom:top+v.clientHeight*sy});
      el.hidden=!clipped;
      if(clipped)Object.assign(el.style,{left:clipped.left+'px',top:clipped.top+'px',width:clipped.width+'px',height:clipped.height+'px'});
    };
    const observer=new ResizeObserver(update);
    observer.observe(v);observer.observe(node);
    window.addEventListener('scroll',update,true);window.addEventListener('resize',update);
    update();
    return ()=>{observer.disconnect();window.removeEventListener('scroll',update,true);window.removeEventListener('resize',update);el.hidden=true;};
  },[viewport,node]);
  return <div ref={frame} id="paper-selection-frame" className="paper-selection-frame" aria-hidden="true" hidden/>;
}
