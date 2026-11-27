import test from 'node:test';
import assert from 'node:assert/strict';
import {createLivePreviewDelay} from '../live-preview-delay.mjs';
test('rapid confirmed edits collapse to latest and stale callbacks cannot execute',()=>{
  const callbacks=[],calls=[];
  const delay=createLivePreviewDelay({schedule:fn=>{callbacks.push(fn);return callbacks.length;},unschedule:()=>{}});
  delay.request(()=>calls.push('A'));
  delay.request(()=>calls.push('B'));
  delay.request(()=>calls.push('C'));
  callbacks.forEach(fn=>fn());
  assert.deepEqual(calls,['C']);
});
test('cancellation prevents delayed rendering on IME or route change',()=>{
  const callbacks=[],calls=[];
  const delay=createLivePreviewDelay({schedule:fn=>{callbacks.push(fn);return callbacks.length;},unschedule:()=>{}});
  delay.request(()=>calls.push('old'));
  delay.cancel();callbacks[0]();
  delay.request(()=>calls.push('confirmed'));callbacks[1]();
  assert.deepEqual(calls,['confirmed']);
});

test('default coalescing delay is 100ms and custom timing remains injectable',()=>{
  const scheduled=[],cancelled=[],calls=[];
  const schedule=(fn,ms)=>{scheduled.push({fn,ms});return scheduled.length;};
  const unschedule=id=>cancelled.push(id);
  const delay=createLivePreviewDelay({schedule,unschedule});
  delay.request(()=>calls.push('old'));
  delay.request(()=>calls.push('latest'));
  assert.deepEqual(scheduled.map(s=>s.ms),[100,100]);
  assert.deepEqual(cancelled,[1]);
  scheduled[0].fn();scheduled[1].fn();
  assert.deepEqual(calls,['latest']);
  const custom=createLivePreviewDelay({delay:200,schedule,unschedule});
  custom.request(()=>calls.push('custom'));
  assert.equal(scheduled[2].ms,200);
  custom.cancel();scheduled[2].fn();
  assert.deepEqual(cancelled,[1,3]);
  assert.deepEqual(calls,['latest']);
});

test('per-request timing replaces pending work without changing the default',()=>{
  const scheduled=[],cancelled=[],calls=[];
  const delay=createLivePreviewDelay({schedule:(fn,ms)=>{scheduled.push({fn,ms});return scheduled.length;},unschedule:id=>cancelled.push(id)});
  delay.request(()=>calls.push('cold'));
  delay.request(()=>calls.push('warm'),16);
  delay.request(()=>calls.push('latest'),16);
  assert.deepEqual(scheduled.map(x=>x.ms),[100,16,16]);
  assert.deepEqual(cancelled,[1,2]);
  scheduled.forEach(x=>x.fn());scheduled[2].fn();
  assert.deepEqual(calls,['latest']);
  delay.request(()=>calls.push('default'));
  assert.equal(scheduled[3].ms,100);
  assert.throws(()=>delay.request(()=>{},-1),RangeError);
  assert.throws(()=>delay.request(()=>{},NaN),RangeError);
  scheduled[3].fn();assert.deepEqual(calls,['latest','default']);
});
