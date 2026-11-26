import test from 'node:test';
import assert from 'node:assert/strict';
import {createPerformanceMetrics,summarizePerformance} from '../performance-metrics.mjs';
const event={stage:'measurement',category:'book',outcome:'success',waitMs:2,runMs:4};
test('bounded records contain only numeric data and allowed categories',()=>{
  const m=createPerformanceMetrics(2);
  m.record({...event,source:'secret',path:'private'});
  m.record({...event,category:'private title'});
  m.record({...event,runMs:10});m.record({...event,runMs:20});
  const rows=m.snapshot();assert.deepEqual(rows.map(r=>r.runMs),[10,20]);
  assert.deepEqual(Object.keys(rows[0]),['stage','category','outcome','waitMs','runMs','retries']);
  rows[0].runMs=100;assert.equal(m.snapshot()[0].runMs,10);
  m.clear();assert.deepEqual(m.snapshot(),[]);
});
test('summary separates categories and excludes failed and cancelled durations from successful latency',()=>{
  const m=createPerformanceMetrics();
  for(const runMs of [2,10,20,100])m.record({...event,runMs});
  m.record({...event,outcome:'failed',runMs:999,retries:4});
  m.record({...event,outcome:'cancelled',waitMs:999});
  m.record({...event,category:'catalog',outcome:'cancelled'});
  const [book,catalog]=summarizePerformance(m.snapshot());
  assert.deepEqual(book,{stage:'measurement',category:'book',success:4,failed:1,cancelled:1,retries:4,medianWaitMs:2,medianRunMs:15,maxRunMs:100});
  assert.equal(catalog.medianRunMs,null);
});
