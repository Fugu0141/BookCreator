import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProvisionalPaper} from '../provisional-paper.mjs';

function fixture(){
  function node(index){
    const n={dataset:{page:String(index),side:'right'},style:{width:'100px',height:'200px'},isConnected:false,children:[],querySelector:()=>null,setAttribute(){},append(child){this.children.push(child);child.parentNode=this;},remove(){if(this.parentNode){const a=this.parentNode.children;a.splice(a.indexOf(this),1);this.parentNode=null;}},attachShadow(){return {append:child=>{this.copy=child;}};}};
    return n;
  }
  const pages=[node(0),node(1)],viewport={closest:()=>null};
  const host={dataset:{},parentNode:viewport,inert:true,shadowRoot:{children:pages},ownerDocument:{createElement:()=>node(-1)}};
  let fresh=true,owned=true;
  const args={viewport,host,current:()=>fresh,owns:()=>owned};
  const payload=index=>({index,pageCount:2,element:node(index)});
  return {pages,host,args,payload,stale:()=>{fresh=false;},lose:()=>{owned=false;}};
}
test('provisional layers are isolated, inert and reversible',()=>{
  const f=fixture(),controller=createProvisionalPaper(),session=controller.begin(f.args);
  assert.equal(session.show(f.payload(0)),true);
  assert.equal(f.pages[0].children.length,1);
  assert.equal(f.pages[0].children[0].inert,true);
  assert.equal(f.host.dataset.provisionalPages,'1');
  assert.equal(session.show(f.payload(0)),true);
  assert.equal(f.pages[0].children.length,1);
  session.clear();
  assert.equal(f.pages[0].children.length,0);
  assert.equal(f.host.dataset.provisionalPages,undefined);
});
test('mismatched count, dimensions, lease and stale generation are rejected',()=>{
  const f=fixture(),session=createProvisionalPaper().begin(f.args);
  assert.equal(session.show({...f.payload(0),pageCount:3}),false);
  const wrong=f.payload(1);wrong.element.style.width='101px';
  assert.equal(session.show(wrong),false);
  f.stale();
  assert.equal(session.show(f.payload(0)),false);
  const g=fixture(),other=createProvisionalPaper().begin(g.args);
  g.lose();assert.equal(other.show(g.payload(0)),false);
});
test('old cancellation cannot remove newer provisional layers',()=>{
  const f=fixture(),controller=createProvisionalPaper(),a=controller.begin(f.args);
  a.show(f.payload(0));
  const b=controller.begin(f.args);
  assert.equal(f.pages[0].children.length,0);
  assert.equal(b.show(f.payload(1)),true);
  a.clear();
  assert.equal(a.show(f.payload(0)),false);
  assert.equal(f.pages[1].children.length,1);
  controller.clear();
  assert.equal(f.pages[1].children.length,0);
});
