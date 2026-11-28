import React,{useLayoutEffect,useRef,useState} from 'react';
import {beginPaperAreaDrag,previewPaperAreaDrag,finishPaperAreaDrag,beginPaperGapDrag,previewPaperGapDrag,finishPaperGapDrag,parsePaperPropertyNumber} from './paper-area-intent.mjs';
import {clipPaperRect,placePaperPropertyPanel} from './paper-selection-geometry.mjs';
import {createPlainTextPagePreview,createParagraphMeasurementCache,createMathCompilationCache,createDisplayMathGeometryCache} from '../../../BookCreator_LayoutEngine/dist/index.js';
import {measurementLane} from './measurement-lane.mjs';
import {measureInlineAreaProposal} from './paper-area-preview.mjs';
import {MAX_PAPER_TRAILING_SPACE} from './paper-area-store.mjs';

// Separate from the measured shadow tree, just like the reorder overlay.
// The preview is local to the gesture; a confirmed save is handled by App.
export function PaperInlineArea({viewport,node,context,onCommit,previewOnly=false,onPendingChange}){
  const [geometry,setGeometry]=useState(null),[proposal,setProposal]=useState({}),[ghost,setGhost]=useState(null);
  const active=useRef(null),liveMount=useRef(null);
  const isGap=axis=>axis==='before'||axis==='gap';
  const [live,setLive]=useState(null),[details,setDetails]=useState(false),[panelSize,setPanelSize]=useState({width:260,height:40});
  const [numberText,setNumberText]=useState({});
  const panelRef=useRef(null);
  // Private to this mounted block / revision. No DOM page cache or
  // normal-paper cache is borrowed, even when the user cancels.
  const draftCaches=useRef(null);
  useLayoutEffect(()=>{
    const caches={paragraphCache:createParagraphMeasurementCache(document),mathCache:createMathCompilationCache(),displayMathCache:createDisplayMathGeometryCache(document)};
    draftCaches.current=caches;
    return ()=>{draftCaches.current=null;for(const cache of Object.values(caches))cache.clear();};
  },[node,context.target.revision,context.target.fingerprint]);
  const {target,placement}=context;
  const stored=placement.sizeConstraints??{};
  const latest=useRef(null);latest.current={proposal,context,numberText};
  const storedValue=axis=>axis==='before'?(placement.spaceBefore??0):axis==='gap'?(placement.spaceAfter??0):(stored[axis==='width'?'minWidthPercent':'minHeightPercent']??0);
  function propose(axis,value){
    setNumberText(previous=>{if(!Object.hasOwn(previous,axis))return previous;const next={...previous};delete next[axis];return next;});
    setProposal(previous=>{const next={...previous};if(value===storedValue(axis))delete next[axis];else next[axis]=value;return next;});
  }
  function discardProposal(){setNumberText({});setProposal({});}
  function editNumber(axis,raw){
    if(context.disabled||!context.current()||active.current)return;
    const value=parsePaperPropertyNumber(axis,raw,context.height);
    if(value!==null)propose(axis,value);
    setNumberText(previous=>({...previous,[axis]:raw}));
  }
  const invalidNumbers=Object.keys(numberText).filter(axis=>parsePaperPropertyNumber(axis,numberText[axis],context.height)===null);
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
      const width=occupied?occupied.width/context.width*b.width:r.width,height=occupied?Math.max(r.height,(occupied.height-(placement.spaceAfter??0))/context.height*b.height):r.height;
      const full={left:r.left,top:r.top,right:r.left+width,bottom:r.top+height,width,height};
      const clipped=clipPaperRect(full,bounds);
      if(!clipped||!b.width||!b.height){setGeometry(null);return;}
      const hr=host.getBoundingClientRect();
      setGeometry({full,clipped,bounds,host:{left:hr.left-left,top:hr.top-top,width:host.offsetWidth,sx,sy},bodyWidth:b.width,bodyHeight:b.height,contentWidth:r.width,contentHeight:r.height,
        topVisible:Math.abs(clipped.top-full.top)<1,rightVisible:Math.abs(clipped.left+clipped.width-full.right)<1,bottomVisible:Math.abs(clipped.top+clipped.height-full.bottom)<1});
    };
    const observer=new ResizeObserver(update);observer.observe(v);observer.observe(block);observer.observe(body);
    const escape=e=>{if(e.key==='Escape'){if(active.current){e.preventDefault();cancel();}else if(Object.keys(latest.current.proposal).length||Object.keys(latest.current.numberText).length){e.preventDefault();discardProposal();}}};
    window.addEventListener('scroll',update,true);window.addEventListener('resize',update);
    window.addEventListener('blur',cancel);window.addEventListener('keydown',escape,true);
    update();
    return ()=>{observer.disconnect();window.removeEventListener('scroll',update,true);window.removeEventListener('resize',update);window.removeEventListener('blur',cancel);window.removeEventListener('keydown',escape,true);};
  },[viewport,node,context.target.documentId,context.target.blockKey,context.target.revision,context.target.fingerprint]);
  function begin(e,axis){
    if(e.button!==0||!e.isPrimary||active.current||!geometry||!context.current()||context.disabled)return;
    const gesture=isGap(axis)?beginPaperGapDrag({target,current:target,placement,value:proposal[axis]??storedValue(axis),bodyPx:geometry.bodyHeight,bodyHeight:context.height,originPx:e.clientY,side:axis==='before'?'before':'after'}):beginPaperAreaDrag({target,current:target,placement,axis,occupiedPx:axis==='width'?geometry.full.width:geometry.full.height,bodyPx:axis==='width'?geometry.bodyWidth:geometry.bodyHeight,originPx:axis==='width'?e.clientX:e.clientY});
    if(!gesture)return;
    e.preventDefault();e.currentTarget.focus({preventScroll:true});
    try{e.currentTarget.setPointerCapture(e.pointerId);}catch{return;}
    active.current={id:e.pointerId,gesture,axis,node:e.currentTarget};
  }
  function move(e){
    const g=active.current;if(!g||g.id!==e.pointerId)return;
    const p=isGap(g.axis)?previewPaperGapDrag(g.gesture,e.clientY):previewPaperAreaDrag(g.gesture,g.axis==='width'?e.clientX:e.clientY);
    if(p)setGhost({axis:g.axis,...p});
  }
  function finish(e){
    const g=active.current;if(!g||g.id!==e.pointerId)return;
    if(isGap(g.axis)){
      const value=context.current()&&!context.disabled?finishPaperGapDrag(g.gesture,{current:target,placement,pointerPx:e.clientY}):null;
      cancel();if(value!==null)propose(g.axis,value);return;
    }
    const p=previewPaperAreaDrag(g.gesture,g.axis==='width'?e.clientX:e.clientY);
    // Compare against the pending axis, not just the persisted value, so a
    // second drag can explicitly restore the saved value without losing the other axis.
    const key=g.axis==='width'?'minWidthPercent':'minHeightPercent';
    const constraints={...stored};
    if(Object.hasOwn(proposal,g.axis)){
      if(proposal[g.axis])constraints[key]=proposal[g.axis];else delete constraints[key];
    }
    const next=context.current()&&!context.disabled?finishPaperAreaDrag(g.gesture,{current:target,placement:{...placement,sizeConstraints:constraints},pointerPx:g.axis==='width'?e.clientX:e.clientY}):null;
    cancel();
    if(next&&p)propose(g.axis,p.value);
  }
  function keyAdjust(e,axis){
    if(context.disabled||active.current||!context.current()||!geometry||e.ctrlKey||e.metaKey||e.altKey)return;
    const delta=axis==='width'?({ArrowLeft:-1,ArrowRight:1})[e.key]:({ArrowUp:-1,ArrowDown:1})[e.key];
    if(!delta)return;e.preventDefault();e.stopPropagation();
    if(isGap(axis)){
      const max=Math.floor(Math.min(context.height,MAX_PAPER_TRAILING_SPACE)/1000)*1000;
      const start=proposal[axis]??storedValue(axis),value=Math.max(0,Math.min(max,start+(axis==='before'?-delta:delta)*(e.shiftKey?5000:1000)));
      if(value!==start)propose(axis,value);return;
    }
    const extent=axis==='width'?geometry.bodyWidth:geometry.bodyHeight,actual=axis==='width'?geometry.full.width:geometry.full.height;
    const start=proposal[axis]||Math.round(actual/extent*100);
    const value=Math.max(1,Math.min(100,start+delta*(e.shiftKey?5:1)));
    if(value!==start)propose(axis,value);
  }
  const pending=Object.keys(proposal).length>0;
  const hasInput=pending||invalidNumbers.length>0;
  useLayoutEffect(()=>{onPendingChange?.(hasInput||!!ghost);},[onPendingChange,hasInput,ghost]);
  useLayoutEffect(()=>()=>onPendingChange?.(false),[onPendingChange]);
  const preview=ghost?.changed?{...proposal,[ghost.axis]:ghost.value}:proposal;
  const liveKey=JSON.stringify([preview.width??null,preview.height??null,preview.gap??null,preview.before??null]);
  const canPreview=!!geometry&&!context.disabled&&invalidNumbers.length===0&&Object.keys(preview).length>0;
  // Keep the authoritative host and selection intact; the live layer is inert.
  // Coalesce pointer movement and drop any late result for a superseded proposal.
  useLayoutEffect(()=>{
    setLive(null);
    if(!canPreview)return;
    const controller=new AbortController(),candidate=latest.current.context,caches=draftCaches.current;
    const current=()=>!controller.signal.aborted&&candidate.current()&&!latest.current.context.disabled;
    const [w,h,g,b]=JSON.parse(liveKey),values={...(w!==null?{width:w}:{}),...(h!==null?{height:h}:{}),...(g!==null?{gap:g}:{}),...(b!==null?{before:b}:{})};
    const timer=setTimeout(()=>{
      if(!current())return;
      void measureInlineAreaProposal(candidate,values,options=>measurementLane.run(()=>createPlainTextPagePreview(document,options),{current,signal:controller.signal,priority:'background',category:'paper-area-live'}),current,caches??{})
        .then(result=>{if(current())setLive({key:liveKey,result});})
        .catch(error=>{if(current())setLive({key:liveKey,error:String(error.message??error)});});
    },120);
    return ()=>{clearTimeout(timer);controller.abort();};
  },[canPreview,liveKey,node,target.revision,target.fingerprint]);
  const shown=canPreview&&live?.key===liveKey&&live.result;
  useLayoutEffect(()=>{
    const mount=liveMount.current;
    if(!shown||!mount)return;
    mount.replaceChildren(shown.element);
    return ()=>{if(shown.element.parentNode===mount)shown.element.remove();};
  },[shown]);
  const panelVisible=!!geometry;
  useLayoutEffect(()=>{
    const panel=panelRef.current;if(!panel)return;
    const update=()=>{const r=panel.getBoundingClientRect();setPanelSize(old=>Math.abs(old.width-r.width)<.5&&Math.abs(old.height-r.height)<.5?old:{width:r.width,height:r.height});};
    const observer=new ResizeObserver(update);observer.observe(panel);update();
    return ()=>observer.disconnect();
  },[panelVisible]);
  if(!geometry)return null;
  const {full,clipped,bounds,host}=geometry;
  const panelPosition=placePaperPropertyPanel(clipped,bounds,{width:260,height:panelSize.height});
  const extent=(axis,body,content,actual)=>Object.hasOwn(preview,axis)?Math.max(content,preview[axis]*body/100):actual;
  const width=extent('width',geometry.bodyWidth,geometry.contentWidth,full.width);
  const height=extent('height',geometry.bodyHeight,geometry.contentHeight,full.height);
  const gap=preview.gap??storedValue('gap'),gapPx=gap/context.height*geometry.bodyHeight;
  const before=preview.before??storedValue('before'),beforePx=before/context.height*geometry.bodyHeight;
  const beforeStart=full.top-beforePx;
  const beforeHandleVisible=geometry.topVisible&&(active.current?.axis==='before'||beforeStart>=bounds.top-1);
  const beforeRect=beforePx>0?clipPaperRect({left:full.left,top:full.top-beforePx,right:full.left+width,bottom:full.top,width,height:beforePx},bounds):null;
  const gapEnd=full.top+height+gapPx;
  const gapHandleVisible=geometry.bottomVisible&&(active.current?.axis==='gap'||gapEnd<=bounds.bottom+1);
  const gapRect=gapPx>0?clipPaperRect({left:full.left,top:full.top+height,right:full.left+width,bottom:full.top+height+gapPx,width,height:gapPx},bounds):null;
  const guide=(pending||ghost)?clipPaperRect({left:full.left,top:full.top,right:full.left+width,bottom:full.top+height,width,height},bounds):null;
  const style=r=>({left:r.left,top:r.top,width:r.width,height:r.height});
  const label=axis=>{const value=preview[axis]??storedValue(axis);return value?value+'%':'自動';};
  return <>
    {shown&&<div className="paper-inline-live" aria-hidden="true" inert={true} style={{left:bounds.left,top:bounds.top,width:bounds.right-bounds.left,height:bounds.bottom-bounds.top}}><div ref={liveMount} style={{position:'absolute',left:host.left,top:host.top,width:host.width,transformOrigin:'top left',transform:'scale('+host.sx+','+host.sy+')'}}/></div>}
    {beforeRect&&<div className="paper-inline-area-guide" aria-hidden="true" style={{...style(beforeRect),borderStyle:'dotted',background:'#d99b2633'}}/>}
    {gapRect&&<div className="paper-inline-area-guide" aria-hidden="true" style={{...style(gapRect),borderStyle:'dotted',background:'#d99b2633'}}/>}
    {guide&&<div className="paper-inline-area-guide" aria-hidden="true" style={style(guide)}/>}
    <div className="paper-inline-area-frame" style={style(clipped)}>
      {['width','height'].map(axis=>(axis==='width'?geometry.rightVisible:geometry.bottomVisible)&&<button key={axis} id={'paper-inline-area-'+axis} type="button" className={'paper-area-handle '+axis} aria-label={axis==='width'?'横の最小占有率を調整':'縦の最小占有率を調整'} disabled={context.disabled} onPointerDown={e=>begin(e,axis)} onPointerMove={move} onPointerUp={finish} onPointerCancel={e=>{if(active.current?.id===e.pointerId)cancel();}} onLostPointerCapture={e=>{if(active.current?.id===e.pointerId)cancel();}} onKeyDown={e=>keyAdjust(e,axis)}/>)}
    </div>
    {[['before',beforeHandleVisible,before,beforeStart,-9,'前'],['gap',gapHandleVisible,gap,gapEnd,9,'後']].map(([axis,visible,value,edge,offset,label])=>visible&&<button key={axis} id={axis==='before'?'paper-inline-gap-before-handle':'paper-inline-gap-handle'} type="button" className="paper-inline-gap-handle" style={{left:clipped.left+Math.min(18,clipped.width/4),top:Math.max(bounds.top+8,Math.min(edge+(value===0?offset:0),bounds.bottom-8))}} aria-label={label+'の余白を調整（'+value/1000+' mm）'} title={axis==='before'?'上にドラッグして前の余白を増やす':'下にドラッグして後ろの余白を増やす'} disabled={context.disabled} onPointerDown={e=>begin(e,axis)} onPointerMove={move} onPointerUp={finish} onPointerCancel={e=>{if(active.current?.id===e.pointerId)cancel();}} onLostPointerCapture={e=>{if(active.current?.id===e.pointerId)cancel();}} onKeyDown={e=>keyAdjust(e,axis)}>{label}↕</button>)}
    <div ref={panelRef} className="paper-inline-area-toolbar" style={panelPosition} role="group" aria-label="選択ブロックの配置プロパティ">
      <div className="paper-inline-summary"><small aria-live="polite">横 {label('width')} · 縦 {label('height')}<br/>余白 前 {before/1000} / 後 {gap/1000} mm{pending||ghost?'（未確定）':''}</small>
        {!ghost&&<button id="paper-inline-details" type="button" className="secondary-action" aria-expanded={details} aria-controls="paper-inline-properties" onClick={()=>setDetails(v=>!v)}>{details?'閉じる':'調整'}</button>}
      </div>
      {canPreview&&<small className="paper-inline-live-status" role="status">{shown?'実測配置案（未保存）':live?.key===liveKey&&live.error?'配置できません：'+live.error:live?.key===liveKey?'配置変更なし':'配置を計算中…'}</small>}
      <div id="paper-inline-properties" className="paper-inline-properties" hidden={!details||!!ghost}>
        <small className="paper-property-help">占有率：0で自動 / 余白：0で解除</small>
        <div className="paper-property-grid">
          {[['width','横','%'],['height','縦','%'],['before','前方','mm'],['gap','後方','mm']].map(([axis,name,unit])=>{
            const value=proposal[axis]??storedValue(axis);
            const raw=numberText[axis]??String(isGap(axis)?value/1000:value);
            const invalid=invalidNumbers.includes(axis);
            return <label key={axis} className="paper-property-number"><span>{name}</span><input id={'paper-property-'+axis} type="text" inputMode={isGap(axis)?'decimal':'numeric'} maxLength={16} aria-label={name+(isGap(axis)?'余白（mm）':'最小占有率（%）')} aria-invalid={invalid||undefined} value={raw} disabled={context.disabled} onChange={e=>editNumber(axis,e.target.value)}/><small>{unit}</small></label>;
          })}
        </div>
        <div className="paper-property-resets"><button type="button" className="secondary-action" disabled={context.disabled||!(proposal.width??storedValue('width'))&&!invalidNumbers.includes('width')} onClick={()=>propose('width',0)}>横を自動</button><button type="button" className="secondary-action" disabled={context.disabled||!(proposal.height??storedValue('height'))&&!invalidNumbers.includes('height')} onClick={()=>propose('height',0)}>縦を自動</button></div>
        <div className="paper-property-sliders">{[['before','前',before],['gap','後',gap]].map(([axis,name,value])=><label key={axis}><small>{name} {value/1000} mm</small><input id={axis==='before'?'paper-inline-gap-before':'paper-inline-gap'} aria-label={'部品の'+name+'の余白（mm）'} type="range" min={0} max={Math.floor(Math.min(context.height,MAX_PAPER_TRAILING_SPACE)/1000)} step={1} value={value/1000} disabled={context.disabled} onChange={e=>{if(context.current())propose(axis,Number(e.target.value)*1000);}}/></label>)}</div>
      </div>
      {invalidNumbers.length>0&&<small role="alert" className="paper-property-error">数値を確認してください。占有率は0〜100の整数、余白は本文高さ以内のmm値（小数3桁まで）です。</small>}
      {previewOnly&&<small className="paper-inline-live-status">全冊の試験配置（保存条件未成立）</small>}
      {hasInput&&!ghost&&<>{!previewOnly&&<button id="paper-inline-area-commit" type="button" disabled={context.disabled||!pending||invalidNumbers.length>0} onClick={()=>{if(!context.current()||invalidNumbers.length)return;void onCommit({...proposal});}}>適用して保存</button>}<button type="button" disabled={context.disabled} onClick={discardProposal}>取消</button></>}
    </div>
  </>;
}
