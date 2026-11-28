import test from 'node:test';
import assert from 'node:assert/strict';
import {areaPercentFromDrag,installComponentAreaDrag} from '../component-area-drag.mjs';
test('area drag uses full body extent and clamps independent percent values',()=>{
  assert.equal(areaPercentFromDrag(80,-50,500),70);
  assert.equal(areaPercentFromDrag(30,100,500),50);
  assert.equal(areaPercentFromDrag(30,50,250),50);
  assert.equal(areaPercentFromDrag(80,500,500),100);
  assert.equal(areaPercentFromDrag(10,-500,500),1);
  assert.throws(()=>areaPercentFromDrag(30,5,0));
});

function fixture(){
  const commits=[],active=[];
  const doc={createElement:()=>element()};
  function element(){
    const children=[],listeners=new Map(),attributes=new Map();
    let captured=null;
    const el={children,listeners,attributes,ownerDocument:doc,style:{},dataset:{},
      append(child){children.push(child);},remove(){},
      setAttribute(k,v){attributes.set(k,v);},
      addEventListener(k,fn){listeners.set(k,fn);},
      setPointerCapture(id){captured=id;},hasPointerCapture(id){return captured===id;},
      releasePointerCapture(){captured=null;},
      getBoundingClientRect(){return {width:100,height:40.4};},
    };
    return el;
  }
  const root=element();
  root.style.width='100px';root.style.height='40.4px';
  const um=25400/96;
  const dispose=installComponentAreaDrag({querySelector:()=>root},{
    width:200*um,height:200*um,onCommit:p=>commits.push(p),onActive:v=>active.push(v),
  });
  const handle=root.children.find(c=>c.dataset.labComponentAreaHandle==='height');
  const fire=(type,y,id=1)=>handle.listeners.get(type)({
    pointerId:id,clientY:y,button:0,isPrimary:true,preventDefault(){},stopPropagation(){},
  });
  return {handle,fire,commits,active,dispose};
}
test('return to original measured percentage does not create explicit minimum height',()=>{
  const {fire,commits,active,handle,dispose}=fixture();
  fire('pointerdown',40);fire('pointermove',80);fire('pointermove',40);fire('pointerup',40);
  assert.deepEqual(commits,[]);
  assert.deepEqual(active,[true,false]);
  assert.equal(handle.attributes.get('aria-valuenow'),'20');
  dispose();
});
test('cancel and lost capture discard draft and restore accessible value',()=>{
  for(const type of ['pointercancel','lostpointercapture']){
    const {fire,commits,handle,dispose}=fixture();
    fire('pointerdown',40);fire('pointermove',80);
    assert.equal(handle.attributes.get('aria-valuenow'),'40');
    fire(type,80);
    assert.equal(handle.attributes.get('aria-valuenow'),'20');
    assert.deepEqual(commits,[]);
    dispose();
  }
});
test('completed drag commits once; unrelated pointer cannot finish',()=>{
  const {fire,commits,dispose}=fixture();
  fire('pointerdown',40);fire('pointermove',80);fire('pointerup',80,2);
  assert.deepEqual(commits,[]);
  fire('pointerup',80);fire('lostpointercapture',80);
  assert.deepEqual(commits,[{minHeightPercent:40}]);
  dispose();
});
