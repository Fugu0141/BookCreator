import React,{useRef,useState,useEffect} from 'react';

import {spacingLimit,stepSpacing} from './lab-spacing.mjs';
function SpacingSlider({id,label,value,max,disabled,onCommit}){
  const pointer=useRef(null),[draft,setDraft]=useState(null);
  useEffect(()=>{pointer.current=null;setDraft(null);},[value,max,disabled]);
  const shown=draft??value;
  function finish(commit){
    const active=pointer.current;
    pointer.current=null;setDraft(null);
    if(commit&&active&&active.value!==value&&!disabled)onCommit(active.value);
  }
  function change(e){
    const next=Number(e.target.value);
    if(pointer.current){pointer.current.value=next;setDraft(next);}
    else onCommit(next);
  }
  return <div className="lab-spacing-control">
    <label htmlFor={id}>{label}</label>
    <div className="lab-spacing-slider">
      <button type="button" aria-label={label+'を狭く'} disabled={disabled||shown<=0} onClick={()=>onCommit(stepSpacing(value,-1,max))}>−</button>
      <input id={id} type="range" min={0} max={max} step={1} value={shown} disabled={disabled}
        aria-valuetext={(shown/1000).toFixed(1)+' mm'} onChange={change}
        onPointerDown={e=>{if(e.button!==0||disabled)return;pointer.current={id:e.pointerId,value};try{e.currentTarget.setPointerCapture(e.pointerId);}catch{}}}
        onPointerUp={()=>finish(true)} onLostPointerCapture={()=>finish(true)} onPointerCancel={()=>finish(false)}
        onBlur={()=>finish(true)} onKeyDown={e=>{if(e.key==='Escape'&&pointer.current){e.preventDefault();e.stopPropagation();finish(false);return;}if(['ArrowLeft','ArrowDown','ArrowRight','ArrowUp'].includes(e.key)&&!pointer.current){e.preventDefault();e.stopPropagation();onCommit(stepSpacing(value,['ArrowLeft','ArrowDown'].includes(e.key)?-1:1,max));}}}/>
      <button type="button" aria-label={label+'を広く'} disabled={disabled||shown>=max} onClick={()=>onCommit(stepSpacing(value,1,max))}>＋</button>
      <output htmlFor={id}>{(shown/1000).toFixed(1)} mm</output>
    </div>
    <div className="lab-spacing-illustration" aria-hidden="true">
      <span/><i style={{width:Math.min(80,4+shown/250)+'px'}}/><span/>
    </div>
  </div>;
}
export function LabSpacingControls({scope,value,availableWidth,availableHeight,disabled,onChange}){
  const paddingMax=spacingLimit(value.padding,Math.min(availableWidth,availableHeight)/2);
  const gapMax=spacingLimit(value.gap,value.direction==='row'?availableWidth:availableHeight);
  return <div className="lab-spacing-controls" aria-label="余白と間隔の簡易調整">
    <strong>{scope}の余白・間隔</strong>
    <div className="lab-spacing-grid">
      <SpacingSlider id="lab-visual-padding" label="内側余白" value={value.padding} max={paddingMax} disabled={disabled} onCommit={padding=>onChange({padding})}/>
      {value.direction!=='canvas'&&<SpacingSlider id="lab-visual-gap" label="要素の間隔" value={value.gap} max={gapMax} disabled={disabled} onCommit={gap=>onChange({gap})}/>}
    </div>
  </div>;
}
