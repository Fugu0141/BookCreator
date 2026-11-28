import React,{useState,useRef,useEffect,useLayoutEffect} from 'react';
import {createPlainTextPagePreview} from '../../../BookCreator_LayoutEngine/dist/index.js';
import {measurementLane} from './measurement-lane.mjs';
import {createPaperAreaController} from './paper-area-controller.mjs';

// An isolated, explicitly experimental surface. It never changes the normal
// manuscript preview, the source, the saved file, or the print ticket.
export function PaperAreaLab({context,onClose}){
  const mount=useRef(null),surface=useRef(null),frame=useRef(null),active=useRef(null),generation=useRef(0),latest=useRef(context.plan);
  const [controller]=useState(()=>createPaperAreaController(undefined,()=>context.current()?latest.current:null));
  const [draft,setDraft]=useState(()=>controller.snapshot()),[status,setStatus]=useState('組版中…'),[busy,setBusy]=useState(true),[placed,setPlaced]=useState(null);
  const [ghost,setGhost]=useState(null),[rect,setRect]=useState(null);
  const selection=context.selection;
  const update=()=>setDraft(controller.snapshot());
  useEffect(()=>{
    const request=++generation.current;
    const current=()=>generation.current===request&&context.current();
    let cancelled=false;
    const bind=controller.bind();
    if(!bind||bind.status!=='ready'){setStatus('対象の部品を特定できません。');setBusy(false);return;}
    setBusy(true);setStatus('配置を計算しています…');setGhost(null);
    const {measurementCache,paragraphCache,pageCache,inlineMathCache,displayMathCache,mathCompilationCache,...options}=context.options;
    void measurementLane.run(()=>createPlainTextPagePreview(document,{...options,intelligentLayout:{intents:bind.intents}}),{current,category:'paper-area'}).then(result=>{
      if(cancelled||!current()||!result)return;
      const il=result.intelligentLayout;
      if(!il||il.status!=='placed'||il.revision!==selection.revision||il.fingerprint!==selection.fingerprint)throw Error('ILの最新配置結果を取得できません。');
      const matches=il.fragments.filter(f=>f.origin.documentId===selection.documentId&&f.origin.blockKey===selection.blockKey);
      if(matches.length!==1)throw Error('部品が複数断片に分かれました。');
      latest.current={revision:il.revision,fingerprint:il.fingerprint,fragments:il.fragments};
      mount.current.replaceChildren(result.element);setPlaced(matches[0]);setStatus('試験配置 · 保存・PDF出力には反映されません');
    }).catch(e=>{if(!cancelled&&current())setStatus('配置できません：'+String(e.message??e));}).finally(()=>{if(!cancelled&&current())setBusy(false);});
    return ()=>{cancelled=true;generation.current++;};
  },[draft.version,controller,context,selection.revision,selection.fingerprint,selection.documentId,selection.blockKey]);
  useLayoutEffect(()=>{
    const host=mount.current?.firstElementChild,root=host?.shadowRoot,wrapper=surface.current;
    if(!placed||!root||!wrapper){setRect(null);return;}
    const node=[...root.querySelectorAll('[data-block]')].find(n=>n.dataset.document===selection.documentId&&n.dataset.block===selection.blockKey);
    const body=node?.closest('[data-page]')?.querySelector('[data-content-guide]');
    if(!node||!body){setRect(null);return;}
    const measure=()=>{
      const r=node.getBoundingClientRect(),b=body.getBoundingClientRect(),w=wrapper.getBoundingClientRect();
      const occupied=placed.placement.occupiedRect??placed.placement.rect;
      if(!b.width||!b.height){setRect(null);return;}
      setRect({left:r.left-w.left,top:r.top-w.top,width:occupied.width/context.options.width*b.width,height:occupied.height/context.options.height*b.height,bodyWidth:b.width,bodyHeight:b.height});
    };
    const observer=new ResizeObserver(measure);observer.observe(node);observer.observe(body);observer.observe(wrapper);
    window.addEventListener('resize',measure);measure();
    return ()=>{observer.disconnect();window.removeEventListener('resize',measure);};
  },[placed,context,selection.documentId,selection.blockKey]);
  function cancel(){
    const g=active.current;active.current=null;setGhost(null);
    if(g?.node.hasPointerCapture(g.id))g.node.releasePointerCapture(g.id);
  }
  useEffect(()=>{const escape=e=>{if(e.key==='Escape'&&active.current){e.preventDefault();e.stopPropagation();cancel();}};window.addEventListener('keydown',escape,true);window.addEventListener('blur',cancel);return ()=>{window.removeEventListener('keydown',escape,true);window.removeEventListener('blur',cancel);};},[]);
  const entry=draft.document.entries.find(e=>e.documentId===selection.documentId&&e.persistentId===context.persistentId);
  function start(e,axis){
    if(busy||!rect||!context.current()||e.button!==0||!e.isPrimary||active.current)return;
    const handle=controller.begin(selection,{axis,occupiedPx:axis==='width'?rect.width:rect.height,bodyPx:axis==='width'?rect.bodyWidth:rect.bodyHeight,originPx:axis==='width'?e.clientX:e.clientY});
    if(!handle)return;
    e.preventDefault();e.currentTarget.focus({preventScroll:true});
    try{e.currentTarget.setPointerCapture(e.pointerId);}catch{return;}
    active.current={handle,axis,id:e.pointerId,node:e.currentTarget};
  }
  function move(e){
    const g=active.current;if(!g||g.id!==e.pointerId)return;
    const preview=controller.preview(g.handle,g.axis==='width'?e.clientX:e.clientY);
    if(preview)setGhost({axis:g.axis,...preview});
  }
  function finish(e){
    const g=active.current;if(!g||g.id!==e.pointerId)return;
    const result=controller.finish(g.handle,g.axis==='width'?e.clientX:e.clientY);
    cancel();if(result)setDraft(result);
  }
  const clear=axis=>{if(controller.clear(selection,axis,draft.version))update();};
  return <section className="paper-area-lab" id="paper-area-lab" aria-label="個別占有領域の試験編集">
    <header><h3>個別占有領域（試験）</h3><button type="button" id="paper-area-close" onClick={onClose}>閉じる</button></header>
    <p className="workspace-hint">右端・下端をドラッグして最小占有率を指定します。文字を縮小せず、余白を確保します。この画面は試験用で、閉じると指定を破棄します。</p>
    <div className="paper-area-lab-toolbar">
      <span>横：{entry?.minWidthPercent?entry.minWidthPercent+'%':'自動'}</span><button type="button" disabled={busy||!entry?.minWidthPercent} onClick={()=>clear('width')}>横を自動</button>
      <span>縦：{entry?.minHeightPercent?entry.minHeightPercent+'%':'自動'}</span><button type="button" disabled={busy||!entry?.minHeightPercent} onClick={()=>clear('height')}>縦を自動</button>
      <button type="button" disabled={busy||!draft.canUndo} onClick={()=>setDraft(controller.undo(draft.version))}>元に戻す</button>
      <button type="button" disabled={busy||!draft.canRedo} onClick={()=>setDraft(controller.redo(draft.version))}>やり直す</button>
    </div>
    <p id="paper-area-status" role="status">{status}{ghost?' · '+ghost.value+'%':''}</p>
    <div className="paper-area-lab-scroll" onScroll={()=>{if(active.current)cancel();}}>
      <div ref={surface} className="paper-area-lab-surface">
        <div ref={mount} id="paper-area-preview"/>
        {rect&&<div ref={frame} className="paper-area-lab-frame" style={{left:rect.left,top:rect.top,width:ghost?.axis==='width'?ghost.extentPx:rect.width,height:ghost?.axis==='height'?ghost.extentPx:rect.height}} data-ghost={!!ghost}>
          {['width','height'].map(axis=><button key={axis} type="button" id={'paper-area-handle-'+axis} className={'paper-area-handle '+axis} aria-label={axis==='width'?'横の最小占有率を調整':'縦の最小占有率を調整'} disabled={busy} onPointerDown={e=>start(e,axis)} onPointerMove={move} onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={()=>{if(active.current)cancel();}}/>)}
        </div>}
      </div>
    </div>
  </section>;
}
