import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {projectCatalog} from '../project-catalog.mjs';

test('catalog reopens registered IDs, remembers favorites, and never removes project files',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'bc-catalog-'));
  try{
    const a=join(dir,'A'),b=join(dir,'B');await mkdir(a);await mkdir(b);
    const first=join(a,'book.yaml'),second=join(b,'book.yaml');
    await writeFile(first,'first');await writeFile(second,'second');
    const c=projectCatalog(dir);assert.deepEqual(await c.list(),[]);
    let list=await c.remember(first,'数学');const id=list[0].id;
    await c.favorite(id,true);await c.remember(second,'物理');
    list=await c.remember(first,'数学 改訂');assert.equal(list.length,2);assert.equal(list[0].id,id);assert.equal(list[0].favorite,true);
    const restored=projectCatalog(dir);assert.equal(await restored.pathFor(id),first);
    await assert.rejects(()=>restored.pathFor(second));
    await restored.forget(id);await assert.rejects(()=>restored.pathFor(id));
    assert.equal(await readFile(first,'utf8'),'first');assert.equal((await restored.list()).length,1);
    await writeFile(join(dir,'project-catalog.json'),'broken');
    await assert.rejects(()=>restored.remember(first,'数学'));
    assert.equal(await readFile(join(dir,'project-catalog.json'),'utf8'),'broken');
  }finally{await rm(dir,{recursive:true,force:true});}
});
