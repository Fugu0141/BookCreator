import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultHeadingDesign,defaultParagraphDesign,validateHeadingDesign,validateParagraphDesign,compileHeadingDesign} from '../dist/index.js';
test('independent area percentages are preserved in validated and compiled strict designs',()=>{
  const d={...defaultHeadingDesign(),widthPercent:80,minHeightPercent:30};
  assert.deepEqual(validateHeadingDesign(d),d);
  const c=compileHeadingDesign(d).component;
  assert.equal(c.widthPercent,80);assert.equal(c.minHeightPercent,30);
  assert.deepEqual(c.children,d.children);
});
test('reject invalid percentages and unsupported splittable paragraph settings',()=>{
  for(const patch of [{widthPercent:0},{widthPercent:101},{minHeightPercent:0},{minHeightPercent:2.5},{minHeightPercent:'30'}])assert.throws(()=>validateHeadingDesign({...defaultHeadingDesign(),...patch}));
  assert.throws(()=>validateParagraphDesign({...defaultParagraphDesign(),minHeightPercent:30}));
  assert.equal(compileHeadingDesign(defaultHeadingDesign()).component.widthPercent,undefined);
});
