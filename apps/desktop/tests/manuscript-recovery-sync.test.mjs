import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createManuscriptStore} from '../manuscript-store.mjs';
import {syncConfirmedRecovery} from '../manuscript-recovery-sync.mjs';
const file=(id='a',editable=true)=>({id,text:'原稿',revision:'r1',editable});
const flags={candidate:null,isComposing:false,structuredComposing:false};
test('recovery projection tracks source and saved revision but ignores history-only changes',()=>{
  const store=createManuscriptStore(),f=file();
  let calls=0;const stop=store.subscribeRecovery(()=>{calls++;assert.equal(store.getRecovery().text,store.getSource().value);});
  store.dispatch({type:'install',file:f});
  store.dispatch({type:'edit',value:'追記',history:{fileId:'a',current:'追記',past:['原稿'],future:[]}});
  const snapshot=store.getRecovery();
  store.dispatch({type:'clear-history'});
  assert.equal(store.getRecovery(),snapshot);assert.equal(calls,2);
  store.dispatch({type:'saved',file:f,value:'追記',revision:'r2'});
  assert.equal(store.getRecovery().file.revision,'r2');assert.equal(calls,3);
  stop();store.dispatch({type:'clear'});assert.equal(calls,3);
});
test('composition and pending recovery candidates suppress recording until confirmation',()=>{
  const store=createManuscriptStore(),updates=[],controller={update:value=>updates.push(value)};
  store.dispatch({type:'install',file:file()});
  store.dispatch({type:'edit',value:'変換中'});
  const pending=store.getRecovery();
  for(const gate of [{isComposing:true},{structuredComposing:true},{candidate:{}}]){
    assert.equal(syncConfirmedRecovery(store,pending,controller,{...flags,...gate}),false);
  }
  store.dispatch({type:'edit',value:'変換確定'});
  assert.equal(syncConfirmedRecovery(store,store.getRecovery(),controller,flags),true);
  assert.deepEqual(updates,['変換確定']);
});
test('obsolete snapshots, read-only manuscripts and missing controllers cannot record',()=>{
  const store=createManuscriptStore(),updates=[],controller={update:value=>updates.push(value)};
  store.dispatch({type:'install',file:file()});const old=store.getRecovery();
  store.dispatch({type:'install',file:file('b',false)});
  assert.equal(syncConfirmedRecovery(store,old,controller,flags),false);
  assert.equal(syncConfirmedRecovery(store,store.getRecovery(),controller,flags),false);
  store.dispatch({type:'editable',editable:true});
  assert.equal(syncConfirmedRecovery(store,store.getRecovery(),null,flags),false);
  store.dispatch({type:'clear'});
  assert.equal(syncConfirmedRecovery(store,store.getRecovery(),controller,flags),false);
  assert.deepEqual(updates,[]);
});
