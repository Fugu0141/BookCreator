import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink,readdir,link} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openWorkspace} from '../workspace.mjs';
const empty={schemaVersion:1,entries:[]};
const area=(id,value=30)=>({schemaVersion:1,entries:[{documentId:id,persistentId:'q-1',minHeightPercent:value}]});
const manifest='schemaVersion: 1\ndocumentFormat: {name: bcm, version: 1}\ntitle: Trial layout\nlanguage: ja\ntheme: themes/default/theme.yaml\npage: {size: A4}\nsections:\n  - {id: ch, type: manuscript, role: body, path: manuscript/ch.md}\n  - {id: other, type: manuscript, role: body, path: manuscript/other.md}\n';
const source=':::component{name="example" #q-1}\n例題。\n:::\n';
async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'bc-paper-area-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const book=join(root,'book.yaml'),manuscript=join(root,'manuscript','ch.md'),path=join(root,'layouts','paper-area.json');
  await mkdir(join(root,'manuscript'));await writeFile(book,manifest);await writeFile(manuscript,source);await writeFile(join(root,'manuscript','other.md'),source);
  const workspace=await openWorkspace(book),revision=(await workspace.read('ch')).revision;
  return {root,book,manuscript,path,workspace,revision};
}
test('first save, reopen, merge another manuscript, explicit clearing and source isolation',async t=>{
  const f=await fixture(t),w=f.workspace;
  assert.deepEqual(await w.readPaperArea('ch'),{revision:null,document:empty});
  const saved=await w.savePaperArea('ch',f.revision,null,area('ch'));
  assert.match(saved.revision,/^[a-f0-9]{64}$/);
  const reopened=await openWorkspace(f.book);
  assert.deepEqual(await reopened.readPaperArea('ch'),saved);
  const other=await reopened.savePaperArea('other',(await reopened.read('other')).revision,saved.revision,area('other',70));
  assert.deepEqual((await reopened.readPaperArea('ch')).document,area('ch'));
  const cleared=await reopened.savePaperArea('ch',f.revision,other.revision,empty);
  assert.deepEqual(cleared.document,empty);
  assert.deepEqual((await reopened.readPaperArea('other')).document,area('other',70));
  assert.equal(await readFile(f.manuscript,'utf8'),source);
  assert.equal(await readFile(f.book,'utf8'),manifest);
  assert.deepEqual(await readdir(join(f.root,'layouts')),['paper-area.json']);
});
test('stale intent and manuscript revisions reject writes, no-op does not create file',async t=>{
  const f=await fixture(t),w=f.workspace;
  assert.deepEqual(await w.savePaperArea('ch',f.revision,null,empty),{revision:null,document:empty});
  const first=await w.savePaperArea('ch',f.revision,null,area('ch'));
  await assert.rejects(w.savePaperArea('ch',f.revision,null,area('ch',50)),{code:'CONFLICT'});
  await assert.rejects(w.savePaperArea('ch',f.revision,first.revision,area('other')),{code:'INPUT'});
  await writeFile(f.manuscript,source+'\n本文。\n');
  await assert.rejects(w.savePaperArea('ch',f.revision,first.revision,area('ch',50)),{code:'CONFLICT'});
  assert.deepEqual(await w.readPaperArea('ch'),first);
});
test('unknown schema is not silently replaced',async t=>{
  const f=await fixture(t),w=f.workspace;
  await mkdir(join(f.root,'layouts'));const raw='{"schemaVersion":2,"entries":[]}';await writeFile(f.path,raw);
  await assert.rejects(w.readPaperArea('ch'));
  await assert.rejects(w.savePaperArea('ch',f.revision,null,area('ch')));
  assert.equal(await readFile(f.path,'utf8'),raw);
});
test('linked layout files and directory escapes are refused',{skip:process.platform==='win32'},async t=>{
  const f=await fixture(t),w=f.workspace;
  await symlink(join(f.root,'manuscript'),join(f.root,'layouts'),'dir');
  await assert.rejects(w.readPaperArea('ch'),{code:'PATH'});
  await rm(join(f.root,'layouts'));await mkdir(join(f.root,'layouts'));
  await link(f.manuscript,f.path);
  await assert.rejects(w.readPaperArea('ch'),{code:'PATH'});
});
