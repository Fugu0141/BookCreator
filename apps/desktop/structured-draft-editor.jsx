import React,{useSyncExternalStore} from 'react';
import {StructuredEditor} from './structured-editor.jsx';

// Keep draft keystrokes inside the editor subtree; App observes only presence.
export function SubscribedStructuredEditor({store,...props}){
  const draft=useSyncExternalStore(store.subscribe,store.getSnapshot);
  return <StructuredEditor {...props} draft={draft} setDraft={store.set}/>;
}
