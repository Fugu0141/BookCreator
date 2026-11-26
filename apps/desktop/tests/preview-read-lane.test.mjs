import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreviewReadLane} from '../preview-read-lane.mjs';

test('same snapshot requests share a read',async()=>{
  const lane=createPreviewReadLane(),identity={};
  let loads=0;
  const load=async()=>{loads++;return ['document'];};
  assert.deepEqual(await Promise.all([lane.read(identity,()=>true,load),lane.read(identity,()=>true,load)]),[['document'],['document']]);
  assert.equal(loads,1);
});

test('foreground operation can proceed while read is pending and supersedes it',async()=>{
  const lane=createPreviewReadLane(),identity={};
  let release,started;
  const entered=new Promise(r=>{started=r;});
  const pending=lane.read(identity,()=>true,()=>{started();return new Promise(r=>{release=r;});});
  const rejected=assert.rejects(pending,{code:'PREVIEW_RETRY'});
  await entered;
  lane.invalidate();
  await assert.rejects(lane.read(identity,()=>true,()=>['new']),{code:'PREVIEW_RETRY'});
  release(['old']);await rejected;
  assert.deepEqual(await lane.read(identity,()=>true,()=>['new']),['new']);
});

test('busy or switched workspace never yields a snapshot',async()=>{
  const lane=createPreviewReadLane(),identity={};
  let valid=true,release,started;
  const entered=new Promise(r=>{started=r;});
  await assert.rejects(lane.read(identity,()=>false,()=>assert.fail('must not load')),{code:'PREVIEW_RETRY'});
  const pending=lane.read(identity,()=>valid,()=>{started();return new Promise(r=>{release=r;});});
  const rejected=assert.rejects(pending,{code:'PREVIEW_RETRY'});
  await entered;valid=false;release(['old']);await rejected;
  assert.deepEqual(await lane.read({},()=>true,()=>['new']),['new']);
});

test('read failure releases the lane',async()=>{
  const lane=createPreviewReadLane(),identity={};
  await assert.rejects(lane.read(identity,()=>true,()=>{throw Error('disk error');}),/disk error/);
  assert.equal(await lane.read(identity,()=>true,()=>42),42);
});
