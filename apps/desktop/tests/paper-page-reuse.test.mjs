import test from 'node:test';
import assert from 'node:assert/strict';
import {planPaperPageReuse} from '../paper-page-reuse.mjs';
const html='http://www.w3.org/1999/xhtml';
function page(index,content,{unsupported=false,shadow=false,custom=false}={}){
  return {nodeType:1,namespaceURI:html,localName:'div',shadowRoot:shadow?{}:null,
    getAttribute:name=>name==='data-page'?String(index):null,hasAttribute:()=>false,
    querySelector:()=>unsupported?{}:null,
    querySelectorAll:()=>custom?[{localName:'custom-node',hasAttribute:()=>false}]:[],
    isEqualNode(other){return other.content===content;},content};
}
function roots(previous,next){
  const ownerDocument={};
  return [{ownerDocument,host:{inert:true,isConnected:true},childNodes:previous},
    {ownerDocument,host:{inert:false,isConnected:false},childNodes:next}];
}
test('only equal same-index pages are reused, changed and appended pages stay new',()=>{
  const old=[page(0,'a'),page(1,'b'),page(2,'c')],next=[page(0,'a'),page(1,'changed'),page(2,'c'),page(3,'d')];
  const result=planPaperPageReuse(...roots(old,next));
  assert.deepEqual(result.pages.map(p=>p.reuse),[true,false,true,false]);
  assert.equal(result.reused,2);assert.equal(result.pages[0].previous,old[0]);assert.equal(result.pages[3].previous,null);
  assert.equal(result.pages[1].next,next[1]);assert.deepEqual(result.removed,[]);
  assert.equal(old.length,3);assert.equal(next.length,4);
  const shorter=planPaperPageReuse(...roots(old,[page(0,'a')]));
  assert.deepEqual(shorter.removed,old.slice(1));
});
test('equal serialized pages with resource or custom state must be replaced',()=>{
  const old=[page(0,'a',{unsupported:true}),page(1,'b'),page(2,'c',{shadow:true}),page(3,'d',{custom:true})];
  const next=[page(0,'a'),page(1,'b',{unsupported:true}),page(2,'c'),page(3,'d')];
  assert.equal(planPaperPageReuse(...roots(old,next)).reused,0);
});
test('invalid roots, different document, current or attached candidate fall back',()=>{
  assert.equal(planPaperPageReuse(null,null),null);
  for(const mutate of [
    (a,b)=>{b.ownerDocument={};},(a,b)=>{a.host.inert=false;},
    (a,b)=>{a.host.isConnected=false;},(a,b)=>{b.host.isConnected=true;},
    (a,b)=>{b.childNodes=[page(1,'a')];},(a,b)=>{a.childNodes=[];},
    (a,b)=>{b.childNodes.push({nodeType:3});}
  ]){
    const pair=roots([page(0,'a')],[page(0,'a')]);mutate(...pair);
    assert.equal(planPaperPageReuse(...pair),null);
  }
});
