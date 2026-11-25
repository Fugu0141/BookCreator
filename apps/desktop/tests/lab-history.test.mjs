import test from 'node:test';
import assert from 'node:assert/strict';
import {createHistory,commitHistory,undoHistory,redoHistory} from '../lab-history.mjs';
import {dragPosition,nudgePosition,resizeSize} from '../canvas-interaction.mjs';
test('history preserves original and redo, new edits discard future',()=>{
  const initial={children:[{id:'a',x:0,y:0}]},a=createHistory(initial),b=commitHistory(a,{children:[{id:'a',x:3000,y:500}]}),c=commitHistory(b,{children:[{id:'a',x:8000,y:1500}]});
  assert.equal(undoHistory(c).present,b.present);
  assert.equal(redoHistory(undoHistory(c)).present,c.present);
  assert.equal(undoHistory(undoHistory(c)).present,initial);
  assert.equal(commitHistory(c,structuredClone(c.present)),c);
  assert.deepEqual(commitHistory(undoHistory(c),{children:[]}).future,[]);
  assert.equal(initial.children[0].x,0);
});
test('history retains at most 64 past snapshots',()=>{
  let h=createHistory({n:0});for(let i=1;i<=100;i++)h=commitHistory(h,{n:i});
  assert.equal(h.past.length,64);
  for(let i=0;i<100;i++)h=undoHistory(h);
  assert.equal(h.present.n,36);
});
test('drag snaps and clamps to measured canvas bounds',()=>{
  assert.deepEqual(dragPosition({x:3000,y:5000},{x:1457,y:-333},{x:20000,y:30000}),{x:4500,y:4700});
  assert.deepEqual(dragPosition({x:3000,y:5000},{x:-99999,y:99999},{x:20000,y:25678}),{x:0,y:25678});
  assert.throws(()=>dragPosition({x:0,y:0},{x:NaN,y:0},{x:10,y:10}),RangeError);
});

test('keyboard nudge preserves other axis, supports coarse step and clamps',()=>{
  const start={x:3550,y:1234},bounds={x:4000,y:1500};
  assert.deepEqual(nudgePosition(start,'ArrowRight',bounds),{x:3650,y:1234});
  assert.deepEqual(nudgePosition(start,'ArrowRight',bounds,true),{x:4000,y:1234});
  assert.deepEqual(nudgePosition(start,'ArrowDown',bounds,true),{x:3550,y:1500});
  assert.deepEqual(nudgePosition({x:50,y:20},'ArrowLeft',bounds),{x:0,y:20});
  assert.equal(nudgePosition(start,'Enter',bounds),null);
});

test('resize dimensions snap, clamp and do not invent text height',()=>{
  const limits={minWidth:100,maxWidth:4300,minHeight:100,maxHeight:2200};
  assert.deepEqual(resizeSize({width:3000},{x:142,y:999},limits),{width:3100});
  assert.deepEqual(resizeSize({width:3000,height:1500},{x:9999,y:-9999},limits),{width:4300,height:100});
  assert.deepEqual(resizeSize({width:3055,height:1555},{x:0,y:0},limits),{width:3055,height:1555});
  assert.deepEqual(resizeSize({width:3000,height:1500},{x:0,y:1000},limits),{width:3000,height:2200});
  assert.throws(()=>resizeSize({width:3000},{x:NaN,y:0},limits),RangeError);
});
