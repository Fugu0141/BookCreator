import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultPaperSync} from '../default-paper-sync.mjs';
function fixture(){
  let scans=0;
  const guide={style:{visibility:'hidden'}};
  const host={style:{zoom:'0.5',width:'max-content'},shadowRoot:{querySelectorAll(selector){
    assert.equal(selector,'[data-content-guide]');scans++;return [guide];
  }}};
  return {host,guide,scans:()=>scans};
}
test('default writing view restores layout zoom and guides only once per host',()=>{
  const a=fixture(),viewport={firstElementChild:a.host,dataset:{paperZoom:'0.5'}};
  const apply=createDefaultPaperSync(viewport);
  assert.equal(apply(),true);
  assert.deepEqual(a.host.style,{zoom:'1',width:''});
  assert.equal(a.guide.style.visibility,'');
  assert.equal(viewport.dataset.paperZoom,'1');
  for(let i=0;i<50;i++)assert.equal(apply(),false);
  assert.equal(a.scans(),1);
  const b=fixture();viewport.firstElementChild=b.host;
  assert.equal(apply(),true);assert.equal(b.scans(),1);
  viewport.firstElementChild=null;assert.equal(apply(),false);
  viewport.firstElementChild=a.host;assert.equal(apply(),true);assert.equal(a.scans(),2);
});
test('returning from layout creates a fresh synchronizer and restores its changes',()=>{
  const a=fixture(),viewport={firstElementChild:a.host,dataset:{}};
  createDefaultPaperSync(viewport)();
  a.host.style.zoom='2';a.guide.style.visibility='hidden';
  createDefaultPaperSync(viewport)();
  assert.equal(a.host.style.zoom,'1');assert.equal(a.guide.style.visibility,'');
  assert.equal(a.scans(),2);
});
