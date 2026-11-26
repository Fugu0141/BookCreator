import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir,symlink,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {recoveryKey,recoveryStore,recoveryStatus} from '../manuscript-recovery.mjs';

const hash=text=>createHash('sha256').update(text).digest('hex');
async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'bc-recovery-test-'));
  t.after(()=>rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
  const profile=join(root,'profile'),book=join(root,'book'),source=join(book,'chapter.md');
  await mkdir(profile);await mkdir(book);await writeFile(source,'保存済み\n');
  const key=recoveryKey(join(book,'book.yaml'),'chapter','chapter.md');
  return {root,profile,book,source,key,dir:join(profile,'manuscript-recovery-v1'),draft:{baseRevision:hash('保存済み\n'),text:'未保存の日本語と $x^2$。\n'}};
}
test('recovery persists independently across store instances, never modifies manuscript',async t=>{
  const {profile,source,key,draft,dir}=await fixture(t);
  const store=recoveryStore(profile);assert.equal(await store.get(key),null);
  const first=await store.put(key,draft);
  assert.equal(first.text,draft.text);
  assert.equal(await readFile(source,'utf8'),'保存済み\n');
  assert.deepEqual(await recoveryStore(profile).get(key),first);
  assert.equal(recoveryStatus(first,{revision:draft.baseRevision,text:'保存済み\n'}),'recoverable');
  assert.equal(recoveryStatus(first,{revision:hash('外部変更'),text:'外部変更'}),'diverged');
  assert.equal(recoveryStatus(first,{revision:hash(draft.text),text:draft.text}),'already-saved');
  assert.equal(recoveryStatus(null,{}),'none');
  assert.deepEqual(await readdir(dir),[key+'.json']);
  assert.ok(!(await readFile(join(dir,key+'.json'),'utf8')).includes(source));
});
test('compare-and-swap, stale delete, and ordered concurrent writes',async t=>{
  const {profile,key,draft}=await fixture(t),store=recoveryStore(profile);
  const first=await store.put(key,draft);
  assert.deepEqual(await store.put(key,draft,first.version),first);
  await assert.rejects(store.put(key,{...draft,text:'古い書き込み'}),{code:'RECOVERY_CONFLICT'});
  const results=await Promise.allSettled([
    store.put(key,{...draft,text:'次の本文'},first.version),
    store.put(key,{...draft,text:'競合する本文'},first.version)
  ]);
  assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');
  assert.equal(results[1].reason.code,'RECOVERY_CONFLICT');
  await assert.rejects(store.remove(key,first.version),{code:'RECOVERY_CONFLICT'});
  assert.equal((await store.get(key)).text,'次の本文');
  assert.equal(await store.remove(key,results[0].value.version),true);
  assert.equal(await store.get(key),null);
  assert.equal(await store.remove(key,null),false);
});
test('identity separates projects, sections, and changed manuscript mappings',async t=>{
  const {root,profile,book,key,draft}=await fixture(t),store=recoveryStore(profile);
  const other=[recoveryKey(join(root,'other','book.yaml'),'chapter','chapter.md'),recoveryKey(join(book,'book.yaml'),'other','chapter.md'),recoveryKey(join(book,'book.yaml'),'chapter','renamed.md')];
  await store.put(key,draft);
  for(const id of other){assert.notEqual(id,key);assert.equal(await store.get(id),null);}
  await assert.rejects(store.get('../book.yaml'),{code:'RECOVERY_INPUT'});
  assert.throws(()=>recoveryKey('relative/book.yaml','chapter','chapter.md'),{code:'RECOVERY_INPUT'});
});
test('invalid or oversized content does not replace a valid draft',async t=>{
  const {profile,key,draft}=await fixture(t),store=recoveryStore(profile),first=await store.put(key,draft);
  for(const text of ['\r','\u0000','\uD800','あ'.repeat(1500000)])await assert.rejects(store.put(key,{...draft,text},first.version),{code:'RECOVERY_INPUT'});
  assert.deepEqual(await store.get(key),first);
});
test('corrupt recovery file is preserved and reported, not overwritten or deleted',async t=>{
  const {profile,dir,key,draft}=await fixture(t),store=recoveryStore(profile);
  const first=await store.put(key,draft);
  const damaged=JSON.stringify({...first,text:'tampered'});
  await writeFile(join(dir,key+'.json'),damaged);
  await assert.rejects(store.get(key),{code:'RECOVERY_CORRUPT'});
  await assert.rejects(store.put(key,draft,first.version),{code:'RECOVERY_CORRUPT'});
  await assert.rejects(store.remove(key,first.version),{code:'RECOVERY_CORRUPT'});
  assert.equal(await readFile(join(dir,key+'.json'),'utf8'),damaged);
});
test('unsafe recovery directory and symlink file are rejected',async t=>{
  const {root,profile,dir,key,draft,source}=await fixture(t);
  await symlink(root,dir,process.platform==='win32'?'junction':'dir');
  await assert.rejects(recoveryStore(profile).get(key),{code:'RECOVERY_PATH'});
  await rm(dir);await mkdir(dir);
  try{await symlink(source,join(dir,key+'.json'),'file');}
  catch(e){if(process.platform==='win32'&&['EPERM','EACCES'].includes(e.code)){t.diagnostic('File symlink requires Windows privilege');return;}throw e;}
  await assert.rejects(recoveryStore(profile).put(key,draft),{code:'RECOVERY_PATH'});
  assert.equal(await readFile(source,'utf8'),'保存済み\n');
});
