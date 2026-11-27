import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCancelledPreviewLog} from '../cancelled-preview-log.mjs';
test('cancelled preview log is bounded and drained on matching publication',()=>{
  const log=createCancelledPreviewLog(2);
  for(let elapsedMs=1;elapsedMs<=3;elapsedMs++)log.record('a',{elapsedMs});
  const result=log.take('a');
  assert.deepEqual(result,{jobs:[{elapsedMs:2},{elapsedMs:3}],dropped:1});
  assert.deepEqual(log.take('a'),{jobs:[],dropped:0});
  log.record('a',{elapsedMs:4});
  assert.equal(result.jobs.length,2);
});
test('cancelled preview log never exports records from another target',()=>{
  const log=createCancelledPreviewLog();
  log.record('a',{elapsedMs:1});log.record('b',{elapsedMs:2});
  assert.deepEqual(log.take('a'),{jobs:[],dropped:0});
  assert.deepEqual(log.take('b'),{jobs:[],dropped:0});
  assert.throws(()=>createCancelledPreviewLog(0),RangeError);
});
