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

async function bookLeaseFixture(t){
  const f=await fixture(t);
  const themePath=join(f.root,'themes','default','theme.yaml');
  await mkdir(join(f.root,'themes','default'),{recursive:true});
  await writeFile(themePath,'schemaVersion: 1\nid: default\nname: Default\n');
  const w=f.workspace;
  const lease={settingsRevision:(await w.bookSettings()).revision,themeRevision:(await w.typography()).revision,documents:(await w.readBook()).map(({documentId,revision})=>({documentId,revision}))};
  return {...f,themePath,lease};
}
test('full-book placement lease writes only selected manuscript and preserves other intents',async t=>{
  const f=await bookLeaseFixture(t),w=f.workspace;
  const first=await w.savePaperArea('ch',f.revision,null,area('ch',40));
  const saved=await w.saveBookPaperArea('other',f.lease,first.revision,area('other',70));
  assert.deepEqual(saved.document,area('other',70));
  assert.deepEqual((await w.readBookPaperArea()).document.entries,[...area('ch',40).entries,...area('other',70).entries]);
  assert.equal(await readFile(f.manuscript,'utf8'),source);
  assert.equal(await readFile(f.book,'utf8'),manifest);
});
test('whole-book lease rejects missing, reordered, foreign or stale manuscripts and stale intent',async t=>{
  const f=await bookLeaseFixture(t),w=f.workspace,l=f.lease;
  for(const documents of [l.documents.slice(0,1),l.documents.slice().reverse(),[l.documents[0],{...l.documents[1],documentId:'unknown'}]])
    await assert.rejects(w.saveBookPaperArea('ch',{...l,documents},null,area('ch')),{code:'INPUT'});
  await assert.rejects(w.saveBookPaperArea('ch',l,null,area('other')),{code:'INPUT'});
  const saved=await w.saveBookPaperArea('ch',l,null,area('ch'));
  await assert.rejects(w.saveBookPaperArea('ch',l,null,area('ch',50)),{code:'CONFLICT'});
  await writeFile(join(f.root,'manuscript','other.md'),source+'\n外部変更。\n');
  await assert.rejects(w.saveBookPaperArea('ch',l,saved.revision,area('ch',50)),{code:'CONFLICT'});
  assert.deepEqual(await w.readPaperArea('ch'),saved);
});
test('whole-book placement rejects stale theme or settings without creating a layout file',async t=>{
  const f=await bookLeaseFixture(t),w=f.workspace,l=f.lease;
  await assert.rejects(w.saveBookPaperArea('ch',{...l,settingsRevision:'0'.repeat(64)},null,area('ch')),{code:'CONFLICT'});
  await writeFile(f.themePath,(await readFile(f.themePath,'utf8'))+'# external\n');
  await assert.rejects(w.saveBookPaperArea('ch',l,null,area('ch')),{code:'CONFLICT'});
  assert.equal((await w.readBookPaperArea()).revision,null);
  await writeFile(f.book,manifest+'# external\n');
  await assert.rejects(w.saveBookPaperArea('ch',l,null,area('ch')),{code:'CONFLICT'});
});

test('absolute page locks require full-book write verification including explicit release',async t=>{
  const f=await bookLeaseFixture(t),w=f.workspace;
  const fixed={schemaVersion:1,entries:[{documentId:'ch',persistentId:'q-1',bookFixed:{page:0,x:0,y:1000}}]};
  await assert.rejects(w.savePaperArea('ch',f.revision,null,fixed),{code:'INPUT'});
  const saved=await w.saveBookPaperArea('ch',f.lease,null,fixed);
  await assert.rejects(w.savePaperArea('ch',f.revision,saved.revision,empty),{code:'INPUT'});
  assert.deepEqual((await w.readBookPaperArea()).document,fixed);
  const released=await w.saveBookPaperArea('ch',f.lease,saved.revision,empty);
  assert.deepEqual(released.document,empty);
});
