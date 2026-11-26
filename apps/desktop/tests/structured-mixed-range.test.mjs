import test from 'node:test';
import assert from 'node:assert/strict';
import {projectMixed,mixedRangeProjection,planMixedRangeValue} from '../structured-mixed.mjs';
const project=raw=>{const mixed=projectMixed(raw);return mixedRangeProjection({row:{mixed},mixed:true,values:mixed.parts.filter(p=>p.kind==='text').map(p=>p.value)});};
const ref=':ref{target="eq-one" format="number"}';
test('one logical range removes text, formula and reference without touching remaining tokens',()=>{
  const p=project('前半$x^2$と'+ref+'です。$y$');
  assert.equal(planMixedRangeValue(p,{original:p.source,start:1,end:6,replacement:'新'}),'前新す。$y$');
});
test('deleting the last formula returns ordinary text',()=>{
  const p=project('前$x$後');
  assert.equal(planMixedRangeValue(p,{original:p.source,start:1,end:2,replacement:''}),'前後');
});
test('protected style, stale selection, grapheme splits and injected markup are rejected',()=>{
  const p=project('前**重要**$x$後');
  for(const request of [{start:0,end:3,replacement:''},{start:2,end:3,replacement:'$y$'},{start:2,end:3,replacement:'',original:'stale'}])assert.throws(()=>planMixedRangeValue(p,{original:p.source,...request}));
  const q=project('前👩‍🔬$x$後');
  assert.throws(()=>planMixedRangeValue(q,{original:q.source,start:2,end:3,replacement:''}));
});
