import React,{useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {clipPaperRect,placePaperPropertyPanel,paperPositionFromDrag,paperPositionFromPagePointer,resolvePaperSelectionNodes,preferredPositionEditStart,placeBookPositionPanel,parsePaperMillimetres,paperPositionFromCoordinates} from './paper-selection-geometry.mjs';
import {createIntelligentGeometryDraftSession,createFullRetainedTextPagePreview,createParagraphMeasurementCache,createMathCompilationCache,createDisplayMathGeometryCache,createInlineMathGeometryCache} from '../../../BookCreator_LayoutEngine/dist/index.js';
import {measurementLane} from './measurement-lane.mjs';
import {createPreviewCheckpoint} from './preview-checkpoint.mjs';
import {createBookPositionPreviewSession,measureBookPositionGeometry} from './paper-area-preview.mjs';

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
export function BookPositionOverlay({viewport,node,context,bounds,onCommit,onClose,preferredMode=false,dockTarget,onUndock}){
  const [geometry,setGeometry]=useState(null),[proposal,setProposal]=useState(null),[ghost,setGhost]=useState(null),[invalid,setInvalid]=useState(false);
  const stored=preferredMode?context.areaPrepared.document.entries.find(e=>e.documentId===context.selection.documentId&&e.persistentId===context.persistentId)?.bookPreferred:null;
  const initial=preferredMode?preferredPositionEditStart(context.position,bounds,context.options,stored):null;
  const [tx,setTx]=useState(()=>String((initial?.tolerance.x??5000)/1000)),[ty,setTy]=useState(()=>String((initial?.tolerance.y??5000)/1000)),[rebased,setRebased]=useState(false);
  const needsRebase=!!initial?.requiresRebase&&!rebased;
  const basePosition=preferredMode&&!rebased?initial.position:context.position;
  const [live,setLive]=useState(null),[quick,setQuick]=useState(null),[dragging,setDragging]=useState(false),[coordinates,setCoordinates]=useState(null),liveMount=useRef(null),draft=useRef(null);
  const gesture=useRef(null),latest=useRef(null);latest.current={context,proposal,coordinates,onClose};
  useLayoutEffect(()=>{
    const session=createBookPositionPreviewSession(context),caches={paragraphCache:createParagraphMeasurementCache(document),mathCache:createMathCompilationCache(),displayMathCache:createDisplayMathGeometryCache(document),...(context.options.inlineMathCache?{inlineMathCache:createInlineMathGeometryCache(document)}:{})};
    let geometrySession;
    if(context.geometryBase){
      try{geometrySession=createIntelligentGeometryDraftSession(document,context.geometryBase,createPreviewCheckpoint({current:context.current}));}
      catch(error){console.warn('Geometry-only preview unavailable',error);}
    }
    draft.current={session,caches,geometrySession};
    return ()=>{draft.current=null;geometrySession?.close();session.clear();for(const cache of Object.values(caches))cache.clear();};
  },[node,context.selection.revision,context.selection.fingerprint,context.geometryBase]);
  const cancel=()=>{const g=gesture.current;gesture.current=null;setDragging(false);setGhost(null);setInvalid(false);if(g?.node.hasPointerCapture(g.id))g.node.releasePointerCapture(g.id);};
  useLayoutEffect(()=>{
    const v=viewport.current,body=node?.closest('[data-page]')?.querySelector('[data-content-guide]');
    if(!v||!body||!node)return;
    const update=()=>{
      // Viewport geometry may change when the panel or its content resizes.
      // Cancel the active pointer capture, not the user's staged coordinates.
      if(gesture.current)cancel();
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
      const hr=host.getBoundingClientRect();
      setGeometry(clipped?{body:{left:b.left,top:b.top,width:b.width,height:b.height},pages,visible,clipped,host:{left:hr.left-left,top:hr.top-top,width:host.offsetWidth,sx,sy}}:null);
    };
    const escape=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(gesture.current)cancel();else if(latest.current.coordinates)setCoordinates(null);else if(latest.current.proposal)setProposal(null);else latest.current.onClose();}};
    const blur=()=>{if(gesture.current)cancel();};
    const scroll=e=>{if(e.target instanceof Element&&e.target.closest('.book-position-panel'))return;update();};
    const observer=new ResizeObserver(update);observer.observe(v);observer.observe(node);observer.observe(body);
    window.addEventListener('scroll',scroll,true);window.addEventListener('resize',update);window.addEventListener('blur',blur);window.addEventListener('keydown',escape,true);update();
    return ()=>{const g=gesture.current;gesture.current=null;if(g?.node.hasPointerCapture(g.id))g.node.releasePointerCapture(g.id);observer.disconnect();window.removeEventListener('scroll',scroll,true);window.removeEventListener('resize',update);window.removeEventListener('blur',blur);window.removeEventListener('keydown',escape,true);};
  },[viewport,node,context.selection.revision,context.selection.fingerprint]);
  const body={width:context.options.width,height:context.options.height,pixelWidth:geometry?.body.width,pixelHeight:geometry?.body.height};
  const position=proposal??basePosition;
  const coordinateValues=coordinates??{x:String(position.x/1000),y:String(position.y/1000)};
  const coordinatePosition=paperPositionFromCoordinates(position,bounds,coordinateValues);
  const coordinateDirty=coordinates!==null;
  const applyCoordinates=()=>{if(!context.current()||gesture.current||needsRebase||!coordinatePosition||!coordinateDirty)return;setProposal(coordinatePosition);setCoordinates(null);};
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
  const rect=geometry?rectFor(display):null,handleRect=geometry?rectFor(position):null;
  const pageCount=context.plan.pageCount;
  const crossPage=!preferredMode&&Number.isSafeInteger(pageCount)&&pageCount>0&&pageCount<=512;
  const panel=geometry?placeBookPositionPanel(geometry.clipped,handleRect?{left:handleRect.left+2,top:handleRect.top+2,width:32,height:32}:null,geometry.visible,{width:260,height:preferredMode?270:220}):null;
  const changed=!!proposal&&(proposal.page!==context.position.page||proposal.x!==context.position.x||proposal.y!==context.position.y);
  const parseTolerance=parsePaperMillimetres;
  const tolerance={x:parseTolerance(tx,body.width),y:parseTolerance(ty,body.height)},validTolerance=tolerance.x!==null&&tolerance.y!==null;
  const displayChanged=display.page!==context.position.page||display.x!==context.position.x||display.y!==context.position.y;
  const action=preferredMode?'preferred':'move';
  const quickMode=dragging&&!!draft.current?.geometrySession;
  const preferenceChanged=preferredMode&&(!stored||display.page!==stored.position.page||display.x!==stored.position.x||display.y!==stored.position.y||tolerance.x!==stored.tolerance.x||tolerance.y!==stored.tolerance.y);
  const proposalKey=geometry&&!invalid&&!needsRebase&&!coordinateDirty&&context.current()&&(preferredMode?validTolerance&&preferenceChanged:displayChanged)?JSON.stringify([action,display.page,display.x,display.y,preferredMode?tolerance.x:null,preferredMode?tolerance.y:null]):null;
  const liveKey=quickMode?null:proposalKey;
  const quickKey=quickMode&&ghost?proposalKey:null;
  useLayoutEffect(()=>{
    setQuick(null);
    const owner=draft.current,session=owner?.geometrySession,candidate=latest.current.context;
    if(!quickKey||!session){session?.cancel();return;}
    let cancelled=false;
    const current=()=>!cancelled&&draft.current===owner&&candidate.current();
    const [kind,page,x,y,tx,ty]=JSON.parse(quickKey),position={page,x,y},values=kind==='preferred'?{position,tolerance:{x:tx,y:ty}}:position;
    const requested=performance.now();
    const frame=requestAnimationFrame(()=>{
      if(!current())return;
      const started=performance.now();
      void measureBookPositionGeometry(candidate,kind,values,session,current).then(result=>{if(current()&&result&&session.isCurrent(result.generation))setQuick({key:quickKey,result,elapsedMs:performance.now()-started,queueMs:started-requested});}).catch(error=>{if(current())setQuick({key:quickKey,error:String(error.message??error)});});
    });
    return ()=>{cancelled=true;cancelAnimationFrame(frame);};
  },[quickKey,node,context.geometryBase]);
  // A quiet interval coalesces rapid pointer events. The guide itself still
  // follows every pointer event; stale real paper is never painted as current.
  useLayoutEffect(()=>{
    setLive(null);
    if(!liveKey)return;
    const controller=new AbortController(),candidate=latest.current.context,owner=draft.current;
    if(!owner)return;
    const current=()=>!controller.signal.aborted&&draft.current===owner&&candidate.current();
    const [kind,page,x,y,tx,ty]=JSON.parse(liveKey),position={page,x,y},values=kind==='preferred'?{position,tolerance:{x:tx,y:ty}}:position;
    const requested=performance.now();
    const timer=setTimeout(()=>{
      if(!current())return;
      const started=performance.now();
      void owner.session.measure(candidate,kind,values,(options,previous,active)=>measurementLane.run(()=>createFullRetainedTextPagePreview(document,options,previous,createPreviewCheckpoint({current:active})),{current:active,signal:controller.signal,priority:'background',category:'paper-position-live'}),current,owner.caches)
        .then(result=>{if(current())setLive({key:liveKey,result,elapsedMs:performance.now()-started,queueMs:started-requested});})
        .catch(error=>{if(current())setLive({key:liveKey,error:String(error.message??error)});});
    },120);
    return ()=>{clearTimeout(timer);controller.abort();};
  },[liveKey,node,context.selection.revision,context.selection.fingerprint]);
  const shown=liveKey&&live?.key===liveKey&&live.result;
  useLayoutEffect(()=>{
    const mount=liveMount.current;
    if(!shown||!mount)return;
    mount.replaceChildren(shown.element);
    return ()=>{if(shown.element.parentNode===mount)shown.element.remove();};
  },[shown]);
  if(!geometry)return null;
  const {visible,host}=geometry;
  const quickResult=quickKey&&quick?.key===quickKey?quick.result:null;
  const quickFrames=(quickResult?.changed??[]).flatMap(f=>{
    const page=geometry.pages.get(f.page);if(!page)return [];
    const x=page.left+f.rect.x/body.width*page.width,y=page.top+f.rect.y/body.height*page.height;
    const rect=clipPaperRect({left:x,top:y,right:x+f.rect.width/body.width*page.width,bottom:y+f.rect.height/body.height*page.height},visible);
    return rect?[{...f,rect}]:[];
  });
  const placement=shown?.intelligentLayout?.fragments.find(f=>f.origin.documentId===context.selection.documentId&&f.origin.blockKey===context.selection.blockKey)?.placement;
  const renderPositionPanel=element=>dockTarget?createPortal(element,dockTarget):element;
  return <>
    {shown&&<div className="paper-inline-live" aria-hidden="true" inert={true} style={{left:visible.left,top:visible.top,width:visible.right-visible.left,height:visible.bottom-visible.top}}><div ref={liveMount} style={{position:'absolute',left:host.left,top:host.top,width:host.width,transformOrigin:'top left',transform:'scale('+host.sx+','+host.sy+')'}}/></div>}
    {handleRect&&!needsRebase&&<div className="paper-selection-frame book-position-frame" style={handleRect}>
      <button id="book-paper-position-drag" data-dragging={dragging} data-geometry-available={!!draft.current?.geometrySession} data-invalid={invalid} data-origin-y={position.y} data-max-y={bounds.maxY} data-body-height={body.height} data-body-pixels={body.pixelHeight} type="button" className="paper-block-drag" aria-label="位置をドラッグ（矢印キーでも移動）" title={preferredMode?'同一ページ内で希望位置を指定':'表示中の別ページへもドラッグ可能。矢印キーは1 mm、Shiftで5 mm'}
        onPointerDown={e=>{if(e.button!==0||!e.isPrimary||gesture.current||coordinateDirty||!context.current())return;e.preventDefault();e.currentTarget.focus({preventScroll:true});try{e.currentTarget.setPointerCapture(e.pointerId);}catch{return;}const page=preferredMode?geometry.body:geometry.pages.get(position.page);if(!page){e.currentTarget.releasePointerCapture(e.pointerId);return;}setDragging(true);gesture.current={id:e.pointerId,x:e.clientX,y:e.clientY,position,node:e.currentTarget,grab:{x:(e.clientX-page.left)/page.width*body.width-position.x,y:(e.clientY-page.top)/page.height*body.height-position.y}};}}
        onPointerMove={e=>{if(gesture.current?.id!==e.pointerId)return;const next=get(e);setGhost(next);setInvalid(!next);}}
        onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={cancel}
        onKeyDown={e=>{const dir={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!dir||!context.current()||gesture.current||coordinateDirty||e.ctrlKey||e.metaKey||e.altKey)return;e.preventDefault();e.stopPropagation();const step=e.shiftKey?5000:1000;const next={page:position.page,x:position.x+dir[0]*step,y:position.y+dir[1]*step};if(next.x>=0&&next.y>=0&&next.x<=bounds.maxX&&next.y<=bounds.maxY)setProposal(next);}}>✥</button>
    </div>}
    {quickFrames.map(f=><div key={f.key} className={'book-geometry-draft-frame'+(f.selected?' is-selected':'')} aria-hidden="true" style={f.rect}/>)}
    {rect&&!needsRebase&&<div className="paper-drop-guide" aria-hidden="true" style={rect}/>}
    {renderPositionPanel(<div className={'paper-inline-area-toolbar book-position-panel'+(dockTarget?' paper-area-docked':'')} style={dockTarget?undefined:panel} role="group" aria-label={preferredMode?'希望位置の移動案':'固定位置の移動案'}>
      {dockTarget&&<button id="book-position-undock" type="button" className="secondary-action" disabled={dragging} onClick={onUndock}>紙面上に戻す</button>}
      <small role="status">{needsRebase?'以前の希望位置は現在の本文領域では直接編集できません。':invalid?'本文領域外には移動できません。':display.page+1+'ページ · X '+display.x/1000+' / Y '+display.y/1000+' mm'+(preferredMode&&!preferenceChanged?'（保存済みの希望）':'（未確定）')}</small>
      {needsRebase&&<><small>保存済み：{stored.position.page+1}ページ X {stored.position.x/1000} / Y {stored.position.y/1000} mm、許容 ±{stored.tolerance.x/1000} / ±{stored.tolerance.y/1000} mm</small><button type="button" id="book-paper-preferred-rebase" onClick={()=>{if(!context.current())return;setProposal(null);setRebased(true);}}>現在の紙面を基準に再指定</button></>}
      {quickMode&&<small className="paper-inline-live-status" data-position-phase={quickResult?'geometry-ready':quick?.key===quickKey&&quick.error?'geometry-conflict':'geometry-pending'} data-elapsed-ms={quickResult?quick.elapsedMs:undefined} data-queue-ms={quickResult?quick.queueMs:undefined} role="status">{invalid?'':quick?.key===quickKey&&quick.error?'配置案が成立しません：'+quick.error:quickResult?'軽量配置案 · 移動 '+quickResult.changed.length+'件 · '+quickResult.pageCount+'ページ（未確定）':'配置ガイド（ドロップ後に実測）'}</small>}
      {liveKey&&<small className="paper-inline-live-status" data-position-phase={shown?'paper-ready':live?.key===liveKey&&live.error?'paper-conflict':'paper-pending'} data-proposal-key={liveKey} data-measurement-work={shown?.measurementWork?JSON.stringify(shown.measurementWork):undefined} data-elapsed-ms={shown?live.elapsedMs:undefined} data-queue-ms={shown?live.queueMs:undefined} role="status">{shown?(placement?.preference==='fallback'?'実測配置案：希望範囲外（未保存）':'実測配置案（未保存）'):live?.key===liveKey&&live.error?'配置できません：'+live.error:live?.key===liveKey?'配置変更なし':'配置を計算中…'}</small>}
      {crossPage&&<label>移動先ページ <select id="book-paper-position-page" value={position.page} disabled={!!gesture.current||coordinateDirty} onChange={e=>{if(!context.current()||gesture.current||coordinateDirty)return;const page=Number(e.target.value);if(Number.isSafeInteger(page)&&page>=0&&page<pageCount)setProposal({...position,page});}}>{Array.from({length:pageCount},(_,i)=><option key={i} value={i}>{i+1}ページ</option>)}</select></label>}
      {crossPage&&!handleRect&&<small>移動先が画面外です。ページ番号と座標を確認してください。</small>}
      {!needsRebase&&<div className="book-position-coordinates"><small>本文領域の左上からの距離（mm）</small><div className="paper-property-grid">{['x','y'].map(axis=><label className="paper-property-number" key={axis}>{axis.toUpperCase()} <input id={'book-paper-coordinate-'+axis} type="text" inputMode="decimal" value={coordinateValues[axis]} aria-invalid={parsePaperMillimetres(coordinateValues[axis],axis==='x'?bounds.maxX:bounds.maxY)===null} disabled={dragging} onChange={e=>setCoordinates({...coordinateValues,[axis]:e.target.value})} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();applyCoordinates();}}}/><span>mm</span></label>)}</div>{coordinateDirty&&<><small role="status">{coordinatePosition?'座標を反映してから紙面を確認してください。':'座標は X 0〜'+bounds.maxX/1000+' / Y 0〜'+bounds.maxY/1000+' mm（小数3桁まで）です。'}</small><div className="controls"><button id="book-paper-coordinate-apply" type="button" disabled={!coordinatePosition||dragging||!context.current()} onClick={applyCoordinates}>座標を反映</button><button type="button" onClick={()=>setCoordinates(null)}>入力を取消</button></div></>}</div>}
      {preferredMode&&!needsRebase?<><small>許容範囲内を優先。成立しない場合は通常配置に戻ります。</small><div className="controls"><label>横 ± mm <input type="number" min="0" max={body.width/1000} step="0.001" value={tx} onChange={e=>setTx(e.target.value)}/></label><label>縦 ± mm <input type="number" min="0" max={body.height/1000} step="0.001" value={ty} onChange={e=>setTy(e.target.value)}/></label></div></>:!preferredMode?<small>確定すると移動先を固定します。</small>:null}
      <div className="controls"><button id="book-paper-position-apply" type="button" disabled={(!preferredMode&&!changed)||(preferredMode&&(!validTolerance||!preferenceChanged||needsRebase))||coordinateDirty||!!gesture.current||!context.current()||!!(liveKey&&live?.key===liveKey&&live.error)} onClick={()=>{if(!coordinateDirty&&!gesture.current&&context.current()){if(preferredMode&&validTolerance&&preferenceChanged&&!needsRebase)onCommit({position,tolerance});else if(!preferredMode&&changed)onCommit(proposal);}}}>{preferredMode?'希望位置を保存':'移動先を固定して保存'}</button><button type="button" className="secondary-action" onClick={onClose}>取消</button></div>
    </div>)}
  </>;
}


