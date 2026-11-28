import test from 'node:test';
import assert from 'node:assert/strict';
import {areaPercentFromDrag} from '../component-area-drag.mjs';
test('area drag uses full body extent and clamps independent percent values',()=>{
  assert.equal(areaPercentFromDrag(80,-50,500),70);
  assert.equal(areaPercentFromDrag(30,100,500),50);
  assert.equal(areaPercentFromDrag(30,50,250),50);
  assert.equal(areaPercentFromDrag(80,500,500),100);
  assert.equal(areaPercentFromDrag(10,-500,500),1);
  assert.throws(()=>areaPercentFromDrag(30,5,0));
});
