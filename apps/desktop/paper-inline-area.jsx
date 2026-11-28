import React,{useLayoutEffect,useRef,useState} from 'react';
import {beginPaperAreaDrag,previewPaperAreaDrag,finishPaperAreaDrag} from './paper-area-intent.mjs';
import {clipPaperRect} from './paper-selection-geometry.mjs';

// Separate from the measured shadow tree, just like the reorder overlay.
// The preview is local to the gesture; a confirmed save is handled by App.
export function PaperInlineArea({viewport,node,context,onCommit}){
  const [geometry,setGeometry]=useState(null),[proposal,setProposal]=useState(null),[ghost,setGhost]=useState(null);
  const active=useRef(null),frame=useRef(null);
  const {target,placement}=context;
  const latest=useRef(null);latest.current={context,onCommit,geometry,proposal};
  function cancel(){
    const g=active.current;active.current=null;setGhost(null);
    if(g?.node.hasPointerCapture(g.id))g.node.releasePointerCapture(g.id);
  }
  useLayoutEffect(()=>{
    const v=viewport.current,block=node?.closest('[data-block]'),body=block?.closest('[data-page]')?.querySelector('[data-content-guide]');
    if(!v||!block||!body)return;
    const update=()=>{
      cancel();
      const host=v.firstElementChild;
      if(!host||host.inert||!block.isConnected||block.getRootNode()!==host.shadowRoot||!v.offsetWidth||!v.offsetHeight||!v.getClientRects().length){setGeometry(null);return;}
      const r=block.getBoundingClientRect(),b=body.getBoundingClientRect(),vr=v.getBoundingClientRect(),sx=vr.width/v.offsetWidth,sy=vr.height/v.offsetHeight;
      const left=vr.left+v.clientLeft*sx,top=vr.top+v.clientTop*sy;
      const bounds={left,top,right:left+v.clientWidth*sx,bottom:top+v.clientHeight*sy};
      const occupied=context.occupied;
      const width=occupied?occupied.width/context.width*b.width:r.width,height=occupied?occupied.height/context.height*b.height:r.height;
      const full={left:r.left,top:r.top,right:r.left+width,bottom:r.top+height,width,height};
      const clipped=clipPaperRect(full,bounds);
      if(!clipped||!b.width||!b.height){setGeometry(null);return;}
      setGeometry({full,clipped,bounds,bodyWidth:b.width,bodyHeight:b.height,contentWidth:r.width,contentHeight:r.height,
        rightVisible:Math.abs(clipped.right-full.right)<1,bottomVisible:Math.abs(clipped.bottom-full.bottom)<1});
    };
    const observer=new ResizeObserver(update);observer.observe(v);observer.observe(block);observer.observe(body);
    const escape=e=>{if(e.key==='Escape'){if(active.current){e.preventDefault();cancel();}else if(latest.current.proposal){e.preventDefault();setProposal(null);}}};
    window.addEventListener('scroll',update,true);window.addEventListener('resize',update);
    window.addEventListener('blur',cancel);window.addEventListener('keydown',escape,true);
    update();
    return ()=>{observer.disconnect();window.removeEventListener('scroll',update,true);window.removeEventListener('resize',update);window.removeEventListener('blur',cancel);window.removeEventListener('keydown',escape,true);};
  },[viewport,node,context.target.documentId,context.target.blockKey,context.target.revision,context.target.fingerprint]);
  function begin(e,axis){
    if(e.button!==0||!e.isPrimary||active.current||!geometry||!context.current()||context.disabled)return;
    const gesture=beginPaperAreaDrag({target,current:target,placement,axis,occupiedPx:axis==='width'?geometry.full.width:geometry.full.height,bodyPx:axis==='width'?geometry.bodyWidth:geometry.bodyHeight,originPx:axis==='width'?e.clientX:e.clientY});
    if(!gesture)return;
    e.preventDefault();e.currentTarget.focus({preventScroll:true});
    try{e.currentTarget.setPointerCapture(e.pointerId);}catch{return;}
    setProposal(null);active.current={id:e.pointerId,gesture,axis,node:e.currentTarget};
  }
  function move(e){
    const g=active.current;if(!g||g.id!==e.pointerId)return;
    const p=previewPaperAreaDrag(g.gesture,g.axis==='width'?e.clientX:e.clientY);
    if(p)setGhost({axis:g.axis,...p});
  }
  function finish(e){
    const g=active.current;if(!g||g.id!==e.pointerId)return;
    const p=previewPaperAreaDrag(g.gesture,g.axis==='width'?e.clientX:e.clientY);
    const next=context.current()?finishPaperAreaDrag(g.gesture,{current:target,placement,pointerPx:g.axis==='width'?e.clientX:e.clientY}):null;
    cancel();
    if(next&&p)setProposal({axis:g.axis,value:p.value,extentPx:p.extentPx});
  }
  function keyAdjust(e,axis){
    if(context.disabled||!context.current()||!geometry||e.ctrlKey||e.metaKey||e.altKey)return;
    const delta=axis==='width'?({ArrowLeft:-1,ArrowRight:1})[e.key]:({ArrowUp:-1,ArrowDown:1})[e.key];
    if(!delta)return;e.preventDefault();e.stopPropagation();
    const extent=axis==='width'?geometry.bodyWidth:geometry.bodyHeight,actual=axis==='width'?geometry.full.width:geometry.full.height;
    const start=proposal?.axis===axis?proposal.value:Math.round(actual/extent*100);
    const value=Math.max(1,Math.min(100,start+delta*(e.shiftKey?5:1)));
    setProposal({axis,value,extentPx:value*extent/100});
  }
  if(!geometry)return null;
  const {full,clipped,bounds}=geometry,preview=ghost??proposal;
  const width=preview?.axis==='width'?Math.max(geometry.contentWidth,preview.extentPx):full.width;
  const height=preview?.axis==='height'?Math.max(geometry.contentHeight,preview.extentPx):full.height;
  const guide=preview?clipPaperRect({left:full.left,top:full.top,right:full.left+width,bottom:full.top+height,width,height},bounds):null;
  const style=r=>({left:r.left,top:r.top,width:r.width,height:r.height});
  const stored=placement.sizeConstraints??{};
  return <>
    {guide&&<div className="paper-inline-area-guide" aria-hidden="true" style={style(guide)}/>}
    <div ref={frame} className="paper-inline-area-frame" style={style(clipped)}>
      {['width','height'].map(axis=>(axis==='width'?geometry.rightVisible:geometry.bottomVisible)&&<button key={axis} id={'paper-inline-area-'+axis} type="button" className={'paper-area-handle '+axis} aria-label={axis==='width'?'横の最小占有率を調整':'縦の最小占有率を調整'} disabled={context.disabled} onPointerDown={e=>begin(e,axis)} onPointerMove={move} onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={()=>{if(active.current)cancel();}} onKeyDown={e=>keyAdjust(e,axis)}/>)}
    </div>
    <div className="paper-inline-area-toolbar" style={{left:Math.max(bounds.left,Math.min(clipped.left,bounds.right-260)),top:Math.max(bounds.top,Math.min(clipped.bottom+10,bounds.bottom-62))}}>
      {preview?<strong>{preview.axis==='width'?'横':'縦'}：{preview.value}%</strong>:<small>横 {stored.minWidthPercent??'自動'} · 縦 {stored.minHeightPercent??'自動'}</small>}
      {proposal&&!ghost?<><button id="paper-inline-area-commit" type="button" disabled={context.disabled} onClick={()=>{const p=proposal;setProposal(null);void onCommit(p.axis,p.value);}}>適用して保存</button><button type="button" onClick={()=>setProposal(null)}>取消</button></>:!ghost&&<><button type="button" disabled={context.disabled||!stored.minWidthPercent} onClick={()=>setProposal({axis:'width',value:0,extentPx:geometry.contentWidth})}>横を自動</button><button type="button" disabled={context.disabled||!stored.minHeightPercent} onClick={()=>setProposal({axis:'height',value:0,extentPx:geometry.contentHeight})}>縦を自動</button></>}
    </div>
  </>;
}
