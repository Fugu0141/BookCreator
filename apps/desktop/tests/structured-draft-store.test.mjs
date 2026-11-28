import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStructuredDraftStore} from '../structured-draft-store.mjs';

test('draft keystrokes notify the editor but not workspace presence subscribers',()=>{
  const store=createStructuredDraftStore(),active=[],values=[];
  store.subscribeActive(()=>active.push(store.getActive()));
  store.subscribe(()=>values.push(store.getSnapshot()?.value??null));
  store.set({value:''});
  for(let i=0;i<100;i++)store.set(d=>({...d,value:d.value+'a'}));
  assert.equal(values.length,101);
  assert.equal(store.getSnapshot().value.length,100);
  assert.deepEqual(active,[true]);
  store.set(null);
  assert.deepEqual(active,[true,false]);
  assert.equal(values.at(-1),null);
});
test('same snapshot is a no-op and unsubscribe releases listener',()=>{
  const store=createStructuredDraftStore();let notifications=0;
  const stop=store.subscribe(()=>notifications++);
  const draft={value:'original'};
  store.set(draft);store.set(draft);store.set(d=>d);
  assert.equal(notifications,1);
  stop();store.set({value:'new'});
  assert.equal(notifications,1);
  assert.equal(store.getSnapshot().value,'new');
});
test('snapshot and presence are coherent across subscribers and workspace instances',()=>{
  const a=createStructuredDraftStore(),b=createStructuredDraftStore(),seen=[];
  a.subscribeActive(()=>seen.push([a.getActive(),a.getSnapshot()?.value??null]));
  a.set({value:'a'});b.set({value:'b'});a.set(null);
  assert.deepEqual(seen,[[true,'a'],[false,null]]);
  assert.equal(b.getSnapshot().value,'b');
});
