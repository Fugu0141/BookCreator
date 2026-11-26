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
