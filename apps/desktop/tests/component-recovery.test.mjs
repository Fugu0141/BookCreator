import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createProject} from '../workspace.mjs';
import {componentRecovery} from '../component-recovery.mjs';
import {recoveryStore} from '../manuscript-recovery.mjs';
import {defaultHeadingDesign,defaultParagraphDesign,defaultStudyDesign} from '../../../dist/index.js';
async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'bc-component-draft-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const profile=join(root,'profile');await mkdir(profile);
  const workspace=await createProject(root,{title:'部品復旧',folder:'book',size:'A5'});
  const theme=join(dirname(workspace.manifestPath),'themes','default','theme.yaml');
  return {workspace,theme,profile,store:componentRecovery(profile)};
}
const target=(usage,level='default',entryId=null)=>({usage,level,entryId});
test('component drafts remain separate across usage, level, and library identity',async t=>{
  const {workspace,theme,profile,store}=await fixture(t);
  const before=await readFile(theme),rev=(await workspace.typography()).revision;
  const cases=[
    [target('heading'),{name:'章見出し',design:defaultHeadingDesign()}],
    [target('heading','2'),{name:'節見出し',design:defaultHeadingDesign()}],
    [target('paragraph'),{name:'本文フレーム',design:defaultParagraphDesign()}],
    [target('study','custom'),{name:'未登録の教材部品',design:defaultStudyDesign('note')}],
    [target('study','example'),{name:'',design:defaultStudyDesign('example')}]
  ];
  for(const [key,value] of cases){const record=await store.put(workspace,key,rev,value);assert.equal(record.status,'recoverable');}
  for(const [key,value] of cases){const found=await componentRecovery(profile).inspect(workspace,key);assert.equal(found.candidate.value.name,value.name);assert.equal(found.candidate.status,'recoverable');}
  assert.deepEqual(await readFile(theme),before);
  assert.deepEqual(await recoveryStore(profile).list(),{records:[],unreadable:0});
  assert.deepEqual(await recoveryStore(profile,'settings').list(),{records:[],unreadable:0});
  assert.equal((await recoveryStore(profile,'components').list()).records.length,cases.length);
});
test('registered target, changed revision, stale version and deleted target are protected',async t=>{
  const {workspace,theme,store}=await fixture(t);
  const initial=await workspace.typography();
  const design=defaultHeadingDesign();
  const registered=await workspace.changeComponentLibrary(initial.revision,{type:'add',usage:'heading',name:'登録済み',design});
  const id=registered.library.entries[0].id,key=target('heading','default',id),value={name:'作業案',design:{...design,padding:3000}};
  const record=await store.put(workspace,key,registered.revision,value);
  const before=await readFile(theme);
  assert.equal((await store.inspect(workspace,target('heading'))).candidate,null);
  await assert.rejects(store.remove(workspace,key,'0'.repeat(64)),{code:'RECOVERY_CONFLICT'});
  assert.deepEqual(await readFile(theme),before);
  const renamed=await workspace.changeComponentLibrary(registered.revision,{type:'rename',id,name:'名称変更'});
  assert.equal((await store.inspect(workspace,key)).candidate.status,'diverged');
  await assert.rejects(store.put(workspace,key,renamed.revision,value,record.version),{code:'RECOVERY_CONFLICT'});
  await workspace.changeComponentLibrary(renamed.revision,{type:'delete',id});
  const missing=await store.inspect(workspace,key);
  assert.equal(missing.available,false);assert.equal(missing.candidate.status,'unsupported');
  assert.equal(missing.candidate.version,record.version);
  await store.remove(workspace,key,record.version);
  assert.equal((await store.inspect(workspace,key)).candidate,null);
});
test('invalid target, design and font are rejected before any snapshot replaces a valid draft',async t=>{
  const {workspace,store}=await fixture(t),revision=(await workspace.typography()).revision;
  const key=target('heading'),value={name:'見出し',design:defaultHeadingDesign()};
  const record=await store.put(workspace,key,revision,value);
  await assert.rejects(store.put(workspace,target('heading','7'),revision,value),{code:'INPUT'});
  await assert.rejects(store.put(workspace,key,revision,{...value,design:{...value.design,padding:-1}},record.version));
  await assert.rejects(store.put(workspace,key,revision,{...value,design:{...value.design,font:{id:'font-'+'a'.repeat(64),weight:400}}},record.version));
  await assert.rejects(store.put(workspace,key,revision,{...value,name:'bad\nname'},record.version),{code:'INPUT'});
  assert.equal((await store.inspect(workspace,key)).candidate.version,record.version);
});
