import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createManuscriptStore} from '../manuscript-store.mjs';
import {capturePreviewManuscript} from '../preview-manuscript-input.mjs';
import {reserveLivePreview} from '../live-preview-reservation.mjs';
const file=(id='a')=>({id,text:'原稿',editable:true,revision:'r1'});
test('manual capture uses current store input and preserves a submitted document pair',()=>{
  const store=createManuscriptStore();store.dispatch({type:'install',file:file()});
  store.dispatch({type:'edit',value:'新しい原稿'});
  const submitted=capturePreviewManuscript(store,false);
  store.dispatch({type:'saved',file:submitted.file,value:submitted.text,revision:'r2'});
  store.dispatch({type:'edit',value:'追加'});
  assert.equal(submitted.text,'新しい原稿');assert.equal(submitted.file.revision,'r1');
  assert.equal(capturePreviewManuscript(store,false).text,'追加');
  assert.equal(capturePreviewManuscript(store,false).file.revision,'r2');
});
test('automatic submission rejects superseded text and switched documents even with equal text',()=>{
  const store=createManuscriptStore();store.dispatch({type:'install',file:file()});
  const first=store.getPreviewInput();
  assert.equal(capturePreviewManuscript(store,false,first),first);
  store.dispatch({type:'edit',value:'B'});
  assert.equal(capturePreviewManuscript(store,false,first),null);
  store.dispatch({type:'install',file:file('b')});
  assert.equal(capturePreviewManuscript(store,true,first),null);
  const current=store.getPreviewInput();
  assert.equal(capturePreviewManuscript(store,true,current),current);
});
test('whole-book requests can capture an empty selection, manuscript requests cannot',()=>{
  const store=createManuscriptStore();
  assert.equal(capturePreviewManuscript(store,false),null);
  assert.deepEqual(capturePreviewManuscript(store,true),{file:null,text:''});
  store.dispatch({type:'install',file:file()});
  const old=store.getPreviewInput();store.dispatch({type:'clear'});
  assert.equal(capturePreviewManuscript(store,true,old),null);
});
test('reservation looks up a warm paper lease using its own selected file',()=>{
  const store=createManuscriptStore();store.dispatch({type:'install',file:file('b')});
  const snapshot=store.getPreviewInput(),seen=[];
  reserveLivePreview({store,snapshot,delay:{request:(run,wait)=>seen.push(wait),cancel:()=>{}},generation:{current:0},policy:{enabled:true,mode:'writing',paperVisible:true,hasBook:true,hasPage:true,blocked:false,measuring:false,phase:'stale',scope:'manuscript'},retained:true,warmRetained:(scope,targetFile)=>{seen.push([scope,targetFile.id]);return true;},isBlocked:()=>false,onRender:()=>{}});
  assert.deepEqual(seen,[['manuscript','b'],16]);
});
