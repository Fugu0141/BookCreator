import React,{useState,useEffect,useRef} from 'react';

function AreaSlider({id,label,value,min,max,disabled,onCommit,format}){
  const [draft,setDraft]=useState(null),gesture=useRef(null);
  useEffect(()=>{gesture.current=null;setDraft(null);},[value,disabled]);
  function finish(commit){
    const g=gesture.current;gesture.current=null;setDraft(null);
    if(commit&&g&&g.value!==value&&!disabled)onCommit(g.value);
  }
  return <div className="lab-area-slider">
    <label htmlFor={id}>{label}<output htmlFor={id}>{format(draft??value)}</output></label>
    <input id={id} type="range" min={min} max={max} step="1" value={draft??value} disabled={disabled}
      aria-valuetext={format(draft??value)}
      onPointerDown={e=>{if(e.button!==0||disabled)return;gesture.current={value,id:e.pointerId};try{e.currentTarget.setPointerCapture(e.pointerId);}catch{gesture.current=null;}}}
      onChange={e=>{const v=Number(e.target.value);if(gesture.current){gesture.current.value=v;setDraft(v);}else onCommit(v);}}
      onPointerUp={e=>{if(gesture.current?.id===e.pointerId)finish(true);}} onLostPointerCapture={e=>{if(gesture.current?.id===e.pointerId)finish(false);}} onPointerCancel={e=>{if(gesture.current?.id===e.pointerId)finish(false);}}
      onKeyDown={e=>{if(e.key==='Escape'&&gesture.current){e.preventDefault();e.stopPropagation();finish(false);}}}/>
  </div>;
}
export function ComponentAreaControls({value,width,height,disabled,onChange}){
  const w=value.widthPercent??100,h=value.minHeightPercent??0;
  return <div className="lab-component-area-controls">
    <svg viewBox="0 0 100 82" aria-hidden="true" className="lab-area-mini">
      <rect x="7" y="2" width="86" height="78" rx="2" fill="white" stroke="#cbd5e1"/>
      <rect x="14" y="9" width="72" height="64" fill="none" stroke="#94a3b8" strokeDasharray="2 2"/>
      <rect x="14" y="9" width={72*w/100} height={Math.max(10,64*h/100)} fill="#dcecff" stroke="#3478b7"/>
      <path d="M17 13h3v5h-3z" fill="#3478b7"/>
      <path d={`M23 14h${Math.max(0,72*w/100-12)}`} stroke="#7894ad"/>
    </svg>
    <div className="lab-component-area-settings">
      <AreaSlider id="lab-width-percent" label="横の占有率" value={w} min={1} max={100} disabled={disabled} format={v=>v+'%'} onCommit={widthPercent=>onChange({widthPercent})}/>
      <div className="lab-area-presets" role="group" aria-label="横幅のプリセット">{[50,75,100].map(v=><button key={v} type="button" disabled={disabled} aria-pressed={w===v} onClick={()=>onChange({widthPercent:v})}>{v}%</button>)}</div>
      <AreaSlider id="lab-height-percent" label="縦の最小占有率" value={h} min={0} max={100} disabled={disabled} format={v=>v===0?'自動':v+'%'} onCommit={minHeightPercent=>onChange({minHeightPercent})}/>
      <div className="lab-area-presets" role="group" aria-label="高さのプリセット">{[0,25,50,100].map(v=><button key={v} type="button" disabled={disabled} aria-pressed={h===v} onClick={()=>onChange({minHeightPercent:v})}>{v===0?'自動':v+'%'}</button>)}</div>
      <small>横幅 約{(width*w/100000).toFixed(1)} mm · 最小高さ {h===0?'自動':(height*h/100000).toFixed(1)+' mm'}</small>
      <small>紙面の青い枠の右端・下端をドラッグでも調整できます。文字は拡大しません。</small>
    </div>
  </div>;
}
