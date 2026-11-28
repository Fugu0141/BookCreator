import test from 'node:test';
import assert from 'node:assert/strict';
import {clipPaperRect} from '../paper-selection-geometry.mjs';
const v={left:10,top:20,right:110,bottom:120};
test('visible rectangle and partial clipping',()=>{
  assert.deepEqual(clipPaperRect({left:20,top:30,right:70,bottom:80},v),{left:20,top:30,width:50,height:50});
  assert.deepEqual(clipPaperRect({left:0,top:15,right:150,bottom:70},v),{left:10,top:20,width:100,height:50});
});
test('hide offscreen, zero and invalid rectangles',()=>{
  for(const r of [{left:120,top:0,right:130,bottom:100},{left:0,top:0,right:10,bottom:100},{left:NaN,top:0,right:50,bottom:60}])
    assert.equal(clipPaperRect(r,v),null);
});
