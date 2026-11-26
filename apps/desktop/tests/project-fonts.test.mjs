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


const mathFont=process.env.BC_TEST_MATH_FONT;
test('regular MATH font preflight, independent role roundtrip and legacy compatibility',{skip:!mathFont||!font},async t=>{
  const root=await mkdtemp(join(tmpdir(),'bc-math-font-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const bytes=await readFile(mathFont),meta=inspectStaticFont(bytes);
  assert.equal(meta.hasMathTable,true);assert.equal(meta.weight,400);
  assert.equal(inspectStaticFont(await readFile(font)).hasMathTable,false);
  const corrupt=Buffer.from(bytes);
  const count=corrupt.readUInt16BE(4);
  let found=false;
  for(let i=0;i<count;i++){const p=12+i*16;if(corrupt.toString('ascii',p,p+4)==='MATH'){corrupt.writeUInt16BE(1,corrupt.readUInt32BE(p+8)+4);found=true;break;}}
  assert.equal(found,true);assert.throws(()=>inspectStaticFont(corrupt),{code:'FONT'});
  const w=await createProject(root,{title:'Math font',folder:'book',size:'A5'});
  const math=await w.importFont(mathFont,{...rights,license:'TeX Gyre Math fixture'}),text=await w.importFont(font,rights);
  const faces=await w.fonts();
  assert.equal(faces.find(f=>f.id===math.id).hasMathTable,true);
  assert.equal(faces.find(f=>f.id===text.id).hasMathTable,false);
  const normal=faces.find(f=>f.id===text.id),oldMeta=join(root,'book','fonts','imported',normal.sha256,'face.json');
  const old=JSON.parse(await readFile(oldMeta,'utf8'));delete old.hasMathTable;await writeFile(oldMeta,JSON.stringify(old));
  assert.equal((await w.fonts()).find(f=>f.id===text.id).hasMathTable,false);
  const before=await w.typography();
  assert.equal(before.roles.math,undefined);
  for(const invalid of [{font:text.id,weight:400},{font:math.id,weight:700},{font:'font-'+'0'.repeat(64),weight:400}]){
    await assert.rejects(w.saveTypography(before.revision,{...before.roles,math:invalid}),{code:'THEME'});
  }
  const selected={...before.roles,math:{font:math.id,weight:400}};
  const saved=await w.saveTypography(before.revision,selected);
  const reopened=await openWorkspace(join(root,'book','book.yaml'));
  assert.deepEqual((await reopened.typography()).roles,selected);
  await reopened.saveTypography(saved.revision,{...selected,math:{font:'auto',weight:400}});
  assert.deepEqual((await reopened.typography()).roles,before.roles);
});
