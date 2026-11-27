import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarizeRetainedEditSamples,summarizeBurstInputSamples} from '../benchmark-retained-edits.mjs';
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

const bursts=()=>samples().map(r=>{
  const offsets=r.arm==='warm'?[0,35,71,105,141]:[0,35,70,110,150];
  return {...r,case:'burst',burst:{dispatchOffsetsMs:offsets,timerLagMs:offsets.map((n,i)=>Math.max(0,n-i*35)),intermediatePublications:r.arm==='warm'?1:0,totalMs:offsets[4]+r.finalMs}};
});
test('burst comparison separates scheduling lag from final edit latency',()=>{
  const result=summarizeBurstInputSamples(bursts());
  assert.equal(result.inputsPerSample,5);
  assert.equal(result.lastInputToFinal.medianWarmMs,115);
  assert.equal(result.firstInputTaskToFinal.medianWarmMs,256);
  assert.deepEqual(result.arms.warm,{timerLagP95Ms:1,timerLagMaxMs:1,intermediatePublications:4,scheduledInputs:16});
  assert.deepEqual(result.arms.uncached,{timerLagP95Ms:10,timerLagMaxMs:10,intermediatePublications:0,scheduledInputs:16});
});
test('reject inconsistent burst clocks and publication counts',()=>{
  for(const mutate of [b=>b.dispatchOffsetsMs.pop(),b=>b.timerLagMs[3]=999,b=>b.totalMs++,b=>b.intermediatePublications=5]){
    const rows=bursts();mutate(rows[0].burst);
    assert.throws(()=>summarizeBurstInputSamples(rows));
  }
  assert.throws(()=>summarizeBurstInputSamples(bursts().slice(1)));
});
