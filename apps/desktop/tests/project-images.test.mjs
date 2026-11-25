import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile,mkdir,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inspectPng,projectImages} from '../project-images.mjs';
import {tinyPng,pngChunk} from './png-fixture.mjs';
test('inspect static PNG and reject damaged chunks, oversized dimensions and APNG',()=>{
  const png=tinyPng();
  assert.deepEqual(inspectPng(png),{width:2,height:1,byteLength:png.length});
  const bad=Buffer.from(png);bad[20]^=1;assert.throws(()=>inspectPng(bad),/CRC/);
  assert.throws(()=>inspectPng(png.subarray(0,-1)));
  const large=Buffer.from(png.subarray(16,29));large.writeUInt32BE(9000,0);
  assert.throws(()=>inspectPng(Buffer.concat([png.subarray(0,8),pngChunk('IHDR',large),png.subarray(33)])),/geometry/);
  assert.throws(()=>inspectPng(Buffer.concat([png.subarray(0,33),pngChunk('acTL',Buffer.alloc(8)),png.subarray(33)])),/animated/);
});
test('project image copy is deduplicated, portable, and checked on each read',async t=>{
  const root=await mkdtemp(join(tmpdir(),'bc-images-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const src=join(root,'source.png'),png=tinyPng();await writeFile(src,png);
  const store=projectImages(root);assert.deepEqual(await store.list(),[]);
  const first=await store.add(src),second=await store.add(src);
  assert.equal(first.duplicate,false);assert.equal(second.duplicate,true);assert.equal(first.id,second.id);
  assert.equal((await store.list()).length,1);
  assert.deepEqual((await store.read(first.id)).bytes,png);
  const path=join(root,'assets','images',first.id+'.png');assert.deepEqual(await readFile(path),png);
  await writeFile(path,Buffer.concat([png,Buffer.from([1])]));
  await assert.rejects(store.read(first.id),/hash mismatch/);
  await assert.rejects(store.read('../source'),/Invalid image ID/);
});
test('linked asset directory is refused',async t=>{
  const root=await mkdtemp(join(tmpdir(),'bc-image-link-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'outside'));await symlink(join(root,'outside'),join(root,'assets'),'junction');
  await assert.rejects(projectImages(root).list(),/Unsafe/);
});
