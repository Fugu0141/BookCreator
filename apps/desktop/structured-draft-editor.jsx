import React,{useSyncExternalStore,useLayoutEffect} from 'react';
import {editorCommitMetrics} from './editor-commit-metrics.mjs';
import {StructuredEditor} from './structured-editor.jsx';

// Keep draft keystrokes inside the editor subtree; App observes only presence.
export function SubscribedStructuredEditor({store,manuscriptStore,...props}){
  useLayoutEffect(()=>{editorCommitMetrics.commit('structured');});
  const draft=useSyncExternalStore(store.subscribe,store.getSnapshot);
  const {value,editable}=useSyncExternalStore(manuscriptStore.subscribeSource,manuscriptStore.getSource);
  return <StructuredEditor {...props} source={value} editable={editable} draft={draft} setDraft={store.set}/>;
}
