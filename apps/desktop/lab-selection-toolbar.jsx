import React from 'react';

// All mutations go through the caller's existing draft history and validation.
// This toolbar is a view of the selected node, not an independent style store.
export function LabSelectionToolbar({node,draft,fontOptions,disabled,canDuplicate,canRemove,canMoveBack,canMoveForward,locked,inheritedLock,onLock,onDuplicate,onRemove,onMove,onStyle,onFont,onEditText,onPrecision,canEditText,alignmentCount,onAlign}){
  const type=node?.type;
  const text=['content','label','dynamic','slot'].includes(type);
  const style=type==='content'?draft:node;
  const colorKey=type==='content'?'textColor':type==='group'?'background':'color';
  const names={content:'本文',label:'固定文字',dynamic:'動的文字',slot:'原稿スロット',rect:'矩形',group:'グループ',image:'画像'};
  const font=style?.font,weights=fontOptions.find(f=>f.id===font?.id)?.weights??[];
  const changeSize=delta=>onStyle({fontSize:Math.max(2000,Math.min(30000,style.fontSize+delta))});
  const styleDisabled=disabled||locked;
  return <div className="lab-selection-toolbar" role="toolbar" aria-label="選択要素の操作" data-selection-kind={type??'none'}>
    <span className="lab-toolbar-kind">{names[type]??'未選択'}</span>
    {text&&<>
      <select id="lab-quick-font" aria-label="フォント" value={font?.id??''} disabled={styleDisabled} onChange={e=>{const f=fontOptions.find(f=>f.id===e.target.value);onFont(f?{id:f.id,weight:f.weights.includes(400)?400:f.weights[0]}:null);}}>
        <option value="">既定のフォント</option>{fontOptions.map(f=><option key={f.id} value={f.id} disabled={f.disabled}>{f.label}</option>)}
      </select>
      {font&&<select id="lab-quick-weight" aria-label="太さ" value={font.weight} disabled={styleDisabled} onChange={e=>onFont({...font,weight:Number(e.target.value)})}>{weights.map(w=><option key={w} value={w}>{w}</option>)}</select>}
      <div className="lab-quick-size" role="group" aria-label="文字サイズ">
        <button id="lab-quick-size-down" type="button" title="文字を小さく" aria-label="文字を小さく" disabled={styleDisabled||style.fontSize<=2000} onClick={()=>changeSize(-500)}>−</button>
        <output id="lab-quick-size">{(style.fontSize*72/25400).toFixed(1)} pt</output>
        <button id="lab-quick-size-up" type="button" title="文字を大きく" aria-label="文字を大きく" disabled={styleDisabled||style.fontSize>=30000} onClick={()=>changeSize(500)}>＋</button>
      </div>
    </>}
    {(text||type==='rect'||type==='group')&&<label className="lab-quick-color">{type==='group'?'背景':'色'}<input id="lab-quick-color" type="color" aria-label={type==='group'?'背景色':'色'} value={style[colorKey]} disabled={styleDisabled} onChange={e=>onStyle({[colorKey]:e.target.value})}/></label>}
    {type==='label'&&<button id="lab-direct-text-open" type="button" disabled={styleDisabled||!canEditText} onClick={onEditText}>文字編集</button>}
    {type==='image'&&<select id="lab-quick-image-fit" aria-label="画像の表示方式" value={node.fit} disabled={styleDisabled} onChange={e=>onStyle({fit:e.target.value})}><option value="contain">全体表示</option><option value="cover">枠を埋める</option></select>}
    {alignmentCount>=2&&<select id="lab-quick-align" aria-label="選択要素の整列" value="" disabled={styleDisabled} onChange={e=>{if(e.target.value)onAlign(e.target.value);}}>
      <option value="">整列</option>{[['left','左揃え'],['center','左右中央'],['right','右揃え'],['top','上揃え'],['middle','上下中央'],['bottom','下揃え'],['distribute-x','横均等配置'],['distribute-y','縦均等配置']].map(([mode,label])=><option key={mode} value={mode} disabled={mode.startsWith('distribute-')&&alignmentCount<3}>{label}</option>)}
    </select>}
    <span className="lab-toolbar-separator" aria-hidden="true"/>
    <button type="button" id="lab-quick-back" title="配置順を一つ前へ" aria-label="配置順を一つ前へ" disabled={styleDisabled||!canMoveBack} onClick={()=>onMove(-1)}>←</button>
    <button type="button" id="lab-quick-forward" title="配置順を一つ後へ" aria-label="配置順を一つ後へ" disabled={styleDisabled||!canMoveForward} onClick={()=>onMove(1)}>→</button>
    <button type="button" id="lab-quick-duplicate" disabled={styleDisabled||!canDuplicate} onClick={onDuplicate}>複製</button>
    <button type="button" id="lab-quick-remove" disabled={styleDisabled||!canRemove} onClick={onRemove}>削除</button>
    <button type="button" id="lab-quick-lock" disabled={disabled||!node||inheritedLock} aria-pressed={locked} onClick={onLock}>{locked?'ロック解除':'ロック'}</button>
    <button type="button" id="lab-quick-precision" disabled={disabled} onClick={onPrecision}>精密調整</button>
  </div>;
}
