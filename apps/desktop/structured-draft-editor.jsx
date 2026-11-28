import React,{useSyncExternalStore} from 'react';
import {StructuredEditor} from './structured-editor.jsx';

// Keep draft keystrokes inside the editor subtree; App observes only presence.
export function SubscribedStructuredEditor({store,manuscriptStore,...props}){
  const draft=useSyncExternalStore(store.subscribe,store.getSnapshot);
  const {value,editable}=useSyncExternalStore(manuscriptStore.subscribeSource,manuscriptStore.getSource);
  return <StructuredEditor {...props} source={value} editable={editable} draft={draft} setDraft={store.set}/>;
}
