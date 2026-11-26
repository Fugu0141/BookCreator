import React,{useLayoutEffect,useState} from 'react';

// View-only zoom, applied after layout measurement to the preview host.
// Native CSS zoom changes scrollable size as well as pointer hit-testing.
// Canvas interaction already derives its scale from the measured bounding rect.
export function useLabViewport(target,frozen=false){
  const [mode,setMode]=useState('100'),[percent,setPercent]=useState(100);
  useLayoutEffect(()=>{
    const viewport=target.current;
    if(!viewport||frozen)return;
    function apply(){
      const host=viewport.firstElementChild;
      let scale=mode==='fit'?1:Number(mode)/100;
      if(host){
        if(mode==='fit'){
          const pages=[...host.shadowRoot?.querySelectorAll('[data-page]')??[]];
          const width=Math.max(0,...pages.map(page=>{
            const style=getComputedStyle(page);
            return page.offsetWidth+(parseFloat(style.marginLeft)||0)+(parseFloat(style.marginRight)||0);
          }));
          const style=getComputedStyle(viewport);
          const available=viewport.clientWidth-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0)-16;
          if(width>0&&available>0)scale=Math.max(.25,Math.min(1,available/width));
        }
        host.style.zoom=String(scale);
        host.style.width='max-content';
      }
      viewport.dataset.zoom=String(scale);
      setPercent(Math.round(scale*100));
    }
    apply();
    const mutation=new MutationObserver(apply);
    mutation.observe(viewport,{childList:true});
    const resize=new ResizeObserver(apply);
    resize.observe(viewport);
    return ()=>{mutation.disconnect();resize.disconnect();};
  },[target,mode,frozen]);
  return {mode,setMode,percent};
}
export function LabViewportControls({id,view,disabled=false}){
  return <div className="lab-zoom-controls"><label htmlFor={id+'-zoom'}>表示倍率</label><select id={id+'-zoom'} value={view.mode} disabled={disabled} onChange={e=>view.setMode(e.target.value)}>{['50','75','100','125','150','200','fit'].map(value=><option key={value} value={value}>{value==='fit'?'幅に合わせる':value+'%'}</option>)}</select><output id={id+'-zoom-value'} aria-live="polite">{view.percent}%</output></div>;
}