// Read only the currently published shadow tree. Selection frames are
// ordinary sibling UI, never layout inputs, printable DOM or hit targets.
export function BookGroupSelectionOverlay({viewport,documentId,blockKeys,job,current,numbered=true,invalid=false}){
  const [frames,setFrames]=useState([]),latest=useRef(null);
  latest.current={current};
  const keys=JSON.stringify(blockKeys);
  useLayoutEffect(()=>{
    const v=viewport.current,host=v?.firstElementChild,root=host?.shadowRoot;
    if(!v||!root){setFrames([]);return;}
    const selected=resolvePaperSelectionNodes(root.querySelectorAll('[data-block]'),documentId,JSON.parse(keys));
    let raf=0,closed=false;
    const update=()=>{
      raf=0;if(closed)return;
      if(!latest.current.current()||v.firstElementChild!==host||host.inert||!v.offsetWidth||!v.offsetHeight||!v.getClientRects().length){setFrames([]);return;}
      const r=v.getBoundingClientRect(),sx=r.width/v.offsetWidth,sy=r.height/v.offsetHeight,left=r.left+v.clientLeft*sx,top=r.top+v.clientTop*sy;
      const visible={left,top,right:left+v.clientWidth*sx,bottom:top+v.clientHeight*sy};
      const next=selected.flatMap(({key,index,node})=>{
        if(!node.isConnected||node.getRootNode()!==root)return [];
        const rect=clipPaperRect(node.getBoundingClientRect(),visible);
        return rect?[{key,index,rect}]:[];
      });
      setFrames(next);
    };
    const schedule=()=>{if(!closed&&!raf)raf=requestAnimationFrame(update);};
    const observer=new ResizeObserver(schedule);
    observer.observe(v);observer.observe(host);
    for(const {node} of selected)observer.observe(node);
    window.addEventListener('scroll',schedule,true);window.addEventListener('resize',schedule);
    update();
    return ()=>{closed=true;if(raf)cancelAnimationFrame(raf);observer.disconnect();window.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule);};
  },[viewport,documentId,keys,job]);
  return <div className="book-group-selection-layer" aria-hidden="true">{frames.map(({key,index,rect})=><div key={key} data-selection-index={index+1} className={'book-group-selection-frame'+(invalid?' is-incomplete':'')+(index===0?' is-anchor':'')} style={rect}>{numbered&&<span>{index+1}</span>}</div>)}</div>;
}

