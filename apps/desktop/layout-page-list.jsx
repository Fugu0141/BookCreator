import React,{memo} from 'react';
import {PaperThumbnail} from './paper-viewport.jsx';

// Immutable page summaries retain identity across exact sparse reuse.
// Selection changes need not redraw the SVG geometry.
const Thumbnail=memo(PaperThumbnail);
const PageRow=memo(function PageRow({page,selected,onNavigate}){
  return <button type="button" data-layout-page={page.number} className={selected?'selected':''} aria-current={selected?'page':undefined} onClick={()=>onNavigate(page.number)}><Thumbnail shape={page.thumbnail}/><span className="layout-thumbnail-label"><strong>ページ {page.number}</strong><small>{page.documents.join(' / ')||'原稿断片なし'}</small></span></button>;
});

export const LayoutPageList=memo(function LayoutPageList({visible,phase,scope,pages,activePage,onNavigate}){
  // Keep retained rows mounted while a new layout is running, but never
  // expose stale page controls. A cleared result or closed pane releases them.
  const ready=phase==='ready'&&pages.length>0;
  return <aside id="layout-page-list" className="layout-page-list" hidden={!visible} aria-label="ページ一覧"><h2>ページ一覧</h2><p id="layout-page-scope" className="muted">{phase==='ready'?(scope==='book'?'書籍全体':'選択原稿のみ')+' · '+pages.length+' ページ':'最新の組版結果はありません'}</p>{visible&&pages.length>0&&<div id="layout-pages" hidden={!ready} inert={!ready} aria-label="ページ一覧（配置の簡易見本）">{pages.map(page=><PageRow key={page.number} page={page} selected={activePage===page.number} onNavigate={onNavigate}/>)}</div>}{visible&&!ready&&<p className="muted">「書籍全体を組版」でページ一覧を表示します。</p>}</aside>;
});
