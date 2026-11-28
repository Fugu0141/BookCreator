import React,{useSyncExternalStore,useLayoutEffect,useEffect} from 'react';

// The source field reads the text and access flags directly from its store.
// Keep native selection, undo and IME behavior by retaining the same DOM node.
export function SourceEditor({store,nodeRef,hidden,onSelect,fontFamily,fontWeight,busy,composing,onCompositionStart,onCompositionEnd,onFormat,onEdit,onCommitted,mode}){
  const {value,hasFile,editable}=useSyncExternalStore(store.subscribeSource,store.getSource);
  // Selection restoration follows the committed controlled textarea, even
  // when the workspace has not re-rendered for this source update.
  useLayoutEffect(()=>{onCommitted?.();},[value,onCommitted]);
  useEffect(()=>{onSelect();},[value,mode]);
  function onKeyDown(e){
    if(e.nativeEvent.isComposing||composing.current||e.altKey||e.shiftKey||!(e.ctrlKey||e.metaKey))return;
    const k=e.key.toLowerCase();
    if(k==='b'||k==='i'||k==='u'){e.preventDefault();onFormat(k==='b'?'bold':k==='i'?'italic':'underline');}
  }
  return <textarea id="source" hidden={hidden} onSelect={onSelect} style={{fontFamily,fontWeight}} ref={nodeRef} value={value} disabled={busy||!hasFile} readOnly={!editable} onCompositionStart={onCompositionStart} onCompositionEnd={onCompositionEnd} onKeyDown={onKeyDown} onChange={e=>onEdit(e.target.value)} spellCheck={false}/>;
}
