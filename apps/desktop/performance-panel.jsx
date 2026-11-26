import React,{useEffect,useRef,useState} from 'react';
import {performanceMetrics,summarizePerformance} from './performance-metrics.mjs';
const stageNames={measurement:'実測レーン',layout:'組版要求',read:'読取'};
const categoryNames={manuscript:'選択原稿',book:'全冊',component:'部品',paragraph:'段落',catalog:'カタログ',source:'原稿',image:'画像',other:'その他'};
const ms=v=>v===null?'—':v.toFixed(1);
const mib=v=>(v/1024).toFixed(1)+' MiB';
export function PerformancePanel({readMemory,onClose}){
  const [rows,setRows]=useState(()=>performanceMetrics.snapshot());
  const [memory,setMemory]=useState(null),[phase,setPhase]=useState('pending');
  const request=useRef(0);
  async function refresh(){
    const job=++request.current;
    setRows(performanceMetrics.snapshot());setPhase('pending');
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
  return <section id="performance-panel" className="performance-panel" aria-label="性能計測">
    <header><strong>性能計測（端末内のみ）</strong><div><button id="performance-refresh" type="button" onClick={()=>void refresh()}>更新</button><button id="performance-clear" type="button" onClick={()=>{performanceMetrics.clear();setRows([]);}}>記録を消去</button><button id="performance-close" type="button" onClick={onClose}>閉じる</button></div></header>
    <p className="muted">直近 {rows.length} / 200 件。成功時の中央値・最大値（ms）。組版要求には入力合流時間を含みません。実測・読取は組版要求の内訳と重なるため合算しないでください。</p>
    <div className="performance-table-wrap"><table id="performance-summary"><thead><tr><th>処理</th><th>成功</th><th>失敗</th><th>取消</th><th>待機 中央値</th><th>処理 中央値</th><th>処理 最大</th><th>再試行</th></tr></thead><tbody>{summary.map(g=><tr key={g.stage+':'+g.category} data-stage={g.stage} data-category={g.category} data-success={g.success}><th>{stageNames[g.stage]} / {categoryNames[g.category]}</th><td>{g.success}</td><td>{g.failed}</td><td>{g.cancelled}</td><td>{ms(g.medianWaitMs)}</td><td>{ms(g.medianRunMs)}</td><td>{ms(g.maxRunMs)}</td><td>{g.retries}</td></tr>)}</tbody></table></div>
    {!rows.length&&<p className="muted">組版操作後に更新すると計測結果を確認できます。</p>}
    <div id="performance-memory" data-phase={phase}>{phase==='ready'&&memory?<>プロセスの作業セット（取得時点）：Main {mib(memory.browserKiB)} ／ Renderer {mib(memory.rendererKiB)} ／ その他 {mib(memory.otherKiB)}（{memory.processes} プロセス）</>:phase==='error'?'メモリ情報を取得できませんでした。':'メモリ情報を取得中…'}</div>
    <small>共有メモリの重複を含み得る概算です。記録はアプリの再起動で消え、原稿・書籍名・ファイルパスは保存しません。</small>
  </section>;
}
