import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createManuscriptStore} from '../manuscript-store.mjs';
import {createStructuredDraftStore} from '../structured-draft-store.mjs';
import {captureStructuredCommand,isStructuredCommandCurrent,commitStructuredCommand,moveStructuredHistory} from '../structured-command.mjs';
function setup(){
  const store=createManuscriptStore(),drafts=createStructuredDraftStore(),generation={current:1};
  store.dispatch({type:'install',file:{id:'a',revision:'r1',text:'A',editable:true}});
  const deps={store,drafts,generation},calls=[];
  const edit=(value,history)=>{calls.push(value);store.dispatch({type:'edit',value,history});};
  return {store,drafts,generation,deps,calls,edit,capture:(source,draft)=>captureStructuredCommand(deps,source,draft)};
}
test('structured commit and history moves read the latest source and keep one atomic history',()=>{
  const s=setup();
  s.store.dispatch({type:'edit',value:'B'});
  const c=s.capture('B');
  assert.ok(commitStructuredCommand(s.deps,c,'C',s.edit));
  assert.ok(commitStructuredCommand(s.deps,s.capture('C'),'D',s.edit));
  assert.ok(moveStructuredHistory(s.store,'undo',s.edit));
  assert.ok(moveStructuredHistory(s.store,'undo',s.edit));
  assert.ok(moveStructuredHistory(s.store,'redo',s.edit));
  assert.deepEqual(s.calls,['C','D','C','B','C']);
  assert.equal(s.store.getSnapshot().text,'C');
});
test('capture refuses stale sources, read-only files and superseded drafts',()=>{
  const s=setup(),draft={source:'A',value:'first'};
  s.drafts.set(draft);
  assert.ok(s.capture('A',draft));
  s.drafts.set({...draft,value:'second'});
  assert.equal(s.capture('A',draft),null);
  assert.equal(s.capture('old'),null);
  s.store.dispatch({type:'editable',editable:false});
  assert.equal(s.capture('A'),null);
  assert.equal(moveStructuredHistory(s.store,'undo',s.edit),false);
});
test('async structured commands cannot commit after a file, draft, revision or generation change',()=>{
  for(const change of [
    s=>s.store.dispatch({type:'install',file:{...s.store.getSnapshot().file}}),
    s=>s.store.dispatch({type:'saved',file:s.store.getSnapshot().file,value:'A',revision:'r2'}),
    s=>s.store.dispatch({type:'edit',value:'B'}),
    s=>s.store.dispatch({type:'editable',editable:false}),
    s=>s.drafts.set({...s.drafts.getSnapshot(),value:'changed'}),
    s=>s.drafts.set(null),
    s=>s.generation.current++
  ]){
    const s=setup(),draft={source:'A',value:'edit'};s.drafts.set(draft);
    const c=s.capture('A',draft);change(s);
    assert.equal(isStructuredCommandCurrent(s.deps,c),false);
    assert.throws(()=>commitStructuredCommand(s.deps,c,'C',s.edit),/変更されました/);
    assert.deepEqual(s.calls,[]);
  }
});
test('opening a draft invalidates a command captured with no active draft',()=>{
  const s=setup(),c=s.capture('A');
  s.drafts.set({source:'A',value:'draft'});
  assert.equal(isStructuredCommandCurrent(s.deps,c),false);
  assert.throws(()=>commitStructuredCommand(s.deps,c,'C',s.edit),/変更されました/);
});
test('no-op commits and unavailable undo or redo do not invoke edit',()=>{
  const s=setup();
  assert.equal(commitStructuredCommand(s.deps,s.capture('A'),'A',s.edit),false);
  assert.equal(moveStructuredHistory(s.store,'undo',s.edit),false);
  assert.equal(moveStructuredHistory(s.store,'redo',s.edit),false);
  assert.deepEqual(s.calls,[]);
});
