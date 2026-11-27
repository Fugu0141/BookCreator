import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarizeRetainedEditSamples} from '../benchmark-retained-edits.mjs';
const samples=()=>Array.from({length:4},(_,i)=>[
  {pair:i+1,arm:'uncached',finalMs:200+i*10,provisionalMs:null},
  {pair:i+1,arm:'warm',finalMs:100+i*10,provisionalMs:i%2===0?50+i*10:null}
]).flat();
test('compare paired final and first available DOM including missing provisional deliveries',()=>{
  const result=summarizeRetainedEditSamples('math',samples());
  assert.equal(result.final.medianUncachedMs,215);
  assert.equal(result.final.medianWarmMs,115);
  assert.equal(result.first.medianWarmMs,90);
  assert.deepEqual(result.finalP95,{uncached:230,warm:130});
  assert.deepEqual(result.firstP95,{uncached:230,warm:130});
  assert.equal(result.provisionalCount,2);
  assert.equal(result.retainedCount,4);
  assert.equal(result.provisionalSamples[0].leadMs,50);
});
test('reject impossible latency and incomplete pairs',()=>{
  for(const invalid of [-1,Infinity,201]){
    const rows=samples();rows[1].provisionalMs=invalid;
    assert.throws(()=>summarizeRetainedEditSamples('text',rows));
  }
  const rows=samples();rows[0].provisionalMs=100;
  assert.throws(()=>summarizeRetainedEditSamples('text',rows));
  assert.throws(()=>summarizeRetainedEditSamples('text',samples().slice(1)));
});
