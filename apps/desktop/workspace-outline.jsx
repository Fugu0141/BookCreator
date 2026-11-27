import React,{memo} from 'react';

// Stable section data, selection and guard are the only render inputs.
// Handle clicks at the shell so the list never captures an obsolete draft or
// route callback and can skip reconciliation when only manuscript text changes.
const OutlineRows=memo(function OutlineRows({sections,selectedId,blocked}){
  return sections?.map(s=><button key={s.id} data-section={s.id} className={selectedId===s.id?'selected':''} disabled={blocked||!s.editable}><span>{s.id}</span><small>{s.path??s.type+'（未対応）'}</small></button>);
});
export function WorkspaceOutline({visible,sections,selectedId,blocked,onSelect}){
  function select(event){
    const button=event.target.closest?.('button[data-section]');
    if(!button||!event.currentTarget.contains(button)||button.disabled||blocked)return;
    onSelect(button.dataset.section);
  }
  return <aside id="workspace-outline" tabIndex={-1} aria-label="原稿一覧" hidden={!visible} className="workspace-outline" onClick={select}><h2>原稿</h2><p className="muted">原稿構成</p><OutlineRows sections={sections} selectedId={selectedId} blocked={blocked}/></aside>;
}
