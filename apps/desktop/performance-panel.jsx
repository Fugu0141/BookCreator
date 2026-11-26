import React,{useEffect,useRef,useState} from 'react';
import {performanceMetrics,summarizePerformance} from './performance-metrics.mjs';
import {previewPhaseMetrics,summarizePreviewPhases,phaseKeys} from './preview-phase-metrics.mjs';
const phaseLabels={validationMs:'入力検証',imagesMs:'画像準備',measurementMs:'実測',paginationMs:'ページ割付',renderingMs:'DOM生成',presentationMs:'紙面表示準備・交換'};
const stageNames={measurement:'実測レーン',layout:'組版要求',read:'読取'};
const categoryNames={manuscript:'選択原稿',book:'全冊',component:'部品',paragraph:'段落',catalog:'カタログ',source:'原稿',image:'画像',other:'その他'};
const ms=v=>v===null?'—':v.toFixed(1);
const mib=v=>(v/1024).toFixed(1)+' MiB';
export function PerformancePanel({readMemory,readCache,cacheEnabled,onCacheEnabled,cacheBlocked,onClose}){
  const [rows,setRows]=useState(()=>performanceMetrics.snapshot());
  const [phaseRows,setPhaseRows]=useState(()=>previewPhaseMetrics.snapshot());
  const [cache,setCache]=useState(()=>readCache());
  const [memory,setMemory]=useState(null),[phase,setPhase]=useState('pending');
  const request=useRef(0);
  async function refresh(){
    const job=++request.current;
    setRows(performanceMetrics.snapshot());setPhaseRows(previewPhaseMetrics.snapshot());setCache(readCache());setPhase('pending');
    try{
      const value=await readMemory();
      if(job!==request.current)return;
      setMemory(value);setPhase('ready');
    }catch{
      if(job!==request.current)return;
      setMemory(null);setPhase('error');
    }
  }
  useEffect(()=>{void refresh();return ()=>{request.current++;};},[]);
  const summary=summarizePerformance(rows);
  const phaseSummary=summarizePreviewPhases(phaseRows);
  return <section id="performance-panel" className="performance-panel" aria-label="性能計測">
    <header><strong>性能計測（端末内のみ）</strong><div><button id="performance-refresh" type="button" onClick={()=>void refresh()}>更新</button><button id="performance-clear" type="button" onClick={()=>{performanceMetrics.clear();previewPhaseMetrics.clear();setRows([]);setPhaseRows([]);}}>記録を消去</button><button id="performance-close" type="button" onClick={onClose}>閉じる</button></div></header>
    <p className="muted">直近 {rows.length} / 200 件。成功時の中央値・最大値（ms）。組版要求には入力合流時間を含みません。実測・読取は組版要求の内訳と重なるため合算しないでください。</p>
    <div className="performance-table-wrap"><table id="performance-summary"><thead><tr><th>処理</th><th>成功</th><th>失敗</th><th>取消</th><th>待機 中央値</th><th>処理 中央値</th><th>処理 最大</th><th>再試行</th></tr></thead><tbody>{summary.map(g=><tr key={g.stage+':'+g.category} data-stage={g.stage} data-category={g.category} data-success={g.success}><th>{stageNames[g.stage]} / {categoryNames[g.category]}</th><td>{g.success}</td><td>{g.failed}</td><td>{g.cancelled}</td><td>{ms(g.medianWaitMs)}</td><td>{ms(g.medianRunMs)}</td><td>{ms(g.maxRunMs)}</td><td>{g.retries}</td></tr>)}</tbody></table></div>
    {!rows.length&&<p className="muted">組版操作後に更新すると計測結果を確認できます。</p>}
    <p className="muted">紙面更新成功時の段階別性能（直近 {phaseRows.length} / 200 件、中央値 ms）。キャッシュ有無・組版範囲別。描画はDOM生成と表示準備・交換までで、ブラウザーの実際のpaintは含みません。上の組版要求・実測レーンと重複するため合算しないでください。</p>
    <div className="performance-table-wrap"><table id="performance-phase-summary"><thead><tr><th>範囲 / キャッシュ</th><th>件数</th>{phaseKeys.map(k=><th key={k}>{phaseLabels[k]}</th>)}</tr></thead><tbody>{phaseSummary.map(g=><tr key={g.scope+':'+g.cacheEnabled} data-scope={g.scope} data-cache-enabled={String(g.cacheEnabled)} data-count={g.count} data-latest={JSON.stringify(g.latest)}><th>{categoryNames[g.scope]} / {g.cacheEnabled?'有効':'無効'}</th><td>{g.count}</td>{phaseKeys.map(k=><td key={k}>{ms(g.median[k])}</td>)}</tr>)}</tbody></table></div>
    <div id="performance-cache" data-hits={cache.hits} data-misses={cache.misses} data-entries={cache.entries}><label><input id="performance-cache-enabled" type="checkbox" checked={cacheEnabled} disabled={cacheBlocked} onChange={e=>{onCacheEnabled(e.target.checked);setCache(readCache());}}/>通常テキストの実測結果を再利用</label> ／ 再利用 {cache.hits} 件・新規実測 {cache.misses} 件・保持 {cache.entries} 件（{cache.characters} UTF-16コード単位・{cache.lines} 行）</div>
    <div id="performance-memory" data-phase={phase}>{phase==='ready'&&memory?<>プロセスの作業セット（取得時点）：Main {mib(memory.browserKiB)} ／ Renderer {mib(memory.rendererKiB)} ／ その他 {mib(memory.otherKiB)}（{memory.processes} プロセス）</>:phase==='error'?'メモリ情報を取得できませんでした。':'メモリ情報を取得中…'}</div>
    <small>共有メモリの重複を含み得る概算です。記録はアプリの再起動で消え、性能記録に原稿・書籍名・ファイルパスは含めません。実測キャッシュは原稿の一部を端末内メモリにのみ保持し、書籍切替・ホーム移動・フォント登録時に解放します。</small>
  </section>;
}
