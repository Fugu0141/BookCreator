import test from 'node:test';
import assert from 'node:assert/strict';
import {proportionalImageSize,emptyCrop,updateCrop} from '../image-frame.mjs';
const start={width:20000,height:10000},limits={minWidth:100,minHeight:100,maxWidth:40000,maxHeight:15000};
test('frame ratio lock preserves aspect, clamps both axes, and accepts either dimension',()=>{
  assert.deepEqual(proportionalImageSize(start,26000,limits),{width:26000,height:13000});
  assert.deepEqual(proportionalImageSize(start,40000,limits),{width:30000,height:15000});
  assert.deepEqual(proportionalImageSize(start,5000,limits,'height'),{width:10000,height:5000});
  assert.deepEqual(proportionalImageSize(start,0,limits),{width:200,height:100});
});
test('crop insets retain a positive source area and do not mutate the previous draft',()=>{
  const original=emptyCrop(),a=updateCrop(original,'left',60),b=updateCrop(a,'right',70);
  assert.deepEqual(original,emptyCrop());assert.equal(a.right,0);assert.equal(b.right,3900);
  assert.equal(updateCrop(b,'top',12.345).top,1235);
  assert.throws(()=>updateCrop(b,'wrong',1));
});
