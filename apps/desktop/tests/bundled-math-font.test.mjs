import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {STIX_FONT,verifyPinnedFontBlob,loadBundledMathFont} from '../bundled-math-font.mjs';

test('bundled source is revision and blob pinned, invalid assets fail closed',()=>{
  assert.match(STIX_FONT.commit,/^[a-f0-9]{40}$/);
  assert.match(STIX_FONT.fontBlob,/^[a-f0-9]{40}$/);
  assert.match(STIX_FONT.licenseBlob,/^[a-f0-9]{40}$/);
  const bytes=Buffer.from('fixture');
  const digest=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  assert.equal(verifyPinnedFontBlob(bytes,digest,32),bytes);
  assert.throws(()=>verifyPinnedFontBlob(Buffer.from('altered'),digest,32),/integrity/);
  assert.throws(()=>verifyPinnedFontBlob(bytes,digest,2),/size/);
  assert.throws(()=>verifyPinnedFontBlob(Buffer.alloc(0),digest,32),/size/);
});
test('offline source override cannot bypass pinned asset checks',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'bc-stix-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  await writeFile(join(dir,STIX_FONT.asset),'invalid font');
  await writeFile(join(dir,'OFL.txt'),'invalid license');
  await assert.rejects(loadBundledMathFont(dir),/integrity/);
});
