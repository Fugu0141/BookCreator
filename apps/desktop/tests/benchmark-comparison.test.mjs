import test from 'node:test';
import assert from 'node:assert/strict';
import {cacheComparisonPlan,summarizeCacheComparison} from '../benchmark-comparison.mjs';

test('cache comparison counterbalances four pairs',()=>{
  const plan=cacheComparisonPlan();
  assert.deepEqual(plan.map(p=>p.order),[
    ['uncached','warm'],['warm','uncached'],['uncached','warm'],['warm','uncached']
  ]);
  assert.deepEqual(plan.map(p=>p.pair),[1,2,3,4]);
});
function fixture(){
  return cacheComparisonPlan().flatMap(({pair,order})=>order.flatMap(arm=>[
    {label:'cache-prime-'+pair+'-'+arm,scope:'book',elapsedMs:999},
    {label:'cache-pair-'+pair+'-'+arm,scope:'book',elapsedMs:arm==='uncached'?100*pair:80*pair}
  ]));
}
test('paired summary excludes primers and retains signed differences',()=>{
  const result=summarizeCacheComparison(fixture().reverse());
  assert.equal(result.medianUncachedMs,250);
  assert.equal(result.medianWarmMs,200);
  assert.equal(result.medianPairedDeltaMs,-50);
  assert.equal(result.medianPairedRatio,.8);
  assert.deepEqual(result.pairs.map(p=>p.deltaMs),[-20,-40,-60,-80]);
});
test('comparison rejects incomplete, duplicate or invalid samples',()=>{
  const rows=fixture();
  assert.throws(()=>summarizeCacheComparison(rows.slice(0,-1)),/Missing or invalid/);
  assert.throws(()=>summarizeCacheComparison([...rows,rows[0]]),/Duplicate/);
  assert.throws(()=>summarizeCacheComparison(rows.map(r=>r.label==='cache-pair-1-warm'?{...r,elapsedMs:NaN}:r)),/Missing or invalid/);
});
