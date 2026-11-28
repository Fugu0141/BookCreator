import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeFrameOpportunity} from '../benchmark-frame-opportunity.mjs';
const rows=()=>Array.from({length:4},(_,i)=>[
  {pair:i+1,arm:'uncached',domMs:30+i,firstCandidateFrameMs:25+i,finalFrameMs:40+i,nextFrameMs:56+i,provisionalFrameSeen:true},
  {pair:i+1,arm:'warm',domMs:28+i,firstCandidateFrameMs:35+i,finalFrameMs:35+i,nextFrameMs:51+i,provisionalFrameSeen:false}
]).flat();
test('separates DOM, provisional candidate, final frame and next frame',()=>{
  const s=summarizeFrameOpportunity(rows());
  assert.equal(s.dom.medianUncachedMs,31.5);assert.equal(s.firstCandidate.medianWarmMs,36.5);
  assert.equal(s.arms.uncached.provisionalFrameCount,4);assert.equal(s.arms.warm.nextP95Ms,54);
});
test('rejects impossible frame ordering and incomplete pairs',()=>{
  for(const patch of [{domMs:99},{nextFrameMs:1},{firstCandidateFrameMs:99},{provisionalFrameSeen:true}]){
    const r=rows();Object.assign(r[1],patch);assert.throws(()=>summarizeFrameOpportunity(r));
  }
  assert.throws(()=>summarizeFrameOpportunity(rows().slice(1)));
});
