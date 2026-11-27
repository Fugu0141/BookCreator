import React from 'react';
import {DiagnosticList} from './diagnostic-list.jsx';

export function PublicationPanel({visible,saveLabel,dirty,themeDirty,settingsDirty,layout,diagnostics,canOpenDiagnostic,onOpenDiagnostic,blocked,canRender,onNavigate,onRender}){
  // Publication controls do not participate in the editing render path.
  if(!visible)return <section className="workspace-publication" hidden/>;
  const saved=!dirty&&!themeDirty&&!settingsDirty;
  const full=layout.phase==='ready'&&layout.scope==='book';
  const failed=layout.phase==='failed';
  const running=layout.phase==='running';
  const scope=layout.scope==='book'?'全冊':'選択原稿';
  const saveState=saved?'ready':'required';
  const layoutState=full?'ready':failed?'error':running?'running':'required';
  const diagnosticState=failed?'error':full?'preview':running?'running':'required';
  const next=!saved?'未保存の変更を保存してください。':running?'組版が完了するまでお待ちください。':failed?'組版エラーを解消して全冊を組版してください。':!full?'書籍全体を組版して紙面を確認してください。':'試作紙面を確認できます。正式出版の検査・確定・出力は未実装です。';
  const label={ready:'完了',required:'要対応',error:'エラー',running:'実行中',preview:'試作確認',unavailable:'未実装'};
  function step(id,title,state,children){return <section id={'publication-'+id} data-state={state}><div className="publication-step-title"><h2>{title}</h2><span className="publication-state">{label[state]}</span></div>{children}</section>;}
  return <section className="workspace-publication" hidden={!visible}><div className="publication-heading"><div><h1>出版の準備</h1><p>保存と組版の状態を確認します。正式な出版・PDF保存は開発中です。</p></div></div><div id="publication-next" className="workspace-hint" role="status">{next}</div><div className="publication-checks">
    {step('save','1. 保存状態',saveState,<><p>{saveLabel}</p><ul className="publication-save-items">{[['原稿',dirty,'writing'],['テーマ',themeDirty,'design'],['書籍設定',settingsDirty,'settings']].map(([name,pending,mode])=><li key={mode}><span>{name}</span><span>{pending?'未保存':'保存済み・変更なし'}</span>{pending&&<button type="button" className="secondary-action" disabled={blocked} onClick={()=>onNavigate(mode)}>{name}の保存へ</button>}</li>)}</ul></>)}
    {step('layout','2. 全冊の組版',layoutState,<><p>{full?'全冊 '+layout.pages+'ページ（試作）':running?scope+'の組版中…':failed?scope+'の組版に失敗しました。全冊の最新組版が必要です。':layout.phase==='stale'?'変更により組版結果が無効になりました。全冊の最新組版が必要です。':layout.phase==='ready'?'選択原稿のみ '+layout.pages+'ページ。全冊の最新組版が必要です。':'全冊の最新組版が必要です。'}</p>{full&&!saved&&<p className="muted">現在の組版は未保存の変更を含む可能性があります。</p>}<button id="publication-compose" type="button" disabled={blocked||!canRender||running} onClick={onRender}>書籍全体を組版</button><button id="publication-review" type="button" className="secondary-action" disabled={blocked} onClick={()=>onNavigate('layout')}>レイアウトで確認する</button></>)}
    {step('diagnostics','3. 試作組版の診断',diagnosticState,<>{failed?<><p role="alert">組版に失敗しました（{scope}）。</p><DiagnosticList id="publication-diagnostic-list" diagnostics={diagnostics} blocked={blocked} canOpen={canOpenDiagnostic} onOpen={onOpenDiagnostic}/><button type="button" className="secondary-action" disabled={blocked} onClick={()=>onNavigate('writing')}>執筆画面で修正する</button><button type="button" className="secondary-action" disabled={blocked} onClick={()=>onNavigate('design')}>デザインを確認する</button></>:<p>{full?'全冊の試作組版が完了しました。正式出版の品質検査はまだ行われていません。':running?'組版結果を待っています。':'最新の全冊組版による確認が必要です。'}</p>}</>)}
    {step('output','4. 品質検査・確定・出力','unavailable',<><p>正式出版用の検査、警告確認、版の確定、PDF出力は未実装です。</p><p>試作組版が成功しても正式出力できません。</p></>)}
  </div></section>;
}
