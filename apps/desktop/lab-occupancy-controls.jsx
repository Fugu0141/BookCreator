import React,{useState,useRef,useEffect} from 'react';

// A slider gesture commits exactly once; the preview diagram follows immediately.
function PercentSlider({id,label,value,min,max,disabled,onChange,format,presets}){
  const pointer=useRef(null),[draft,setDraft]=useState(null);
  useEffect(()=>{pointer.current=null;setDraft(null);},[value,disabled]);
  const shown=draft??value;
  const finish=commit=>{
    const active=pointer.current;pointer.current=null;setDraft(null);
    if(commit&&active&&active.value!==value&&!disabled)onChange(active.value);
  };
  function change(e){
    const next=Number(e.target.value);
    if(pointer.current){pointer.current.value=next;setDraft(next);}else onChange(next);
  }
  return <div className="lab-occupancy-axis">
    <label htmlFor={id}>{label}<output id={id+'-value'}>{format(shown)}</output></label>
    <input id={id} type="range" min={min} max={max} step="1" value={shown} disabled={disabled} aria-valuetext={format(shown)}
      onChange={change} onPointerDown={e=>{if(e.button!==0||disabled)return;pointer.current={value};try{e.currentTarget.setPointerCapture(e.pointerId);}catch{}}}
      onPointerUp={()=>finish(true)} onLostPointerCapture={()=>finish(true)} onPointerCancel={()=>finish(false)} onBlur={()=>finish(true)}
      onKeyDown={e=>{if(e.key==='Escape'&&pointer.current){e.preventDefault();e.stopPropagation();finish(false);}}}/>
    <div className="lab-occupancy-presets">{presets.map(v=><button key={v} type="button" data-lab-occupancy-axis={id} data-lab-occupancy-preset={v} aria-pressed={value===v} disabled={disabled} onClick={()=>onChange(v)}>{v===0?'自動':v+'%'}</button>)}</div>
  </div>;
}
export function LabOccupancyControls({widthPercent,heightPercent,pageWidth,pageHeight,measuredHeight,disabled,onWidthChange,onHeightChange}){
  const minimum=Math.ceil(pageHeight*heightPercent/100);
  return <div className="lab-occupancy-controls" aria-label="部品全体の占有領域">
    <div className="lab-occupancy-figure" aria-hidden="true"><div className="lab-occupancy-paper"><div style={{width:widthPercent+'%',height:Math.max(heightPercent,5)+'%'}}/></div></div>
    <div className="lab-occupancy-fields">
      <PercentSlider id="lab-occupancy-width" label="横の占有率" value={widthPercent} min={1} max={100} disabled={disabled} onChange={onWidthChange} format={v=>v+'%'} presets={[25,50,75,100]}/>
      <PercentSlider id="lab-occupancy-height" label="縦の最小占有率" value={heightPercent} min={0} max={100} disabled={disabled} onChange={onHeightChange} format={v=>v===0?'自動':v+'%'} presets={[0,25,50,75,100]}/>
      <small id="lab-occupancy-minimum">幅 {(pageWidth*widthPercent/100000).toFixed(1)} mm ／ {heightPercent===0?'高さは自動':'最低 '+(minimum/1000).toFixed(1)+' mm'}{Number.isFinite(measuredHeight)?' ／ 実測高さ '+(measuredHeight/1000).toFixed(1)+' mm':''}</small>
      <small>本文領域が基準。横幅に応じて文字は折り返し、縦は文字や図形を引き伸ばさず下に空きを確保します。</small>
    </div>
  </div>;
}
