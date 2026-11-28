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
  const timing={};
  assert.deepEqual(display.publishSparse(viewport,'a',initial,null,()=>['page'],timing),{retained:false,pages:['page']});
  assert.deepEqual(Object.keys(timing),['assemblyMs','describeMs','commitMs']);
  for(const value of Object.values(timing))assert.ok(Number.isFinite(value)&&value>=0);
  assert.equal(display.getSparseBase(viewport,'a'),null);
  assert.equal(display.retain(viewport,'a'),true);
  const lease=display.getSparseBase(viewport,'a');
  assert.equal(lease.snapshot,initial.pageDelta.snapshot);
  const partial=make();partial.changedElement.shadowRoot.childNodes=[];partial.pageDelta.reusedPageIndices=[0];
  const rejectedTiming={};
  assert.equal(display.publishSparse(viewport,'a',partial,{},()=>{throw Error('stale lease must not publish');},rejectedTiming),null);
  assert.deepEqual(rejectedTiming,{});
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

test('repeated stale retention does not rewrite inert or freshness, but new publication is invalidated',()=>{
  const {viewport,host}=fixture(),display=createPaperDisplay(),old=host();
  let inert=false,inertWrites=0,freshness,freshnessWrites=0;
  Object.defineProperty(old,'inert',{get:()=>inert,set:v=>{inert=v;inertWrites++;}});
  Object.defineProperty(old.dataset,'paperFreshness',{get:()=>freshness,set:v=>{freshness=v;freshnessWrites++;}});
  display.publish(viewport,'a',old);
  display.retain(viewport,'a');
  const counts=[inertWrites,freshnessWrites];
  for(let i=0;i<50;i++)assert.equal(display.retain(viewport,'a'),true);
  assert.deepEqual([inertWrites,freshnessWrites],counts);
  display.publish(viewport,'a',old);
  display.retain(viewport,'a');
  assert.equal(old.inert,true);assert.equal(old.dataset.paperFreshness,'previous');
  assert.ok(inertWrites>counts[0]);assert.ok(freshnessWrites>counts[1]);
});
test('clearing an already empty viewport does not perform another DOM replacement',()=>{
  const {viewport,host}=fixture(),display=createPaperDisplay();
  const original=viewport.replaceChildren.bind(viewport);let calls=0;
  viewport.replaceChildren=(...args)=>{calls++;original(...args);};
  for(let i=0;i<20;i++)assert.equal(display.retain(viewport,'a'),false);
  assert.equal(calls,0);
  display.publish(viewport,'a',host());
  assert.equal(display.retain(viewport,'b'),false);
  assert.equal(calls,2);
  display.clear(viewport);assert.equal(calls,2);
});
