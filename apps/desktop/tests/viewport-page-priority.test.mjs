import test from 'node:test';
import assert from 'node:assert/strict';
import {visiblePaperPageIndices} from '../viewport-page-priority.mjs';

const rect=(left,top,right,bottom)=>({left,top,right,bottom});
function fixture(pages){
  const viewport={clientWidth:100,clientHeight:100,clientLeft:2,clientTop:2,closest:()=>null,getBoundingClientRect:()=>rect(10,10,120,120)};
  const host={parentNode:viewport,shadowRoot:{children:pages.map(([index,r])=>({dataset:{page:index},getBoundingClientRect:()=>r}))}};
  viewport.firstElementChild=host;
  return {viewport,host};
}
test('only pages intersecting the clipped viewport are prioritized in paper order',()=>{
  const {viewport,host}=fixture([['0',rect(12,-50,100,12)],['1',rect(12,12,100,80)],['2',rect(12,80,100,150)],['3',rect(12,112,100,180)],['4',rect(112,20,200,80)],['5',rect(-40,20,20,80)]]);
  assert.deepEqual(visiblePaperPageIndices(viewport,host),[1,2,5]);
});
test('hidden, zero-size and foreign hosts yield no priority',()=>{
  const {viewport,host}=fixture([['0',rect(20,20,100,100)]]);
  assert.deepEqual(visiblePaperPageIndices(viewport,{}),[]);
  viewport.closest=()=>({});assert.deepEqual(visiblePaperPageIndices(viewport,host),[]);
  viewport.closest=()=>null;viewport.clientHeight=0;
  assert.deepEqual(visiblePaperPageIndices(viewport,host),[]);
});
test('invalid indices and duplicate pages are ignored and priority is bounded',()=>{
  const r=rect(20,20,100,100);
  const {viewport,host}=fixture([['',r],['-1',r],['01',r],['9007199254740992',r],['0',r],['0',r],...Array.from({length:80},(_,i)=>[String(i+1),r])]);
  assert.deepEqual(visiblePaperPageIndices(viewport,host),Array.from({length:64},(_,i)=>i));
});
