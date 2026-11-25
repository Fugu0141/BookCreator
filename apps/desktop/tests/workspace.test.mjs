import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,rm,symlink,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openWorkspace} from '../workspace.mjs';
const manifest=(path='manuscript/chapter.md')=>'schemaVersion: 1\ndocumentFormat: {name: bcm, version: 1}\ntitle: "Test book"\nlanguage: ja\ntheme: themes/default/theme.yaml\npage: {size: A4}\nsections:\n  - {id: cover, type: cover, role: front-cover, src: assets/cover.png}\n  - {id: chapter, type: manuscript, role: body, path: '+path+'}\n';
async function fixture(t,source='\uFEFF# 日本語\r\n\r\n本文😀\r\n'){
  const root=await mkdtemp(join(tmpdir(),'bc-workspace-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'manuscript'));const path=join(root,'manuscript','chapter.md'),book=join(root,'book.yaml');
  await writeFile(book,manifest());await writeFile(path,source);return {root,path,book};
}
test('project order, BOM/CRLF and unchanged manifest preserved',async t=>{
  const f=await fixture(t);const old=await readFile(f.book);const w=await openWorkspace(f.book);
  assert.deepEqual(w.summary.sections.map(s=>s.id),['cover','chapter']);
  const r=await w.read('chapter');assert.equal(r.text,'# 日本語\n\n本文😀\n');
  assert.equal((await w.save('chapter',r.revision,r.text)).revision,r.revision);
  await w.save('chapter',r.revision,r.text.replace('本文','変更'));
  assert.equal(await readFile(f.path,'utf8'),'\uFEFF# 日本語\r\n\r\n変更😀\r\n');
  assert.deepEqual(await readFile(f.book),old);
  assert.deepEqual(await readdir(join(f.root,'manuscript')),['chapter.md']);
});
test('external edit or manifest change rejects write',async t=>{
  const f=await fixture(t,'old\n');const w=await openWorkspace(f.book);const r=await w.read('chapter');
  await writeFile(f.path,'external\n');await assert.rejects(w.save('chapter',r.revision,'mine\n'),{code:'CONFLICT'});
  assert.equal(await readFile(f.path,'utf8'),'external\n');
  const fresh=await w.read('chapter');await writeFile(f.book,manifest()+'# external\n');
  await assert.rejects(w.save('chapter',fresh.revision,'mine\n'),{code:'CONFLICT'});
});
test('unsafe path, duplicate keys, aliases and unknown formats rejected',async t=>{
  const f=await fixture(t);
  for(const [m,code] of [[manifest('../outside.md'),'PATH'],[manifest()+'title: duplicate\n','MANIFEST'],[manifest().replace('title: "Test book"','title: &a "Test book"'),'MANIFEST'],[manifest().replace('schemaVersion: 1','schemaVersion: 99'),'FORMAT']]){
    await writeFile(f.book,m);await assert.rejects(openWorkspace(f.book),{code});
  }
});
test('mixed line endings read-only; unknown sections cannot be accessed',async t=>{
  const f=await fixture(t,'A\r\nB\n');const w=await openWorkspace(f.book);const r=await w.read('chapter');
  assert.equal(r.editable,false);await assert.rejects(w.save('chapter',r.revision,'C\n'),{code:'FORMAT'});
  await assert.rejects(w.read('cover'),{code:'SECTION'});
});
test('symlink escape rejected', {skip:process.platform==='win32'},async t=>{
  const f=await fixture(t);await rm(f.path);await symlink('/etc/passwd',f.path);
  await assert.rejects(openWorkspace(f.book),{code:'PATH'});
});
