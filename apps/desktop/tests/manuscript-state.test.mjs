import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createManuscriptState,reduceManuscriptState as reduce,manuscriptDirty,activeStructuredHistory,planStructuredCommit,planStructuredHistoryMove} from '../manuscript-state.mjs';
const open=(id='a',text='原稿')=>reduce(createManuscriptState(),{type:'install',file:{id,text,revision:'r1',editable:true}});
const edit=(s,value,history)=>reduce(s,{type:'edit',value,history});
test('loaded source and saved baseline change independently and save cannot erase a newer draft',()=>{
  const initial=open(),changed=edit(initial,'追記'),newer=edit(changed,'追加の編集');
  assert.equal(manuscriptDirty(initial),false);
  assert.equal(manuscriptDirty(changed),true);
  const saved=reduce(newer,{type:'saved',file:changed.file,value:changed.text,revision:'r2'});
  assert.equal(saved.file.text,'追記');
  assert.equal(saved.text,'追加の編集');
  assert.equal(manuscriptDirty(saved),true);
  assert.equal(manuscriptDirty(edit(saved,'追記')),false);
  const other=open('b');
  assert.equal(reduce(other,{type:'saved',file:changed.file,value:changed.text,revision:'r2'}),other);
});
test('recovery unlock and restore do not mark the recovered manuscript saved',()=>{
  let s=reduce(open(),{type:'editable',editable:false});
  s=edit(s,'復旧した原稿');
  s=reduce(s,{type:'editable',editable:true});
  assert.equal(s.file.editable,true);
  assert.equal(s.file.text,'原稿');
  assert.equal(manuscriptDirty(s),true);
  assert.deepEqual(reduce(s,{type:'clear'}),createManuscriptState());
});
test('structured commit undo redo are atomic; source edits and file changes discard history',()=>{
  let s=open();
  s=edit(s,'A',planStructuredCommit(s,'A'));
  s=edit(s,'B',planStructuredCommit(s,'B'));
  const undo=planStructuredHistoryMove(s,'undo');
  s=edit(s,undo.current,undo);
  assert.equal(s.text,'A');
  assert.deepEqual(activeStructuredHistory(s).future,['B']);
  const redo=planStructuredHistoryMove(s,'redo');
  s=edit(s,redo.current,redo);
  assert.equal(s.text,'B');
  assert.equal(activeStructuredHistory(edit(s,'C')),null);
  assert.equal(activeStructuredHistory(reduce(s,{type:'install',file:{...s.file,id:'b'}})),null);
});
test('history keeps the existing count and source-size limits; identical changes preserve identity',()=>{
  let s=open();
  for(let i=0;i<25;i++){const value=String(i);s=edit(s,value,planStructuredCommit(s,value));}
  assert.equal(s.history.past.length,20);
  s=open('a','a'.repeat(1000001));
  assert.deepEqual(planStructuredCommit(s,'b').past,[]);
  assert.equal(edit(s,s.text),s);
  assert.equal(planStructuredCommit(s,s.text),null);
});
