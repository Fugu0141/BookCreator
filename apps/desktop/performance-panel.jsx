import React,{useEffect,useRef,useState} from 'react';
import {performanceMetrics,summarizePerformance} from './performance-metrics.mjs';
import {previewPhaseMetrics,summarizePreviewPhases,phaseKeys} from './preview-phase-metrics.mjs';
import {editPreviewMetrics,summarizeEditPreviewMetrics} from './edit-preview-metrics.mjs';
const editModeNames={full:'完全組版',partial:'部分更新',sparse:'生成省略',retained:'保持型',fallback:'完全組版へ復帰'};
const phaseLabels={validationMs:'入力検証',imagesMs:'画像準備',measurementMs:'実測',paginationMs:'ページ割付',renderingMs:'DOM生成',presentationMs:'紙面表示準備・交換'};
const stageNames={measurement:'実測レーン',layout:'組版要求',read:'読取'};
const categoryNames={manuscript:'選択原稿',book:'全冊',component:'部品',paragraph:'段落',catalog:'カタログ',source:'原稿',image:'画像',other:'その他'};
const ms=v=>v===null?'—':v.toFixed(1);
const mib=v=>(v/1024).toFixed(1)+' MiB';
export function PerformancePanel({retainedPreview,onRetainedPreview,sparsePaperPages,onSparsePaperPages,reusePaperPages,onReusePaperPages,readMemory,readCache,cacheEnabled,onCacheEnabled,readMathCaches,mathCacheEnabled,onMathCacheEnabled,readParagraphCache,paragraphCacheEnabled,onParagraphCacheEnabled,readPageCache,pageCacheEnabled,onPageCacheEnabled,cacheBlocked,onClose}){
  const [rows,setRows]=useState(()=>performanceMetrics.snapshot());
  const [phaseRows,setPhaseRows]=useState(()=>previewPhaseMetrics.snapshot());
  const [editRows,setEditRows]=useState(()=>editPreviewMetrics.snapshot());
  const [cache,setCache]=useState(()=>readCache());
  const [mathCaches,setMathCaches]=useState(()=>readMathCaches());
  const [paragraph,setParagraph]=useState(()=>readParagraphCache());
  const [pageCache,setPageCache]=useState(()=>readPageCache());
  const [memory,setMemory]=useState(null),[phase,setPhase]=useState('pending');
  const request=useRef(0);
  async function refresh(){
    const job=++request.current;
    setRows(performanceMetrics.snapshot());setPhaseRows(previewPhaseMetrics.snapshot());setEditRows(editPreviewMetrics.snapshot());setCache(readCache());setMathCaches(readMathCaches());setParagraph(readParagraphCache());setPageCache(readPageCache());setPhase('pending');
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
  const editSummary=summarizeEditPreviewMetrics(editRows);
  return <section id="performance-panel" className="performance-panel" aria-label="性能計測">
    <header><strong>性能計測（端末内のみ）</strong><div><button id="performance-refresh" type="button" onClick={()=>void refresh()}>更新</button><button id="performance-clear" type="button" onClick={()=>{performanceMetrics.clear();previewPhaseMetrics.clear();editPreviewMetrics.clear();setRows([]);setPhaseRows([]);setEditRows([]);}}>記録を消去</button><button id="performance-close" type="button" onClick={onClose}>閉じる</button></div></header>
    <label><input id="performance-retained-preview" type="checkbox" checked={retainedPreview} disabled={cacheBlocked} onChange={e=>onRetainedPreview(e.target.checked)}/>保持型リアルタイム組版（解析・実測・配置・描画、試験機能）</label>
    <label><input id="performance-sparse-paper-pages" type="checkbox" checked={sparsePaperPages} disabled={cacheBlocked} onChange={e=>onSparsePaperPages(e.target.checked)}/>未変更ページのDOM生成を省略（試験機能）</label>
    <label><input id="performance-reuse-paper-pages" type="checkbox" checked={reusePaperPages} disabled={cacheBlocked} onChange={e=>onReusePaperPages(e.target.checked)}/>表示中の未変更ページを維持（試験機能）</label>
    <p className="muted">直近 {rows.length} / 200 件。成功時の中央値・最大値（ms）。組版要求には入力合流時間を含みません。実測・読取は組版要求の内訳と重なるため合算しないでください。</p>
    <div className="performance-table-wrap"><table id="performance-summary"><thead><tr><th>処理</th><th>成功</th><th>失敗</th><th>取消</th><th>待機 中央値</th><th>処理 中央値</th><th>処理 最大</th><th>再試行</th></tr></thead><tbody>{summary.map(g=><tr key={g.stage+':'+g.category} data-stage={g.stage} data-category={g.category} data-success={g.success}><th>{stageNames[g.stage]} / {categoryNames[g.category]}</th><td>{g.success}</td><td>{g.failed}</td><td>{g.cancelled}</td><td>{ms(g.medianWaitMs)}</td><td>{ms(g.medianRunMs)}</td><td>{ms(g.maxRunMs)}</td><td>{g.retries}</td></tr>)}</tbody></table></div>
    {!rows.length&&<p className="muted">組版操作後に更新すると計測結果を確認できます。</p>}
    <p className="muted">紙面更新成功時の段階別性能（直近 {phaseRows.length} / 200 件、中央値 ms）。通常本文・数式・増分段落・ページのキャッシュ有無・部分更新設定と組版範囲別。描画はDOM生成と表示準備・交換までで、ブラウザーの実際のpaintは含みません。上の組版要求・実測レーンと重複するため合算しないでください。</p>
    <div className="performance-table-wrap"><table id="performance-phase-summary"><thead><tr><th>範囲 / キャッシュ</th><th>件数</th>{phaseKeys.map(k=><th key={k}>{phaseLabels[k]}</th>)}</tr></thead><tbody>{phaseSummary.map(g=><tr key={g.scope+':'+g.cacheEnabled+':'+g.mathCacheEnabled+':'+g.paragraphCacheEnabled+':'+g.pageCacheEnabled+':'+g.reusePaperPages+':'+g.sparsePaperPages+':'+g.retainedPreview} data-scope={g.scope} data-cache-enabled={String(g.cacheEnabled)} data-math-cache-enabled={String(g.mathCacheEnabled)} data-paragraph-cache-enabled={String(g.paragraphCacheEnabled)} data-page-cache-enabled={String(g.pageCacheEnabled)} data-reuse-paper-pages={String(g.reusePaperPages)} data-sparse-paper-pages={String(g.sparsePaperPages)} data-retained-preview={String(g.retainedPreview)} data-count={g.count} data-latest={JSON.stringify(g.latest)}><th>{categoryNames[g.scope]} / 本文 {g.cacheEnabled?'有効':'無効'} / 数式 {g.mathCacheEnabled?'有効':'無効'} / 増分 {g.paragraphCacheEnabled?'有効':'無効'} / ページ {g.pageCacheEnabled?'有効':'無効'} / 部分更新 {g.reusePaperPages?'有効':'無効'} / 生成省略 {g.sparsePaperPages?'有効':'無効'} / 保持型 {g.retainedPreview?'有効':'無効'}</th><td>{g.count}</td>{phaseKeys.map(k=><td key={k}>{ms(g.median[k])}</td>)}</tr>)}</tbody></table></div>
    <p className="muted">編集から紙面反映まで（直近 {editRows.length} / 200 件、ms）。可視の自動組版で最後に確定した原稿編集からDOM公開・2回目の描画フレーム機会まで。入力合流時間を含みます。フレーム機会は実際の画素表示を保証しません。取消・非表示・手動組版は対象外です。</p>
    <div className="performance-table-wrap"><table id="performance-edit-summary"><thead><tr><th>範囲 / 組版方式</th><th>件数</th><th>DOM 中央値</th><th>DOM p95</th><th>フレーム 中央値</th><th>フレーム p95</th></tr></thead><tbody>{editSummary.map(g=><tr key={g.scope+':'+g.mode} data-scope={g.scope} data-mode={g.mode} data-count={g.count}><th>{categoryNames[g.scope]} / {editModeNames[g.mode]}</th><td>{g.count}</td><td>{ms(g.dom.median)}</td><td>{ms(g.dom.p95)}</td><td>{ms(g.frame.median)}</td><td>{ms(g.frame.p95)}</td></tr>)}</tbody></table></div>
    <div id="performance-cache" data-hits={cache.hits} data-misses={cache.misses} data-entries={cache.entries}><label><input id="performance-cache-enabled" type="checkbox" checked={cacheEnabled} disabled={cacheBlocked} onChange={e=>{onCacheEnabled(e.target.checked);setCache(readCache());setParagraph(readParagraphCache());}}/>通常テキストの実測結果を再利用</label> ／ 再利用 {cache.hits} 件・新規実測 {cache.misses} 件・保持 {cache.entries} 件（{cache.characters} UTF-16コード単位・{cache.lines} 行）</div>
    <div id="performance-math-cache" data-stats={JSON.stringify(mathCaches)}><label><input id="performance-math-cache-enabled" type="checkbox" checked={mathCacheEnabled} disabled={cacheBlocked} onChange={e=>{onMathCacheEnabled(e.target.checked);setMathCaches(readMathCaches());}}/>数式の解析・寸法結果を再利用</label> ／ 構文 {mathCaches.mathCache.hits} 再利用・{mathCaches.mathCache.entries} 保持 ／ 独立数式 {mathCaches.displayMathCache.hits} 再利用・{mathCaches.displayMathCache.entries} 保持 ／ インライン {mathCaches.inlineMathCache.hits} 再利用・{mathCaches.inlineMathCache.entries} 保持（固定配置 {mathCaches.inlineMathCache.placements}・再試行 {mathCaches.inlineMathCache.placementFallbacks}）</div>
    <div id="performance-paragraph-cache" data-stats={JSON.stringify(paragraph)}><label><input id="performance-paragraph-cache-enabled" type="checkbox" checked={paragraphCacheEnabled} disabled={cacheBlocked} onChange={e=>{onParagraphCacheEnabled(e.target.checked);setParagraph(readParagraphCache());setCache(readCache());}}/>未変更段落の組版結果を再利用（既定ON）</label> ／ 再利用 {paragraph.hits} 件・新規実測 {paragraph.misses} 件・保持 {paragraph.entries} 件（{paragraph.lines} 行）</div>
    <div id="performance-page-cache" data-stats={JSON.stringify(pageCache)}><label><input id="performance-page-cache-enabled" type="checkbox" checked={pageCacheEnabled} disabled={cacheBlocked} onChange={e=>{onPageCacheEnabled(e.target.checked);setPageCache(readPageCache());}}/>未変更ページの描画テンプレートを再利用（試験機能）</label> ／ 再利用 {pageCache.hits} ページ・新規 {pageCache.misses} ページ・対象外 {pageCache.bypasses} ページ・保持 {pageCache.entries} 件（{pageCache.nodes} ノード）</div>
    <div id="performance-memory" data-phase={phase}>{phase==='ready'&&memory?<>プロセスの作業セット（取得時点）：Main {mib(memory.browserKiB)} ／ Renderer {mib(memory.rendererKiB)} ／ その他 {mib(memory.otherKiB)}（{memory.processes} プロセス）</>:phase==='error'?'メモリ情報を取得できませんでした。':'メモリ情報を取得中…'}</div>
    <small>共有メモリの重複を含み得る概算です。記録はアプリの再起動で消え、性能記録に原稿・書籍名・ファイルパスは含めません。実測キャッシュは原稿の一部を端末内メモリにのみ保持し、書籍切替・ホーム移動・フォント登録時に解放します。</small>
  </section>;
}
