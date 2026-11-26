import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createProject} from '../workspace.mjs';
import {settingsRecovery} from '../settings-recovery.mjs';
import {recoveryStore} from '../manuscript-recovery.mjs';

async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'bc-settings-recovery-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const profile=join(root,'profile');await mkdir(profile);
  const workspace=await createProject(root,{title:'復旧設定',folder:'book',size:'A5'});
  return {root,profile,workspace,store:settingsRecovery(profile)};
}
test('typed recovery preserves actual manifest and theme, detects external baseline change',async t=>{
  const {workspace,profile,store}=await fixture(t);
  const themePath=join(workspace.manifestPath,'..','themes','default','theme.yaml');
  const originalTheme=await readFile(themePath),originalManifest=await readFile(workspace.manifestPath);
  const initial=await store.inspect(workspace,'typography');
  const roles={...initial.saved,body:{font:'system-serif',weight:500}};
  const saved=await store.put(workspace,'typography',initial.baseRevision,roles);
  assert.equal(saved.value.body.font,'system-serif');
  assert.equal((await settingsRecovery(profile).inspect(workspace,'typography')).candidate.status,'recoverable');
  assert.deepEqual(await readFile(themePath),originalTheme);
  assert.deepEqual(await readFile(workspace.manifestPath),originalManifest);
  await workspace.saveTypography(initial.baseRevision,{...initial.saved,body:{font:'system-sans',weight:400}});
  const changed=await store.inspect(workspace,'typography');
  assert.equal(changed.candidate.status,'diverged');
  await assert.rejects(store.put(workspace,'typography',changed.baseRevision,roles,saved.version),{code:'RECOVERY_CONFLICT'});
  assert.equal((await store.inspect(workspace,'typography')).candidate.version,saved.version);
  await store.remove(workspace,'typography',saved.version);
  assert.equal((await store.inspect(workspace,'typography')).candidate,null);
});
test('book settings recovery validates geometry and section identity, preserves prior record',async t=>{
  const {workspace,profile,store}=await fixture(t);
  const before=await readFile(workspace.manifestPath);
  const initial=await store.inspect(workspace,'book-settings');
  const value={...initial.saved,page:{...initial.saved.page,size:'A4'}};
  const record=await store.put(workspace,'book-settings',initial.baseRevision,value);
  await assert.rejects(store.put(workspace,'book-settings',initial.baseRevision,{...value,sections:[{id:'unknown',startOn:'page'}]},record.version),{code:'PAGE'});
  await assert.rejects(store.put(workspace,'book-settings',initial.baseRevision,{...value,page:{...value.page,margin:{...value.page.margin,top:999999}}},record.version),{code:'PAGE'});
  assert.equal((await store.inspect(workspace,'book-settings')).candidate.version,record.version);
  assert.deepEqual(await readFile(workspace.manifestPath),before);
  assert.deepEqual(await recoveryStore(profile).list(),{records:[],unreadable:0});
  await workspace.saveBookSettings(initial.baseRevision,value);
  assert.equal((await store.inspect(workspace,'book-settings')).candidate.status,'already-saved');
  await store.remove(workspace,'book-settings',record.version);
  assert.equal((await store.inspect(workspace,'book-settings')).candidate,null);
});
test('settings snapshot rejects unregistered fonts, wrong revision and unknown kind',async t=>{
  const {workspace,store}=await fixture(t);
  const initial=await store.inspect(workspace,'typography');
  await assert.rejects(store.put(workspace,'typography',initial.baseRevision,{...initial.saved,body:{font:'font-missing',weight:400}}),{code:'THEME'});
  await assert.rejects(store.put(workspace,'typography','a'.repeat(64),initial.saved),{code:'RECOVERY_CONFLICT'});
  await assert.rejects(store.inspect(workspace,'component'),{code:'RECOVERY_INPUT'});
  assert.equal((await store.inspect(workspace,'typography')).candidate,null);
});
