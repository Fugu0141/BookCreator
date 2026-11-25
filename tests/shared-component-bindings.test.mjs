import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultHeadingDesign,resolveHeadingBindings,validateHeadingBindings} from '../dist/index.js';
const id='component-00000000-0000-4000-8000-000000000001';
const design=defaultHeadingDesign(),library={schemaVersion:1,entries:[{id,name:'Shared',usage:'heading',design}]};
test('resolve multiple shared heading targets independently of local definitions',()=>{
  const local={...design,background:'#123456'};
  const r=resolveHeadingBindings(null,{'3':local},{default:id,'2':id},library);
  assert.deepEqual(r.headingDesign,design);assert.deepEqual(r.headingLevels['2'],design);
  assert.deepEqual(r.headingLevels['3'],local);assert.equal(r.headingLevels['1'],undefined);
  r.headingDesign.children[0].height=2;
  assert.equal(r.headingLevels['2'].children[0].height,design.children[0].height);
});
test('missing references, collisions and unknown target keys fail closed',()=>{
  assert.throws(()=>resolveHeadingBindings(design,{}, {default:id},library),/conflict/);
  assert.throws(()=>resolveHeadingBindings(null,{'2':design},{'2':id},library),/conflict/);
  assert.throws(()=>resolveHeadingBindings(null,{}, {'1':id},{schemaVersion:1,entries:[]}),/Missing/);
  for(const b of [null,[],{foo:id},{'1':'missing'}])assert.throws(()=>validateHeadingBindings(b),RangeError);
});
