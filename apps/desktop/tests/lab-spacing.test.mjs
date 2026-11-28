import test from 'node:test';
import assert from 'node:assert/strict';
import {spacingLimit,stepSpacing} from '../lab-spacing.mjs';
test('visual spacing preserves values beyond the default range and respects available size',()=>{
  assert.equal(spacingLimit(3000,12000),12000);
  assert.equal(spacingLimit(3000,999999),20000);
  assert.equal(spacingLimit(31500,12000),31500);
  assert.equal(spacingLimit(0,1234),1000);
});
test('spacing increments clamp without rounding existing exact values',()=>{
  assert.equal(stepSpacing(2301,1,5000),2801);
  assert.equal(stepSpacing(2301,-1,5000),1801);
  assert.equal(stepSpacing(100,-1,5000),0);
  assert.equal(stepSpacing(4800,1,5000),5000);
});
