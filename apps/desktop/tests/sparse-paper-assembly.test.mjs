import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSparsePaperAssembly} from '../sparse-paper-assembly.mjs';

function fixture(){
  const ownerDocument={};
  const page=index=>{
    const block={getAttribute:name=>name==='data-document'?'a':name==='data-block'?'p'+index:null};
    return {nodeType:1,namespaceURI:'http://www.w3.org/1999/xhtml',localName:'div',getAttribute:name=>name==='data-page'?String(index):null,querySelectorAll:()=>[block]};
  };
  const host={isConnected:true,inert:true};
  const previousRoot={ownerDocument,host,childNodes:[page(0),page(1),page(2),page(3)]};
  const changedElement={isConnected:false};
  changedElement.shadowRoot={ownerDocument,host:changedElement,childNodes:[page(1)]};
  const pages=Array.from({length:3},(_,index)=>({index,fragments:[{origin:{documentId:'a',blockKey:'p'+index,revision:'2'}}]}));
  const slices=pages.map(p=>({pageIndex:p.index,origin:p.fragments[0].origin,sourceSlice:{start:100+p.index,end:101+p.index}}));
  return {previousRoot,result:{changedElement,plan:{pages},slices,pageDelta:{snapshot:{},reusedPageIndices:[0,2]}}};
}
test('resolves omitted and changed pages in order without moving nodes',()=>{
  const {previousRoot,result}=fixture(),old=previousRoot.childNodes.slice(),fresh=result.changedElement.shadowRoot.childNodes[0];
  const a=prepareSparsePaperAssembly(previousRoot,result);
  assert.equal(a.reused,2);
  assert.deepEqual(a.pages.map(p=>p.node),[old[0],fresh,old[2]]);
  assert.deepEqual(a.pages.map(p=>p.reuse),[true,false,true]);
  assert.deepEqual(a.pages.map(p=>p.fragments),a.pages.map(p=>Array.from(p.node.querySelectorAll('[data-block]'))));
  assert.deepEqual(a.removed,[old[3]]);
  assert.deepEqual(previousRoot.childNodes,old);
  assert.equal(result.changedElement.shadowRoot.childNodes[0],fresh);
});
test('full initial sparse result needs no previous host',()=>{
  const {previousRoot,result}=fixture();
  result.changedElement.shadowRoot.childNodes=previousRoot.childNodes.slice(0,3);
  result.pageDelta.reusedPageIndices=[];
  const a=prepareSparsePaperAssembly(null,result);
  assert.equal(a.reused,0);assert.equal(a.pages.length,3);
});
test('rejects partial coverage, overlap, duplicate, bad order, stale host and mismatched slices',()=>{
  for(const mutate of [
    (a,b)=>{b.pageDelta.reusedPageIndices=[0,0];},
    (a,b)=>{b.pageDelta.reusedPageIndices=[0,1];},
    (a,b)=>{b.pageDelta.reusedPageIndices=[0,3];},
    (a,b)=>{b.pageDelta.reusedPageIndices=[0];},
    (a,b)=>{a.host.inert=false;},
    (a,b)=>{a.host.isConnected=false;},
    (a,b)=>{a.ownerDocument={};},
    (a,b)=>{a.childNodes.reverse();},
    (a,b)=>{b.changedElement.isConnected=true;},
    (a,b)=>{b.plan.pages[1].index=2;},
    (a,b)=>{b.slices[1].pageIndex=0;},
    (a,b)=>{b.slices[2].origin={documentId:'a',blockKey:'wrong'};},
    (a,b)=>{b.slices.pop();},
    (a,b)=>{b.slices.push(b.slices[0]);},
    (a,b)=>{a.childNodes[0].querySelectorAll=()=>[];},
    (a,b)=>{b.changedElement.shadowRoot.childNodes[0].querySelectorAll=()=>[{getAttribute:()=>null}];}
  ]){
    const {previousRoot,result}=fixture();mutate(previousRoot,result);
    assert.equal(prepareSparsePaperAssembly(previousRoot,result),null);
  }
});
