import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createManuscriptStore} from '../manuscript-store.mjs';
import {persistManuscript} from '../manuscript-persistence.mjs';
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function setup(){
  const store=createManuscriptStore(),calls=[];
  store.dispatch({type:'install',file:{id:'a',text:'old',revision:'r1',editable:true}});
  store.dispatch({type:'edit',value:'draft'});
  let controller={pause:async()=>{calls.push('pause');},saved:async(...args)=>{calls.push(['saved',...args]);},resume:value=>calls.push(['resume',value])};
  const options={store,getController:()=>controller,save:async(...args)=>{calls.push(['save',...args]);return {revision:'r2'};},onRecoveryError:error=>calls.push(['error',error.message])};
  return {store,calls,options,replaceController:()=>{controller={resume:()=>calls.push('wrong resume')};}};
}
test('save captures the current text and revision and preserves a newer draft during IPC',async()=>{
  const s=setup(),entered=deferred(),result=deferred(),save=s.options.save;
  s.options.save=async(...args)=>{await save(...args);entered.resolve();return result.promise;};
  const pending=persistManuscript(s.options);await entered.promise;
  s.store.dispatch({type:'edit',value:'newer'});result.resolve({revision:'r2'});
  await pending;
  assert.equal(s.store.getSnapshot().text,'newer');
  assert.equal(s.store.getSnapshot().file.text,'draft');
  assert.equal(s.store.getSnapshot().file.revision,'r2');
  assert.deepEqual(s.calls,['pause',['save','a','r1','draft'],['saved','r2','draft'],['resume','newer']]);
});
test('failed save preserves the baseline and resumes recovery with latest text',async()=>{
  const s=setup();s.options.save=async()=>{s.store.dispatch({type:'edit',value:'newer'});throw Error('conflict');};
  await assert.rejects(persistManuscript(s.options),/conflict/);
  assert.equal(s.store.getSnapshot().file.revision,'r1');
  assert.deepEqual(s.calls,['pause',['resume','newer']]);
});
test('recovery cleanup failure does not undo a successful save',async()=>{
  const s=setup();s.options.getController().saved=async()=>{throw Error('cleanup');};
  assert.deepEqual(await persistManuscript(s.options),{revision:'r2'});
  assert.deepEqual(s.calls,['pause',['save','a','r1','draft'],['error','cleanup'],['resume','draft']]);
  assert.equal(s.store.getMetadata().dirty,false);
});
test('document replacement while pausing prevents IPC, replacement during IPC cannot update new document',async()=>{
  for(const during of ['pause','save']){
    const s=setup(),replace=()=>{s.store.dispatch({type:'install',file:{id:'a',text:'replacement',revision:'other',editable:true}});s.replaceController();};
    if(during==='pause')s.options.getController().pause=async()=>{replace();};
    else s.options.save=async()=>{replace();return {revision:'r2'};};
    await assert.rejects(persistManuscript(s.options),/切り替わりました/);
    assert.equal(s.store.getSnapshot().file.revision,'other');
    assert.deepEqual(s.calls,during==='pause'?[]:['pause']);
  }
});
test('clean source is a no-op and dirty read-only source is rejected before I/O',async()=>{
  const s=setup();s.store.dispatch({type:'edit',value:'old'});
  assert.equal(await persistManuscript(s.options),null);
  s.store.dispatch({type:'edit',value:'draft'});s.store.dispatch({type:'editable',editable:false});
  await assert.rejects(persistManuscript(s.options),/読み取り専用/);
  assert.deepEqual(s.calls,[]);
});
test('edits during recovery cleanup are preserved and resumed',async()=>{
  const s=setup();s.options.getController().saved=async()=>{s.store.dispatch({type:'edit',value:'after cleanup started'});};
  await persistManuscript(s.options);
  assert.equal(s.store.getMetadata().dirty,true);
  assert.deepEqual(s.calls.at(-1),['resume','after cleanup started']);
});
