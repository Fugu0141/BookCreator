import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {defaultHeadingDesign,validateHeadingDesign,compileHeadingDesign} from '../../../dist/preview-component.js';
import {createProject,openWorkspace} from '../workspace.mjs';
import {tinyPng} from './png-fixture.mjs';
const image=id=>({id:'art',type:'image',assetId:id,width:10000,height:5000,fit:'contain',alt:'Sample'});
const design=id=>({...defaultHeadingDesign(),children:[image(id),{id:'content',type:'content'}]});
test('strict image reference schema and compilation preserve stable resource ID',()=>{
  const id='a'.repeat(64),d=design(id);
  assert.deepEqual(compileHeadingDesign(d).component.children[0],image(id));
  for(const patch of [{assetId:'https://example.com/a.png'},{height:0},{fit:'stretch'},{alt:'a\nb'},{url:'file:///tmp/a.png'}]){
    assert.throws(()=>validateHeadingDesign({...d,children:[{...image(id),...patch},d.children[1]]}),RangeError);
  }
});
test('image theme save/reopen requires existing untampered project asset',async t=>{
  const root=await mkdtemp(join(tmpdir(),'bc-image-theme-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const ws=await createProject(root,{title:'Image test',folder:'book',size:'A5'});
  const src=join(root,'fixture.png');await writeFile(src,tinyPng());
  const {id}=await ws.importImage(src),old=await ws.typography();
  await assert.rejects(ws.saveHeadingDesign(old.revision,design('b'.repeat(64))));
  const saved=await ws.saveHeadingDesign(old.revision,design(id),'1');
  assert.deepEqual(saved.headingLevels['1'],design(id));
  const reopened=await openWorkspace(join(root,'book','book.yaml'));
  assert.deepEqual((await reopened.typography()).headingLevels['1'],design(id));
  await unlink(join(root,'book','assets','images',id+'.png'));
  const missing=await reopened.typography();
  assert.equal(missing.componentEditable,false);assert.ok(missing.componentMessage);
});
