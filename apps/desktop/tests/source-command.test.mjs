import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createManuscriptStore} from '../manuscript-store.mjs';
import {captureSourceCommand,isSourceCommandCurrent,applySourceCommand,captureDraftCommand,isDraftCommandCurrent} from '../source-command.mjs';
function setup(){
  const store=createManuscriptStore();
  store.dispatch({type:'install',file:{id:'a',revision:'r1',text:'abc',editable:true}});
  const node={value:'abc',selectionStart:0,selectionEnd:2};
  const deps={store,textarea:{current:node},generation:{current:1},composing:{current:false}};
  const capture=()=>captureSourceCommand(deps);
  return {store,node,deps,capture};
}
const plan=({start,end})=>({patch:{start,end},selection:{start,end}});
const patch=(text,[p])=>text.slice(0,p.start)+'**'+text.slice(p.start,p.end)+'**'+text.slice(p.end);
test('source command captures latest store and applies exactly once',()=>{
  const s=setup();s.store.dispatch({type:'edit',value:'abcd'});s.node.value='abcd';
  const command=s.capture(),calls=[];
  assert.equal(command.text,'abcd');
  const result=applySourceCommand(s.deps,command,plan,patch,next=>{calls.push(next);s.store.dispatch({type:'edit',value:next});});
  assert.equal(result.next,'**ab**cd');assert.deepEqual(calls,['**ab**cd']);
});
test('async command rejects changes to document, revision, selection, DOM, generation or IME',()=>{
  for(const change of [
    s=>{s.store.dispatch({type:'edit',value:'new'});s.node.value='new';},
    s=>s.store.dispatch({type:'install',file:{...s.store.getSnapshot().file}}),
    s=>s.store.dispatch({type:'saved',file:s.store.getSnapshot().file,value:'abc',revision:'r2'}),
    s=>{s.node.selectionEnd=1;},
    s=>{s.deps.textarea.current={...s.node};},
    s=>{s.node.value='new';},
    s=>{s.deps.generation.current++;},
    s=>{s.deps.composing.current=true;}
  ]){
    const s=setup(),command=s.capture();change(s);
    assert.equal(isSourceCommandCurrent(s.deps,command),false);
    assert.throws(()=>applySourceCommand(s.deps,command,()=>assert.fail('stale planner'),patch,()=>assert.fail('stale commit')),/再選択/);
  }
});
test('planner or patch failure cannot commit and a changed input is rechecked',()=>{
  const s=setup(),command=s.capture();
  assert.throws(()=>applySourceCommand(s.deps,command,()=>{throw Error('invalid');},patch,()=>assert.fail('commit')),/invalid/);
  assert.throws(()=>applySourceCommand(s.deps,command,c=>{s.deps.generation.current++;return plan(c);},patch,()=>assert.fail('commit')),/再選択/);
});
test('no selected writable source or IME prevents capture; mismatched DOM is rejected',()=>{
  const s=setup();s.deps.composing.current=true;assert.equal(s.capture(),null);
  s.deps.composing.current=false;s.node.value='other';assert.throws(s.capture,/再選択/);
  s.store.dispatch({type:'editable',editable:false});assert.equal(s.capture(),null);
  s.store.dispatch({type:'clear'});assert.equal(s.capture(),null);
});

function modal(s){
  const origin=s.capture();
  return {origin,fileId:origin.file.id,revision:origin.file.revision,source:origin.text,job:origin.job,start:origin.start,end:origin.end};
}
test('modal draft preserves the captured range even after the live selection moves',()=>{
  const s=setup(),draft=modal(s);
  s.node.selectionStart=3;s.node.selectionEnd=3;
  const command=captureDraftCommand(s.deps,draft);
  assert.equal(command.start,0);assert.equal(command.end,2);
  assert.equal(isDraftCommandCurrent(s.deps,command),true);
});
test('modal draft rejects stale origin even for a replacement with identical id, revision and text',()=>{
  const s=setup(),draft=modal(s);
  s.store.dispatch({type:'install',file:{...s.store.getSnapshot().file}});
  assert.equal(captureDraftCommand(s.deps,draft),null);
});
test('modal command is revalidated after asynchronous work',()=>{
  for(const change of [
    s=>s.store.dispatch({type:'edit',value:'new'}),
    s=>s.store.dispatch({type:'saved',file:s.store.getSnapshot().file,value:'abc',revision:'r2'}),
    s=>{s.deps.generation.current++;},
    s=>{s.deps.textarea.current={...s.node};},
    s=>{s.deps.composing.current=true;},
    s=>{s.node.value='new';}
  ]){
    const s=setup(),draft=modal(s),command=captureDraftCommand(s.deps,draft);
    change(s);
    assert.equal(isDraftCommandCurrent(s.deps,command),false);
    assert.equal(captureDraftCommand(s.deps,draft),null);
  }
});
test('legacy structured reference draft retains current document guard without a source origin',()=>{
  const s=setup(),{origin,...draft}=modal(s);
  assert.ok(captureDraftCommand(s.deps,draft));
  s.store.dispatch({type:'editable',editable:false});
  assert.equal(captureDraftCommand(s.deps,draft),null);
  assert.equal(isDraftCommandCurrent(s.deps,null),false);
});
