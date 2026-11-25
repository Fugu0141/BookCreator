import test from 'node:test';
import assert from 'node:assert/strict';
import {snapCanvasPosition} from '../canvas-snap.mjs';
const size={width:4000,height:2000},bounds={width:20000,height:10000};
test('snaps edges and centers independently, preserving exact micrometres',()=>{
  const targets=[{id:'s',x:7000,y:3000,width:5000,height:2000}];
  assert.deepEqual(snapCanvasPosition({x:7200,y:3300},size,bounds,targets),{position:{x:7000,y:3000},guides:{x:7000,y:3000}});
  assert.deepEqual(snapCanvasPosition({x:7800,y:7800},size,bounds,[]),{position:{x:8000,y:8000},guides:{x:10000,y:10000}});
});
test('distant positions remain unchanged and invalid candidates cannot escape bounds',()=>{
  assert.deepEqual(snapCanvasPosition({x:3500,y:1500},size,bounds,[]),{position:{x:3500,y:1500},guides:{}});
  assert.deepEqual(snapCanvasPosition({x:-1,y:99999},size,bounds,[]).position,{x:0,y:8000});
  assert.throws(()=>snapCanvasPosition({x:0,y:0},{width:21000,height:1},bounds,[]),RangeError);
});
