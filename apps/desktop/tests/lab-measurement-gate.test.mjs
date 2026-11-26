import test from 'node:test';
import assert from 'node:assert/strict';
import {createLabMeasurementGate} from '../lab-measurement-gate.mjs';
test('successful latest measurement permits registration without manual confirmation',()=>{
  const gate=createLabMeasurementGate();
  const job=gate.begin('draft A');
  assert.equal(gate.isReady('draft A'),false);
  assert.equal(gate.accept(job,'draft A'),true);
  assert.equal(gate.isReady('draft A'),true);
  assert.equal(gate.isReady('draft B'),false);
});
test('editing invalidates old success and late asynchronous results',()=>{
  const gate=createLabMeasurementGate(),old=gate.begin('A');
  gate.invalidate();
  const next=gate.begin('B');
  assert.equal(gate.accept(old,'A'),false);
  assert.equal(gate.accept(next,'A'),false);
  assert.equal(gate.isReady('B'),false);
  assert.equal(gate.accept(next,'B'),true);
  assert.equal(gate.isReady('B'),true);
});
test('retry or failure cannot retain registration authority from a previous success',()=>{
  const gate=createLabMeasurementGate();
  gate.accept(gate.begin('A'),'A');
  const retry=gate.begin('A');
  assert.equal(gate.matches('A'),true);
  assert.equal(gate.isReady('A'),false);
  gate.invalidate();
  assert.equal(gate.accept(retry,'A'),false);
  assert.equal(gate.isReady('A'),false);
});
