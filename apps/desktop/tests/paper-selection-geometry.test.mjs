import test from 'node:test';
import assert from 'node:assert/strict';
import {clipPaperRect,placePaperPropertyPanel} from '../paper-selection-geometry.mjs';
const v={left:10,top:20,right:110,bottom:120};
test('visible rectangle and partial clipping',()=>{
  assert.deepEqual(clipPaperRect({left:20,top:30,right:70,bottom:80},v),{left:20,top:30,width:50,height:50});
  assert.deepEqual(clipPaperRect({left:0,top:15,right:150,bottom:70},v),{left:10,top:20,width:100,height:50});
});
test('hide offscreen, zero and invalid rectangles',()=>{
  for(const r of [{left:120,top:0,right:130,bottom:100},{left:0,top:0,right:10,bottom:100},{left:NaN,top:0,right:50,bottom:60}])
    assert.equal(clipPaperRect(r,v),null);
});

test('floating properties prefer below, flip above, and fit narrow viewports',()=>{
  const bounds={left:10,top:20,right:510,bottom:420},size={width:260,height:100};
  assert.deepEqual(placePaperPropertyPanel({left:30,top:40,width:100,height:40},bounds,size),{left:30,top:88,width:260,maxHeight:384});
  assert.deepEqual(placePaperPropertyPanel({left:400,top:350,width:100,height:40},bounds,size),{left:242,top:242,width:260,maxHeight:384});
  assert.deepEqual(placePaperPropertyPanel({left:30,top:40,width:100,height:40},{left:10,top:20,right:210,bottom:120},size),{left:18,top:28,width:184,maxHeight:84});
});
