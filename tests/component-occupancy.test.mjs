import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultHeadingDesign,defaultParagraphDesign,validateHeadingDesign,validateParagraphDesign,compileHeadingDesign} from '../dist/index.js';

test('both independent percentages persist and compile',()=>{
  for(const patch of [{},{widthPercent:80},{minHeightPercent:30},{widthPercent:80,minHeightPercent:30}]){
    const d={...defaultHeadingDesign(),...patch};
    assert.deepEqual(validateHeadingDesign(d),d);
    assert.deepEqual(validateHeadingDesign(d,'study'),d);
    const c=compileHeadingDesign(d).component;
    for(const key of ['widthPercent','minHeightPercent'])assert.equal(c[key],patch[key]);
    assert.deepEqual(c.children,d.children);
  }
});
test('invalid percentages and splittable paragraph definitions are rejected',()=>{
  for(const key of ['widthPercent','minHeightPercent']){
    for(const v of [0,101,-1,30.5,'50',undefined])assert.throws(()=>validateHeadingDesign({...defaultHeadingDesign(),[key]:v}),RangeError);
    assert.throws(()=>validateParagraphDesign({...defaultParagraphDesign(),[key]:50}),RangeError);
  }
});
