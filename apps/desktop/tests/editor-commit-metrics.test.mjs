import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEditorCommitMetrics,summarizeEditorInput} from '../editor-commit-metrics.mjs';
test('counts component commits independently, with immutable snapshots',()=>{
  const metrics=createEditorCommitMetrics();
  metrics.commit('workspace');metrics.commit('source');metrics.commit('source');metrics.commit('structured');metrics.commit('unknown');
  const snapshot=metrics.snapshot();
  assert.deepEqual(snapshot.counts,{workspace:1,source:2,structured:1});
  snapshot.counts.source=99;
  assert.equal(metrics.snapshot().counts.source,2);
});
test('input samples are bounded, validated and isolated from snapshot mutation',()=>{
  const metrics=createEditorCommitMetrics(3),epoch=metrics.epoch();
  for(const ms of [1,2,3,4])assert.equal(metrics.input(ms,epoch),true);
  for(const ms of [-1,Infinity,NaN])assert.equal(metrics.input(ms,epoch),false);
  const snapshot=metrics.snapshot();
  assert.deepEqual(snapshot.inputMs,[2,3,4]);
  snapshot.inputMs.push(100);
  assert.deepEqual(metrics.snapshot().inputMs,[2,3,4]);
});
test('reset excludes pending pre-reset samples and clears counters',()=>{
  const metrics=createEditorCommitMetrics(),old=metrics.epoch();
  metrics.commit('workspace');metrics.input(5,old);metrics.clear();
  assert.equal(metrics.input(8,old),false);
  assert.deepEqual(metrics.snapshot(),{counts:{workspace:0,source:0,structured:0},inputMs:[]});
  assert.equal(metrics.input(3,metrics.epoch()),true);
});
test('median and nearest-rank p95 report empty, odd and even samples',()=>{
  assert.deepEqual(summarizeEditorInput([]),{count:0,median:null,p95:null});
  assert.deepEqual(summarizeEditorInput([4,2,1,3]),{count:4,median:2.5,p95:4});
  assert.deepEqual(summarizeEditorInput([3,1,2]),{count:3,median:2,p95:3});
  assert.equal(summarizeEditorInput(Array.from({length:20},(_,i)=>i+1)).p95,19);
});
