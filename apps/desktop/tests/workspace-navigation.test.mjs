import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createManuscriptStore} from '../manuscript-store.mjs';
import {createStructuredDraftStore} from '../structured-draft-store.mjs';
import {navigationState,confirmNavigationDiscard,manuscriptNavigationBlocked,canSaveBeforeClose,withManuscriptDiscard} from '../workspace-navigation.mjs';
function setup(){
  const store=createManuscriptStore();
  store.dispatch({type:'install',file:{id:'a',text:'old',revision:'r1',editable:true}});
  return store;
}
test('navigation reads latest dirty state and only prompts for the requested scope',()=>{
  const store=setup(),messages=[],confirm=message=>{messages.push(message);return false;};
  assert.equal(confirmNavigationDiscard(store,confirm,{themeDirty:true}),true);
  assert.equal(confirmNavigationDiscard(store,confirm,{project:true,themeDirty:true}),false);
  store.dispatch({type:'edit',value:'draft'});
  assert.deepEqual(navigationState(store,{settingsDirty:true}).unsaved,['原稿','書籍設定']);
  assert.equal(confirmNavigationDiscard(store,confirm),false);
  assert.equal(messages.length,2);
});
test('close-save permission reflects latest document and settings validity',()=>{
  const store=setup(),policy={themeDirty:false,settingsDirty:false};
  assert.equal(canSaveBeforeClose(store,policy),true);
  store.dispatch({type:'edit',value:'draft'});
  store.dispatch({type:'editable',editable:false});
  assert.equal(canSaveBeforeClose(store,policy),false);
  store.dispatch({type:'editable',editable:true});
  assert.equal(canSaveBeforeClose(store,{...policy,themeDirty:true,themeEditable:false}),false);
  assert.equal(canSaveBeforeClose(store,{...policy,settingsDirty:true,settingsValid:false}),false);
  assert.equal(canSaveBeforeClose(store,{...policy,settingsDirty:true,settingsValid:true}),true);
});
test('live working, IME and draft locks prevent routing before a new render',()=>{
  const deps={routeBlocked:{current:false},working:{current:false},composing:{current:false},drafts:createStructuredDraftStore()};
  assert.equal(manuscriptNavigationBlocked(deps),false);
  for(const key of ['routeBlocked','working','composing']){
    deps[key].current=true;assert.equal(manuscriptNavigationBlocked(deps),true);deps[key].current=false;
  }
  deps.drafts.set({value:'draft'});assert.equal(manuscriptNavigationBlocked(deps),true);
});
function recoverySetup(){
  const store=setup(),calls=[];
  let controller={pause:async()=>calls.push('pause'),discard:async()=>calls.push('discard'),resume:value=>calls.push(['resume',value])};
  const deps={store,getController:()=>controller,candidate:false};
  return {store,calls,deps,replace:()=>{controller={resume:()=>calls.push('wrong resume')};}};
}
test('cancelled or failed route resumes only the current controller with current text',async()=>{
  for(const fail of [false,true]){
    const s=recoverySetup();
    const run=async()=>{s.calls.push('route');s.store.dispatch({type:'edit',value:'new'});if(fail)throw Error('read failed');return null;};
    if(fail)await assert.rejects(withManuscriptDiscard(s.deps,run),/read failed/);
    else assert.equal(await withManuscriptDiscard(s.deps,run),null);
    assert.deepEqual(s.calls,['pause','discard','route',['resume','new']]);
  }
});
test('replacement controller is not resumed and unresolved recovery is never discarded',async()=>{
  const s=recoverySetup();
  await withManuscriptDiscard(s.deps,async()=>{s.replace();s.calls.push('route');});
  assert.deepEqual(s.calls,['pause','discard','route']);
  const t=recoverySetup();
  await withManuscriptDiscard({...t.deps,candidate:true},async()=>t.calls.push('route'));
  assert.deepEqual(t.calls,['route']);
});
test('changed source or controller during pause or discard prevents routing',async()=>{
  for(const phase of ['pause','discard'])for(const replacement of [false,true]){
    const s=recoverySetup();
    s.deps.getController()[phase]=async()=>{s.calls.push(phase);if(replacement)s.replace();else s.store.dispatch({type:'edit',value:'new'});};
    await assert.rejects(withManuscriptDiscard(s.deps,()=>assert.fail('stale route')),/変更されました/);
    if(!replacement)assert.deepEqual(s.calls.at(-1),['resume','new']);
    else assert.ok(!s.calls.includes('wrong resume'));
  }
});
