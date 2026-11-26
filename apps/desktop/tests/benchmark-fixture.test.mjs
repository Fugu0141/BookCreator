import test from 'node:test';
import assert from 'node:assert/strict';
import {benchmarkFixture} from '../benchmark-fixture.mjs';
test('synthetic workload is reproducible, progressively larger and below current limits',()=>{
  const f=benchmarkFixture();
  assert.deepEqual(f,benchmarkFixture());
  assert.deepEqual(f.chapters.map(c=>c.id),['small','medium','large']);
  const sizes=f.chapters.map(c=>c.source.length);
  assert.ok(sizes[0]<sizes[1]&&sizes[1]<sizes[2]);
  assert.ok(sizes.reduce((a,b)=>a+b,0)<49000);
  assert.ok(f.chapters.reduce((n,c)=>n+(c.source.match(/\$/g)?.length??0)/2,0)<512);
  assert.ok(f.chapters.every(c=>f.manifest.includes('manuscript/'+c.id+'.md')));
});
