import React,{useLayoutEffect,useRef,useState} from 'react';

// Zoom only the frozen preview host, not the engine's layout or physical units.
// Keep the selected page in view when the viewport size or magnification changes.
export function usePaperViewport(target,enabled,activePage,ready){
  const [mode,setMode]=useState('100'),[guides,setGuides]=useState(true),[percent,setPercent]=useState(100);
  const activeRef=useRef(activePage);activeRef.current=activePage;
  useLayoutEffect(()=>{
    const viewport=target.current;if(!viewport)return;
    let previousHost=null,previousScale=null;
    function apply(){
      const host=viewport.firstElementChild;if(!host)return;
      const pages=[...host.shadowRoot?.querySelectorAll('[data-page]')??[]];
      if(!pages.length)return;
      const style=getComputedStyle(viewport);
      const availableWidth=viewport.clientWidth-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0)-16;
      const availableHeight=viewport.clientHeight-(parseFloat(style.paddingTop)||0)-(parseFloat(style.paddingBottom)||0)-20;
      let scale=enabled?Number(mode)/100:1;
      if(enabled&&(mode==='width'||mode==='page')){
        const width=Math.max(...pages.map(p=>p.offsetWidth));
        const height=Math.max(...pages.map(p=>p.offsetHeight+(parseFloat(getComputedStyle(p).marginBottom)||0)));
        scale=Math.max(.1,Math.min(1,availableWidth>0?availableWidth/width:1,mode==='page'&&availableHeight>0?availableHeight/height:1));
      }
      const changed=previousHost!==host||previousScale!==scale;
      host.style.zoom=String(scale);
      host.style.width=enabled?'max-content':'';
      viewport.dataset.paperZoom=String(scale);
      for(const guide of host.shadowRoot.querySelectorAll('[data-content-guide]'))guide.style.visibility=enabled&&!guides?'hidden':'';
      setPercent(Math.round(scale*100));
      if(enabled&&changed&&ready){
        const node=pages[Math.min(activeRef.current-1,pages.length-1)];
        if(node)viewport.scrollTop+=node.getBoundingClientRect().top-viewport.getBoundingClientRect().top-8;
      }
      previousHost=host;previousScale=scale;
    }
    apply();
    const mutation=new MutationObserver(apply);mutation.observe(viewport,{childList:true});
    const resize=new ResizeObserver(apply);resize.observe(viewport);
    return ()=>{mutation.disconnect();resize.disconnect();};
  },[target,enabled,mode,guides,ready]);
  return {mode,setMode,guides,setGuides,percent};
}
export function PaperViewControls({view}){
  return <div className="layout-view-tools"><label>表示倍率<select id="layout-zoom" value={view.mode} onChange={e=>view.setMode(e.target.value)}>{['50','75','100','125','150','200','width','page'].map(v=><option key={v} value={v}>{v==='width'?'幅に合わせる':v==='page'?'ページ全体':v+'%'}</option>)}</select></label><output id="layout-zoom-value" aria-live="polite">{view.percent}%</output><label><input id="layout-guides" type="checkbox" checked={view.guides} onChange={e=>view.setGuides(e.target.checked)}/>余白ガイド</label></div>;
}
// Geometry-only overview: no duplicate text, image assets or interactive page DOM.
export function paperThumbnail(page,fragments){
  const width=parseFloat(page.style.width),height=parseFloat(page.style.height);
  if(!(width>0&&height>0))return null;
  const direct=fragments?fragments.filter(node=>node.parentNode===page):[...page.querySelectorAll(':scope > [data-block]')];
  const boxes=direct.slice(0,60).map(node=>({x:parseFloat(node.style.left),y:parseFloat(node.style.top),w:parseFloat(node.style.width),h:parseFloat(node.style.height)})).filter(b=>Object.values(b).every(Number.isFinite)&&b.w>0&&b.h>0);
  return {width,height,boxes};
}
export function PaperThumbnail({shape}){
  if(!shape)return null;
  return <svg className="layout-thumbnail" viewBox={'0 0 '+shape.width+' '+shape.height} aria-hidden="true"><rect width={shape.width} height={shape.height} fill="#fff"/>{shape.boxes.map((b,i)=><rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill="#b7c9d6" stroke="#829fb4" strokeWidth={Math.max(1,shape.width/400)}/>)}</svg>;
}
