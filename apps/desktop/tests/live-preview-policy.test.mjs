import test from 'node:test';
import assert from 'node:assert/strict';
import {desiredLivePreviewScope} from '../live-preview-policy.mjs';
const base={enabled:true,mode:'layout',paperVisible:false,hasBook:true,hasFile:false,hasPage:true,blocked:false,measuring:false,phase:'idle',scope:null};
const choose=patch=>desiredLivePreviewScope({...base,...patch});
test('layout defaults to whole book even before a manuscript is opened',()=>{
  assert.equal(choose({}),'book');
  assert.equal(choose({phase:'ready',scope:'manuscript'}),'book');
  assert.equal(choose({phase:'ready',scope:'book'}),null);
});
test('explicit manuscript scope is preserved within layout but not across modes',()=>{
  const override={mode:'layout',scope:'manuscript'};
  assert.equal(choose({hasFile:true,override}),'manuscript');
  assert.equal(choose({hasFile:true,override,phase:'ready',scope:'manuscript'}),null);
  assert.equal(choose({mode:'writing',hasFile:true,paperVisible:true,override,phase:'ready',scope:'book'}),'manuscript');
  assert.equal(choose({override}),null);
});
test('writing schedules only visible selected paper and respects explicit book scope',()=>{
  const writing={mode:'writing',hasFile:true,paperVisible:true};
  assert.equal(choose(writing),'manuscript');
  assert.equal(choose({...writing,paperVisible:false}),null);
  assert.equal(choose({...writing,override:{mode:'writing',scope:'book'}}),'book');
});
test('blocked, disabled, running and failed same scope never loop',()=>{
  for(const patch of [{enabled:false},{blocked:true},{measuring:true},{hasBook:false},{hasPage:false},{mode:'home'},{phase:'running'},{phase:'failed',scope:'book'}])assert.equal(choose(patch),null);
  assert.equal(choose({phase:'failed',scope:'manuscript'}),'book');
  assert.equal(choose({phase:'stale',scope:'book'}),'book');
});

test('styles show selected manuscript or book fallback only when paper is visible',()=>{
  assert.equal(choose({mode:'design',paperVisible:true,hasFile:true}),'manuscript');
  assert.equal(choose({mode:'design',paperVisible:true,hasFile:false}),'book');
  assert.equal(choose({mode:'design',paperVisible:false,hasFile:true}),null);
});
test('settings always measure the full book, including unsaved section order',()=>{
  assert.equal(choose({mode:'settings',paperVisible:true,hasFile:true,phase:'ready',scope:'manuscript'}),'book');
  assert.equal(choose({mode:'settings',paperVisible:true,phase:'stale',scope:'book'}),'book');
  assert.equal(choose({mode:'settings',paperVisible:true,phase:'ready',scope:'book'}),null);
  assert.equal(choose({mode:'settings',paperVisible:false}),null);
});
