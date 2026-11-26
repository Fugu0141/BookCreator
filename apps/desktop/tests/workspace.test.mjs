import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,rm,symlink,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openWorkspace,createProject} from '../workspace.mjs';
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

test('new project creates manifest, manuscript and theme, does not overwrite',async t=>{
  const parent=await mkdtemp(join(tmpdir(),'bc-new-'));t.after(()=>rm(parent,{recursive:true,force:true}));
  const options={title:'新しい本',folder:'my-book',size:'A5'};
  const w=await createProject(parent,options);
  const root=join(parent,'my-book'),book=join(root,'book.yaml');
  assert.equal(w.summary.title,'新しい本');
  assert.match(await readFile(book,'utf8'),/size: A5/);
  assert.equal((await w.read('chapter-01')).text,'# はじめに\n\nここから原稿を書き始めます。\n');
  assert.equal((await w.typography()).roles.body.font,'noto-sans-jp');
  assert.deepEqual((await w.typography()).roles.math,{font:'stix-two-math',weight:400});
  const before=await readFile(book);
  await assert.rejects(createProject(parent,options),{code:'EEXIST'});
  assert.deepEqual(await readFile(book),before);
  await assert.rejects(createProject(parent,{...options,folder:'../escape'}),{code:'INPUT'});
});
test('theme font roles persist, preserve unrelated metadata and reject stale writes',async t=>{
  const f=await fixture(t);await mkdir(join(f.root,'themes','default'),{recursive:true});
  const path=join(f.root,'themes','default','theme.yaml');
  await writeFile(path,'# preserved\nschemaVersion: 1\nid: default\nname: Default\ncustom: {kept: true}\n');
  const w=await openWorkspace(f.book),initial=await w.typography();
  assert.equal(initial.editable,true);assert.equal(initial.roles,null);
  const value={body:{font:'system-serif',weight:400},heading:{font:'noto-sans-jp',weight:700}};
  const saved=await w.saveTypography(initial.revision,value);
  assert.deepEqual((await (await openWorkspace(f.book)).typography()).roles,value);
  const contents=await readFile(path,'utf8');
  assert.match(contents,/# preserved/);assert.match(contents,/kept: true/);
  await assert.rejects(w.saveTypography(initial.revision,value),{code:'CONFLICT'});
  await assert.rejects(w.saveTypography(saved.revision,{...value,body:{font:'unregistered',weight:400}}),{code:'THEME'});
  await writeFile(path,contents+'# external\n');
  await assert.rejects(w.saveTypography(saved.revision,value),{code:'CONFLICT'});
});
test('missing or future typography is not editable',async t=>{
  const f=await fixture(t);const w=await openWorkspace(f.book);
  assert.equal((await w.typography()).editable,false);
  await mkdir(join(f.root,'themes','default'),{recursive:true});
  await writeFile(join(f.root,'themes','default','theme.yaml'),'schemaVersion: 1\ntypography: {schemaVersion: 2, roles: {}}\n');
  assert.equal((await w.typography()).editable,false);
});

test('paper and ordered section settings roundtrip with preserved metadata and stale guard',async t=>{
  const parent=await mkdtemp(join(tmpdir(),'bc-book-settings-'));t.after(()=>rm(parent,{recursive:true,force:true}));
  const w0=await createProject(parent,{title:'Paper',folder:'book',size:'A5'}),root=join(parent,'book'),path=join(root,'book.yaml');
  await writeFile(join(root,'manuscript','chapter-02.md'),'# 二章\n\n本文。\n');
  await writeFile(path,(await readFile(path,'utf8'))+'  - {id: chapter-02, type: manuscript, role: body, path: manuscript/chapter-02.md, custom: keep}\n');
  const w=await openWorkspace(path),initial=await w.bookSettings();
  assert.equal(initial.page.size,'A5');assert.equal(initial.page.margin.inner,23000);
  const settings={page:{...initial.page,size:'B5',margin:{...initial.page.margin,outer:12000}},sections:[{id:'chapter-02',startOn:'page'},{id:'chapter-01',startOn:'continuous'}]};
  const result=await w.saveBookSettings(initial.revision,settings);
  assert.equal(result.page.size,'B5');assert.deepEqual(result.sections.map(s=>s.id),['chapter-02','chapter-01']);
  assert.deepEqual((await w.readBook()).map(d=>[d.documentId,d.startOn]),[['chapter-02','page'],['chapter-01','continuous']]);
  assert.match(await readFile(path,'utf8'),/custom: keep/);
  assert.deepEqual((await (await openWorkspace(path)).bookSettings()).page,result.page);
  await assert.rejects(w.saveBookSettings(initial.revision,settings),{code:'CONFLICT'});
  await assert.rejects(w.saveBookSettings(result.revision,{...settings,page:{...settings.page,margin:{...settings.page.margin,inner:999000}}}),{code:'PAGE'});
});
test('whole-book preview refuses unsupported cover instead of dropping it',async t=>{
  const f=await fixture(t);const w=await openWorkspace(f.book);await assert.rejects(w.readBook(),{code:'PREVIEW'});
});

test('component theme roundtrip preserves typography and rejects stale or invalid designs',async t=>{
  const {defaultHeadingDesign}=await import('../../../dist/preview-component.js');
  const parent=await mkdtemp(join(tmpdir(),'bc-component-'));t.after(()=>rm(parent,{recursive:true,force:true}));
  const w=await createProject(parent,{title:'Components',folder:'book',size:'A5'});
  const before=await w.typography(),design=defaultHeadingDesign();
  assert.equal(before.headingDesign,null);assert.equal(before.componentEditable,true);
  await assert.rejects(w.saveHeadingDesign(before.revision,{...design,children:[]}),RangeError);
  const after=await w.saveHeadingDesign(before.revision,design);
  assert.deepEqual(after.roles,before.roles);
  const reopened=await openWorkspace(join(parent,'book','book.yaml'));
  assert.deepEqual((await reopened.typography()).headingDesign,design);
  await assert.rejects(w.saveHeadingDesign(before.revision,design),{code:'CONFLICT'});
  const saved=await w.saveTypography(after.revision,{...after.roles,heading:{font:'system-serif',weight:700}});
  assert.deepEqual(saved.headingDesign,design);
});

test('per-level registry preserves shared design and validates component font IDs',async t=>{
  const {defaultHeadingDesign}=await import('../../../dist/preview-component.js');
  const parent=await mkdtemp(join(tmpdir(),'bc-component-levels-'));t.after(()=>rm(parent,{recursive:true,force:true}));
  const w=await createProject(parent,{title:'Levels',folder:'book',size:'A5'});
  const initial=await w.typography(),shared=defaultHeadingDesign();
  const first=await w.saveHeadingDesign(initial.revision,shared);
  const special={...shared,direction:'column',font:{id:'system-serif',weight:700},children:[{id:'label',type:'label',width:'fill',text:'CHAPTER',fontSize:3000,lineHeight:1.5,color:'#315b86',font:{id:'system-monospace',weight:400}},{id:'content',type:'content'}]};
  const second=await w.saveHeadingDesign(first.revision,special,'2');
  assert.deepEqual(second.headingDesign,shared);assert.deepEqual(second.headingLevels['2'],special);
  const reopened=await openWorkspace(join(parent,'book','book.yaml'));
  assert.deepEqual((await reopened.typography()).headingLevels['2'],special);
  await assert.rejects(w.saveHeadingDesign(second.revision,{...special,font:{id:'font-'+'a'.repeat(64),weight:400}},'3'),{code:'THEME'});
  const reset=await w.saveHeadingDesign(second.revision,null,'2');
  assert.deepEqual(reset.headingLevels,{});assert.deepEqual(reset.headingDesign,shared);
});

test('nested component storage validates global content count and nested font references',async t=>{
  const {defaultHeadingDesign}=await import('../../../dist/preview-component.js');
  const parent=await mkdtemp(join(tmpdir(),'bc-nested-'));t.after(()=>rm(parent,{recursive:true,force:true}));
  const w=await createProject(parent,{title:'Nested',folder:'book',size:'A5'}),initial=await w.typography(),shared=defaultHeadingDesign();
  const label={id:'label',type:'label',width:'fill',text:'CHAPTER',fontSize:3000,lineHeight:1.5,color:'#315b86',font:{id:'system-monospace',weight:400}};
  const group={id:'group',type:'group',direction:'column',width:'fill',gap:1000,padding:1000,background:'#ffffff',children:[label,{id:'content',type:'content'}]};
  const design={...shared,children:[shared.children[0],group]};
  const saved=await w.saveHeadingDesign(initial.revision,design,'2');
  assert.deepEqual((await (await openWorkspace(join(parent,'book','book.yaml'))).typography()).headingLevels['2'],design);
  await assert.rejects(w.saveHeadingDesign(saved.revision,{...design,children:[...design.children,{id:'duplicate',type:'content'}]},'2'),RangeError);
  await assert.rejects(w.saveHeadingDesign(saved.revision,{...design,children:[{...group,children:[{...label,font:{id:'font-'+'a'.repeat(64),weight:400}},group.children[1]]}]},'2'),{code:'THEME'});
});

test('Canvas component persists coordinates and rejects coordinates outside canvas schema',async t=>{
  const {defaultHeadingDesign}=await import('../../../dist/preview-component.js');
  const parent=await mkdtemp(join(tmpdir(),'bc-canvas-'));t.after(()=>rm(parent,{recursive:true,force:true}));
  const w=await createProject(parent,{title:'Canvas',folder:'book',size:'A5'}),initial=await w.typography();
  const canvas={id:'canvas',type:'group',direction:'canvas',width:'fill',height:50000,gap:0,padding:1000,background:'#ffffff',children:[{id:'content',type:'content',x:2000,y:5000,width:50000},{id:'bar',type:'rect',x:0,y:0,width:3000,height:10000,color:'#315b86'}]};
  const design={...defaultHeadingDesign(),children:[canvas]};
  const saved=await w.saveHeadingDesign(initial.revision,design,'1');
  assert.deepEqual((await (await openWorkspace(join(parent,'book','book.yaml'))).typography()).headingLevels['1'],design);
  await assert.rejects(w.saveHeadingDesign(saved.revision,{...design,children:[{...canvas,direction:'column'}]},'1'),RangeError);
  await assert.rejects(w.saveHeadingDesign(saved.revision,{...design,children:[{...canvas,children:[{id:'content',type:'content',x:-1,y:0,width:10000}]}]},'1'),RangeError);
});
