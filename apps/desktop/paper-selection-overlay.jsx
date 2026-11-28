import React,{useLayoutEffect,useRef,useState} from 'react';
import {clipPaperRect,placePaperPropertyPanel,paperPositionFromDrag,paperPositionFromPagePointer} from './paper-selection-geometry.mjs';

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


// Explicit move mode: overlays never enter the measured/printable tree.
export function BookPositionOverlay({viewport,node,context,bounds,onCommit,onClose,preferredMode=false}){
  const [geometry,setGeometry]=useState(null),[proposal,setProposal]=useState(null),[ghost,setGhost]=useState(null),[invalid,setInvalid]=useState(false);
  const [tx,setTx]=useState('5'),[ty,setTy]=useState('5');
  const gesture=useRef(null),latest=useRef(null);latest.current={context,proposal,onClose};
  const cancel=()=>{const g=gesture.current;gesture.current=null;setGhost(null);setInvalid(false);if(g?.node.hasPointerCapture(g.id))g.node.releasePointerCapture(g.id);};
  useLayoutEffect(()=>{
    const v=viewport.current,body=node?.closest('[data-page]')?.querySelector('[data-content-guide]');
    if(!v||!body||!node)return;
    const update=()=>{
      cancel();setProposal(null);
      const host=v.firstElementChild,vr=v.getBoundingClientRect(),b=body.getBoundingClientRect();
      if(!host||host.inert||node.getRootNode()!==host.shadowRoot||!node.isConnected||!v.offsetWidth||!v.offsetHeight||!v.getClientRects().length||!b.width||!b.height){setGeometry(null);return;}
      const sx=vr.width/v.offsetWidth,sy=vr.height/v.offsetHeight,left=vr.left+v.clientLeft*sx,top=vr.top+v.clientTop*sy;
      const visible={left,top,right:left+v.clientWidth*sx,bottom:top+v.clientHeight*sy};
      const clipped=clipPaperRect(node.getBoundingClientRect(),visible);
      const pages=new Map();
      for(const page of host.shadowRoot.querySelectorAll('[data-page]')){
        const index=Number(page.dataset.page),guide=page.querySelector('[data-content-guide]');
        if(!/^\d+$/.test(page.dataset.page)||!Number.isSafeInteger(index)||index<0||index>=context.plan.pageCount||!guide||pages.has(index))continue;
        const r=guide.getBoundingClientRect();
        if(r.width>0&&r.height>0)pages.set(index,{page:index,left:r.left,top:r.top,width:r.width,height:r.height});
      }
      setGeometry(clipped?{body:{left:b.left,top:b.top,width:b.width,height:b.height},pages,visible,clipped}:null);
    };
    const escape=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(gesture.current)cancel();else if(latest.current.proposal)setProposal(null);else latest.current.onClose();}};
    const blur=()=>{cancel();setProposal(null);};
    const observer=new ResizeObserver(update);observer.observe(v);observer.observe(node);observer.observe(body);
    window.addEventListener('scroll',update,true);window.addEventListener('resize',update);window.addEventListener('blur',blur);window.addEventListener('keydown',escape,true);update();
    return ()=>{const g=gesture.current;gesture.current=null;if(g?.node.hasPointerCapture(g.id))g.node.releasePointerCapture(g.id);observer.disconnect();window.removeEventListener('scroll',update,true);window.removeEventListener('resize',update);window.removeEventListener('blur',blur);window.removeEventListener('keydown',escape,true);};
  },[viewport,node,context.selection.revision,context.selection.fingerprint]);
  if(!geometry)return null;
  const body={width:context.options.width,height:context.options.height,pixelWidth:geometry.body.width,pixelHeight:geometry.body.height};
  const position=proposal??context.position;
  const get=e=>{
    const g=gesture.current;
    if(!g||g.id!==e.pointerId||!context.current())return null;
    if(preferredMode)return paperPositionFromDrag(g.position,bounds,body,{x:e.clientX-g.x,y:e.clientY-g.y});
    const pointer={x:e.clientX,y:e.clientY},v=geometry.visible;
    if(pointer.x<v.left||pointer.x>=v.right||pointer.y<v.top||pointer.y>=v.bottom)return null;
    const page=[...geometry.pages.values()].find(p=>pointer.x>=p.left&&pointer.x<p.left+p.width&&pointer.y>=p.top&&pointer.y<p.top+p.height);
    return paperPositionFromPagePointer(page,body,pointer,g.grab,bounds);
  };
  const finish=e=>{const g=gesture.current;if(!g||g.id!==e.pointerId)return;const next=get(e),moved=Math.hypot(e.clientX-g.x,e.clientY-g.y)>=4;cancel();if(moved&&next)setProposal(next);};
  const display=ghost??position;
  const rectFor=position=>{
    const page=preferredMode?geometry.body:geometry.pages.get(position.page);
    if(!page)return null;
    const x=page.left+position.x/body.width*page.width,y=page.top+position.y/body.height*page.height;
    return clipPaperRect({left:x,top:y,right:x+bounds.width/body.width*page.width,bottom:y+bounds.height/body.height*page.height},geometry.visible);
  };
  const rect=rectFor(display),handleRect=rectFor(position);
  const pageCount=context.plan.pageCount;
  const crossPage=!preferredMode&&Number.isSafeInteger(pageCount)&&pageCount>0&&pageCount<=512;
  const panel=placePaperPropertyPanel(geometry.clipped,geometry.visible,{width:260,height:preferredMode?235:185});
  const changed=!!proposal&&(proposal.page!==context.position.page||proposal.x!==context.position.x||proposal.y!==context.position.y);
  const parseTolerance=(v,max)=>/^\d+(?:\.\d{1,3})?$/.test(v)&&Number.isSafeInteger(Math.round(Number(v)*1000))&&Number(v)*1000<=max?Math.round(Number(v)*1000):null;
  const tolerance={x:parseTolerance(tx,body.width),y:parseTolerance(ty,body.height)},validTolerance=tolerance.x!==null&&tolerance.y!==null;
  return <>
    {handleRect&&<div className="paper-selection-frame" style={handleRect}>
      <button id="book-paper-position-drag" type="button" className="paper-block-drag" aria-label="位置をドラッグ（矢印キーでも移動）" title={preferredMode?'同一ページ内で希望位置を指定':'表示中の別ページへもドラッグ可能。矢印キーは1 mm、Shiftで5 mm'}
        onPointerDown={e=>{if(e.button!==0||!e.isPrimary||gesture.current||!context.current())return;e.preventDefault();e.currentTarget.focus({preventScroll:true});try{e.currentTarget.setPointerCapture(e.pointerId);}catch{return;}const page=preferredMode?geometry.body:geometry.pages.get(position.page);if(!page){e.currentTarget.releasePointerCapture(e.pointerId);return;}gesture.current={id:e.pointerId,x:e.clientX,y:e.clientY,position,node:e.currentTarget,grab:{x:(e.clientX-page.left)/page.width*body.width-position.x,y:(e.clientY-page.top)/page.height*body.height-position.y}};}}
        onPointerMove={e=>{if(gesture.current?.id!==e.pointerId)return;const next=get(e);setGhost(next);setInvalid(!next);}}
        onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={cancel}
        onKeyDown={e=>{const dir={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!dir||!context.current()||gesture.current||e.ctrlKey||e.metaKey||e.altKey)return;e.preventDefault();e.stopPropagation();const step=e.shiftKey?5000:1000;const next={page:position.page,x:position.x+dir[0]*step,y:position.y+dir[1]*step};if(next.x>=0&&next.y>=0&&next.x<=bounds.maxX&&next.y<=bounds.maxY)setProposal(next);}}>✥</button>
    </div>}
    {rect&&<div className="paper-drop-guide" aria-hidden="true" style={rect}/>}
    <div className="paper-inline-area-toolbar" style={panel} role="group" aria-label={preferredMode?'希望位置の移動案':'固定位置の移動案'}>
      <small role="status">{invalid?'本文領域外には移動できません。':display.page+1+'ページ · X '+display.x/1000+' / Y '+display.y/1000+' mm（未確定）'}</small>
      {crossPage&&<label>移動先ページ <select id="book-paper-position-page" value={position.page} disabled={!!gesture.current} onChange={e=>{if(!context.current()||gesture.current)return;const page=Number(e.target.value);if(Number.isSafeInteger(page)&&page>=0&&page<pageCount)setProposal({...position,page});}}>{Array.from({length:pageCount},(_,i)=><option key={i} value={i}>{i+1}ページ</option>)}</select></label>}
      {crossPage&&!handleRect&&<small>移動先が画面外です。ページ番号と座標を確認してください。</small>}
      {preferredMode?<><small>許容範囲内を優先。成立しない場合は通常配置に戻ります。</small><div className="controls"><label>横 ± mm <input type="number" min="0" max={body.width/1000} step="0.001" value={tx} onChange={e=>setTx(e.target.value)}/></label><label>縦 ± mm <input type="number" min="0" max={body.height/1000} step="0.001" value={ty} onChange={e=>setTy(e.target.value)}/></label></div></>:<small>確定すると移動先を固定します。</small>}
      <div className="controls"><button id="book-paper-position-apply" type="button" disabled={(!preferredMode&&!changed)||(preferredMode&&!validTolerance)||!!gesture.current||!context.current()} onClick={()=>{if(!gesture.current&&context.current()){if(preferredMode&&validTolerance)onCommit({position,tolerance});else if(!preferredMode&&changed)onCommit(proposal);}}}>{preferredMode?'希望位置を保存':'移動先を固定して保存'}</button><button type="button" className="secondary-action" onClick={onClose}>取消</button></div>
    </div>
  </>;
}
