import React from 'react';
import {describeBookPaperProperties} from './book-paper-properties.mjs';
const mm=n=>n/1000+' mm';
const percent=n=>n===null?'自動':n+'%';
const modes={automatic:'自動配置',fixed:'固定位置',preferred:'希望位置',group:'グループ配置'};
const groupNames={vertical:'縦並び',rows:'横並び',adaptiveRows:'自動行配置'};
export function BookPaperProperties({candidate,label,tool,canArea,canMove,canPrefer,blocked,onArea,onMove,onPrefer}){
  const p=describeBookPaperProperties(candidate);
  if(!p)return null;
  return <section id="book-paper-properties" className="book-paper-properties" aria-label="選択部品の配置プロパティ" data-placement-mode={p.mode}>
    <h2>部品プロパティ</h2><p className="book-property-label">{label}</p>
    <div className="book-property-section"><h3>配置方式</h3><strong>{modes[p.mode]}</strong>
      {p.group&&<small>{groupNames[p.group.layout]??p.group.layout}</small>}
      {p.preferred&&<small>希望 {p.preferred.position.page+1}ページ · X {mm(p.preferred.position.x)} / Y {mm(p.preferred.position.y)} · 許容 ±{mm(p.preferred.tolerance.x)} / ±{mm(p.preferred.tolerance.y)} · {p.preference==='honored'?'希望範囲内':'通常配置に戻りました'}</small>}
    </div>
    <div className="book-property-section"><h3>実測位置</h3><small>{p.page}ページ · 本文左上基準</small><dl><dt>X</dt><dd>{mm(p.x)}</dd><dt>Y</dt><dd>{mm(p.y)}</dd></dl>
      {!tool&&<div className="controls">{canMove&&<button id="book-inspector-move" type="button" disabled={blocked} onClick={onMove}>固定位置を指定</button>}{canPrefer&&<button id="book-inspector-preferred" type="button" disabled={blocked} onClick={onPrefer}>{p.mode==='preferred'?'希望位置を変更':'希望位置を指定'}</button>}</div>}
    </div>
    <div className="book-property-section"><h3>サイズ・余白</h3><small>保存済みの最小占有率</small><dl><dt>横</dt><dd>{percent(p.savedWidth)}</dd><dt>縦</dt><dd>{percent(p.savedHeight)}</dd><dt>前余白</dt><dd>{mm(p.before)}</dd><dt>後余白</dt><dd>{mm(p.after)}</dd></dl><small>実測占有領域：{mm(p.occupiedWidth)} × {mm(p.occupiedHeight)}</small>
      {!tool&&canArea&&<button id="book-inspector-area" type="button" disabled={blocked} onClick={onArea}>サイズ・余白を調整</button>}
    </div>
    {tool&&<small role="status">編集案は紙面上で確認し、明示的に保存してください。</small>}
  </section>;
}
