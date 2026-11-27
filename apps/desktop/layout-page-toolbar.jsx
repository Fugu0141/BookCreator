import React,{memo,useSyncExternalStore} from 'react';

// Subscribe directly to the toolbar projection. Typing a page number never
// updates the workspace overview or reconstructs the surrounding editor.
export const LayoutPageToolbar=memo(function LayoutPageToolbar({store,visible,onNavigate}){
  const {layoutState,layoutPages,activePage,pageJump}=useSyncExternalStore(store.subscribeToolbar,store.getToolbar);
  return <div className="layout-page-toolbar" hidden={!visible||layoutState.phase!=='ready'||!layoutPages.length}><button id="layout-prev" type="button" disabled={activePage<=1} onClick={()=>onNavigate(activePage-1)}>前へ</button><form onSubmit={e=>{e.preventDefault();onNavigate(Number(pageJump));}}><label>ページ <input id="layout-page-jump" type="number" min={1} max={layoutPages.length||1} value={pageJump} onChange={e=>store.dispatch({type:'page-jump',value:e.target.value})}/></label><span> / {layoutPages.length}</span><button id="layout-jump" type="submit" disabled={!Number.isInteger(Number(pageJump))||Number(pageJump)<1||Number(pageJump)>layoutPages.length}>移動</button></form><button id="layout-next" type="button" disabled={activePage>=layoutPages.length} onClick={()=>onNavigate(activePage+1)}>次へ</button></div>;
});
