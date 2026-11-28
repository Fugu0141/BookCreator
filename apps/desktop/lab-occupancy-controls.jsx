import React,{useState,useRef,useEffect} from 'react';

// Zero is the editor's natural-height choice; the saved definition omits it.
export function LabOccupancyControls({percent,pageHeight,measuredHeight,disabled,onChange}){
  const pointer=useRef(null),[draft,setDraft]=useState(null);
  useEffect(()=>{pointer.current=null;setDraft(null);},[percent,pageHeight,disabled]);
  const shown=draft??percent;
  const minimum=Math.ceil(pageHeight*shown/100);
  const finish=commit=>{
    const active=pointer.current;pointer.current=null;setDraft(null);
    if(commit&&active&&active.value!==percent&&!disabled)onChange(active.value);
  };
  const change=e=>{
    const next=Number(e.target.value);
    if(pointer.current){pointer.current.value=next;setDraft(next);}
    else onChange(next);
  };
  return <div className="lab-occupancy-controls" aria-label="部品全体の占有領域">
    <div className="lab-occupancy-figure" aria-hidden="true"><div className="lab-occupancy-paper"><div style={{height:Math.max(shown,5)+'%'}}/></div></div>
    <div className="lab-occupancy-fields">
      <label htmlFor="lab-occupancy-height">縦の最小占有率 <output id="lab-occupancy-value">{shown===0?'自動':shown+'%'}</output></label>
      <input id="lab-occupancy-height" type="range" min="0" max="100" step="1" value={shown} disabled={disabled}
        aria-valuetext={shown===0?'自動':shown+'%（'+(minimum/1000).toFixed(1)+' mm）'}
        onChange={change}
        onPointerDown={e=>{if(e.button!==0||disabled)return;pointer.current={value:percent};try{e.currentTarget.setPointerCapture(e.pointerId);}catch{}}}
        onPointerUp={()=>finish(true)} onLostPointerCapture={()=>finish(true)} onPointerCancel={()=>finish(false)} onBlur={()=>finish(true)}
        onKeyDown={e=>{if(e.key==='Escape'&&pointer.current){e.preventDefault();e.stopPropagation();finish(false);}}}/>
      <div className="lab-occupancy-presets">{[0,25,50,75,100].map(v=><button key={v} type="button" data-lab-occupancy-preset={v} aria-pressed={percent===v} disabled={disabled} onClick={()=>onChange(v)}>{v===0?'自動':v+'%'}</button>)}</div>
      <small id="lab-occupancy-minimum">{shown===0?'内容に合わせる':'最低 '+(minimum/1000).toFixed(1)+' mm'}{Number.isFinite(measuredHeight)?' ／ 実測 '+(measuredHeight/1000).toFixed(1)+' mm':''}</small>
      <small>本文領域の高さが基準。文字や図形を拡大せず、必要な空きを下に確保します。内容が多い場合は自動で広がります。</small>
    </div>
  </div>;
}
