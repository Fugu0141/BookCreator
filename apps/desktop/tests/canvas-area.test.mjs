import test from 'node:test';
import assert from 'node:assert/strict';
import {fitCanvasHeight} from '../canvas-area.mjs';
test('fit includes absolute child position, measured text height and both padding edges',()=>{
  assert.equal(fitCanvasHeight([{y:1000,height:5000},{y:9000,height:11000}],2000),24000);
  assert.equal(fitCanvasHeight([{y:0,height:1}],0),1);
});
test('fit rejects unmeasured, invalid or overflowing content',()=>{
  assert.throws(()=>fitCanvasHeight([],1000));
  assert.throws(()=>fitCanvasHeight([{y:0,height:NaN}],0));
  assert.throws(()=>fitCanvasHeight([{y:90000,height:20000}],1000));
});
