import test from 'node:test';
import assert from 'node:assert/strict';
import {createPaperDisplay} from '../paper-display.mjs';

function fixture(){
  const viewport={scrollTop:0,scrollLeft:0,firstElementChild:null,replaceChildren(next){
    if(this.firstElementChild)this.firstElementChild.parentNode=null;
    this.firstElementChild=next??null;
    if(next)next.parentNode=this;
    this.scrollTop=0;this.scrollLeft=0;
  }};
  return {viewport,host:()=>({dataset:{},inert:false,parentNode:null})};
}
test('same target keeps previous host inactive and atomically replaces it',()=>{
  const {viewport,host}=fixture(),display=createPaperDisplay(),old=host(),next=host();
  assert.equal(display.publish(viewport,'a',old),false);
  viewport.scrollTop=200;viewport.scrollLeft=30;
  assert.equal(display.retain(viewport,'a'),true);
  assert.equal(viewport.firstElementChild,old);
  assert.equal(old.inert,true);
  assert.equal(old.dataset.paperFreshness,'previous');
  assert.equal(display.publish(viewport,'a',next),true);
  assert.equal(viewport.firstElementChild,next);
  assert.equal(next.inert,false);
  assert.equal(next.dataset.paperFreshness,'current');
  assert.equal(viewport.scrollTop,200);
  assert.equal(viewport.scrollLeft,30);
});
test('different target clears rather than reusing old pages',()=>{
  const {viewport,host}=fixture(),display=createPaperDisplay();
  display.publish(viewport,'a',host());
  assert.equal(display.retain(viewport,'b'),false);
  assert.equal(viewport.firstElementChild,null);
  assert.equal(display.publish(viewport,'b',host()),false);
});
test('clear and detached host invalidate retention',()=>{
  const {viewport,host}=fixture(),display=createPaperDisplay();
  display.publish(viewport,'a',host());display.clear(viewport);
  assert.equal(display.retain(viewport,'a'),false);
  display.publish(viewport,'a',host());viewport.replaceChildren();
  assert.equal(display.retain(viewport,'a'),false);
});

test('sparse base lease is tied to a successful retained host and invalidated on clear or full publish',()=>{
  const {viewport,host}=fixture(),display=createPaperDisplay(),doc={};
  const make=()=>{
    const h=host();
    Object.defineProperty(h,'isConnected',{get:()=>h.parentNode===viewport});
    const p={nodeType:1,namespaceURI:'http://www.w3.org/1999/xhtml',localName:'div',getAttribute:k=>k==='data-page'?'0':null,querySelectorAll:()=>[]};
    h.shadowRoot={ownerDocument:doc,host:h,childNodes:[p]};
    return {changedElement:h,plan:{pages:[{index:0,fragments:[]}]},slices:[],pageDelta:{snapshot:{},reusedPageIndices:[]}};
  };
  const initial=make();
  assert.deepEqual(display.publishSparse(viewport,'a',initial,null,()=>['page']),{retained:false,pages:['page']});
  assert.equal(display.getSparseBase(viewport,'a'),null);
  assert.equal(display.retain(viewport,'a'),true);
  const lease=display.getSparseBase(viewport,'a');
  assert.equal(lease.snapshot,initial.pageDelta.snapshot);
  const partial=make();partial.changedElement.shadowRoot.childNodes=[];partial.pageDelta.reusedPageIndices=[0];
  assert.equal(display.publishSparse(viewport,'a',partial,{},()=>{throw Error('stale lease must not publish');}),null);
  assert.equal(viewport.firstElementChild,initial.changedElement);
  display.forgetSparseBase();
  assert.equal(display.getSparseBase(viewport,'a'),null);
  assert.equal(display.publishSparse(viewport,'a',partial,lease,()=>[]),null);
  const fresh=make();display.publishSparse(viewport,'a',fresh,null,()=>[]);
  display.retain(viewport,'a');
  assert.ok(display.getSparseBase(viewport,'a'));
  display.publish(viewport,'a',host());display.retain(viewport,'a');
  assert.equal(display.getSparseBase(viewport,'a'),null);
  display.publishSparse(viewport,'a',make(),null,()=>[]);
  assert.equal(display.retain(viewport,'b'),false);
  assert.equal(display.getSparseBase(viewport,'a'),null);
});
