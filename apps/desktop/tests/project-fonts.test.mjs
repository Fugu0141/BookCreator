import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,symlink,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,extname} from 'node:path';
import {inspectStaticFont,projectFonts} from '../project-fonts.mjs';
import {createProject,openWorkspace} from '../workspace.mjs';
const rights={license:'Liberation Sans fixture',licenseText:'Disposable test fixture; see installed font license',copyAllowed:true,embedAllowed:false};
const font=process.env.BC_TEST_FONT;
test('malformed SFNT and missing copy permission rejected',async t=>{
  assert.throws(()=>inspectStaticFont(Buffer.alloc(12)),{code:'FONT'});
  const root=await mkdtemp(join(tmpdir(),'bc-font-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await assert.rejects(projectFonts(root).add('not-read.ttf',{...rights,copyAllowed:false}),{code:'FONT'});
  const file=join(root,'bad.ttf');await writeFile(file,Buffer.alloc(50));
  await assert.rejects(projectFonts(root).add(file,rights),{code:'FONT'});
});
test('real font import, deduplication, exact weight, theme roundtrip, tamper detection',{skip:!font},async t=>{
  const root=await mkdtemp(join(tmpdir(),'bc-font-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const w=await createProject(root,{title:'Fonts',folder:'book',size:'A5'});
  const first=await w.importFont(font,rights);assert.equal(first.duplicate,false);
  const second=await w.importFont(font,{...rights,license:'Different declaration',embedAllowed:true});assert.equal(second.duplicate,true);assert.equal(first.id,second.id);
  const [f]=await w.fonts();assert.equal(f.id,first.id);assert.equal(f.copyAllowed,true);assert.equal(f.license,rights.license);assert.equal(f.embedAllowed,false);
  const theme=await w.typography(),roles={...theme.roles,body:{font:f.id,weight:f.weight}};
  await assert.rejects(w.saveTypography(theme.revision,{...roles,body:{font:f.id,weight:f.weight===400?700:400}}),{code:'THEME'});
  await w.saveTypography(theme.revision,roles);
  const reopened=await openWorkspace(join(root,'book','book.yaml'));assert.deepEqual((await reopened.typography()).roles,roles);
  const path=join(root,'book','fonts','imported',f.sha256,'font'+extname(font).toLowerCase());
  const bytes=await readFile(path);bytes[0]^=1;await writeFile(path,bytes);
  await assert.rejects(reopened.fonts(),{code:'FONT'});
});
test('symlink font directory rejected',{skip:process.platform==='win32'},async t=>{
  const root=await mkdtemp(join(tmpdir(),'bc-font-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'outside'));await symlink(join(root,'outside'),join(root,'fonts'));
  await assert.rejects(projectFonts(root).list(),{code:'FONT'});
});
