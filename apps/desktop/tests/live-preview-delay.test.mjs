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