const groupLayoutNames={vertical:'縦並び',rows:'横並び・折返し',adaptiveRows:'適応型'};
export function BookGroupControls({savedGroup,count,selecting,disabled,canStart,valid,anchorLabel,additional,layout,onLayout,onToggle,onRemove,onApply,onChange,onRelease}){
  const [draft,setDraft]=useState(savedGroup?.layout??'vertical');
  useLayoutEffect(()=>{setDraft(savedGroup?.layout??'vertical');},[savedGroup?.id,savedGroup?.layout]);
  const choices=Object.entries(groupLayoutNames).map(([value,label])=><option key={value} value={value}>{label}</option>);
  return <div className="paper-context-actions book-group-controls" role="group" aria-label="グループ配置">
    {savedGroup?<><small className="book-group-state">グループ · {count}部品</small><label>配置 <select value={draft} disabled={disabled} onChange={e=>setDraft(e.target.value)}>{choices}</select></label><button type="button" disabled={disabled||draft===savedGroup.layout} onClick={()=>onChange(draft)}>配置を適用</button><button type="button" disabled={disabled} onClick={onRelease}>グループを解除</button></>:<>
      <button id="book-paper-group-mode" type="button" aria-pressed={selecting} disabled={disabled||!canStart} onClick={onToggle}>{selecting?'選択を取消':'グループ化'}</button>
      {selecting&&<><small className="book-group-instruction">紙面で追加選択・再クリックで解除。番号は選択順です。</small>
      <div className="book-group-chips" aria-label="選択中の部品"><span className="book-group-chip is-anchor" title={anchorLabel}>1 · {anchorLabel}</span>{additional.map((entry,i)=><button type="button" key={entry.blockKey} className="book-group-chip" disabled={disabled} title={entry.label+' を選択解除'} aria-label={entry.label+' を選択解除'} onClick={()=>onRemove(entry.blockKey)}>{i+2} · {entry.label} ×</button>)}</div>
      <small role="status" className="book-group-instruction">{count}件選択 · {valid?'グループ化できます':count<2?'もう1件以上選択してください':'同じ原稿内で連続する部品を選択してください'}</small>
      <label>配置 <select value={layout} disabled={disabled} onChange={e=>onLayout(e.target.value)}>{choices}</select></label><button id="book-paper-group-apply" type="button" disabled={disabled||!valid} onClick={onApply}>グループ化して保存</button></>}
    </>}
  </div>;
}
