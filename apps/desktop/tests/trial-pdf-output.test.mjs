import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {assertPdfEnvelope,saveNewTrialPdf,outputTrialPdf} from '../trial-pdf-output.mjs';

// Envelope-only fixture: not a valid complete PDF. The production caller
// must additionally provide a real PDF verifier.
const bytes=Buffer.from('%PDF-1.4\n% test envelope only\n%%EOF\n');
const ticket={revision:'1',fingerprint:'test'},paper={width:148000,height:210000};
async function fixture(fn){
  const dir=await mkdtemp(join(tmpdir(),'bc-trial-pdf-'));
  try{return await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}
}
test('exclusive PDF save preserves bytes and removes temporary file',()=>fixture(async dir=>{
  const destination=join(dir,'本.pdf');
  const saved=await saveNewTrialPdf(destination,bytes);
  assert.equal(saved.byteLength,bytes.length);
  assert.deepEqual(await readFile(destination),bytes);
  assert.deepEqual(await readdir(dir),['本.pdf']);
}));
test('existing destination is never overwritten, including concurrent outputs',()=>fixture(async dir=>{
  const destination=join(dir,'book.pdf');
  await writeFile(destination,'old');
  await assert.rejects(saveNewTrialPdf(destination,bytes),{code:'PDF_EXISTS'});
  assert.equal(await readFile(destination,'utf8'),'old');
  const fresh=join(dir,'fresh.pdf');
  const results=await Promise.allSettled([saveNewTrialPdf(fresh,bytes),saveNewTrialPdf(fresh,bytes)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.code,'PDF_EXISTS');
  assert.deepEqual((await readdir(dir)).sort(),['book.pdf','fresh.pdf']);
}));
test('reject invalid or stale output without writing destination',()=>fixture(async dir=>{
  const destination=join(dir,'book.pdf');
  assert.throws(()=>assertPdfEnvelope(Buffer.from('not a PDF')));
  await assert.rejects(saveNewTrialPdf(destination,Buffer.from('not a PDF')));
  let calls=0;
  await assert.rejects(saveNewTrialPdf(destination,bytes,{isCurrent:()=>++calls===1}),/更新/);
  assert.deepEqual(await readdir(dir),[]);
}));
function options(overrides={}){
  return {ticket,paper,pageCount:3,isCurrent:()=>true,chooseDestination:async()=>null,print:async()=>bytes,verify:async()=>true,...overrides};
}
test('cancelled dialog never prints, verifies or writes',async()=>{
  const never=async()=>{assert.fail('Unexpected operation');};
  assert.deepEqual(await outputTrialPdf(options({print:never,verify:never,save:never})),{status:'cancelled'});
});
test('print configuration preserves CSS geometry and passes expected metadata to verifier',()=>fixture(async dir=>{
  const destination=join(dir,'book.pdf');
  const result=await outputTrialPdf(options({
    chooseDestination:async()=>destination,
    print:async config=>{assert.deepEqual(config,{printBackground:true,displayHeaderFooter:false,preferCSSPageSize:true,scale:1});return bytes;},
    verify:async (data,context)=>{assert.deepEqual(data,bytes);assert.deepEqual(context,{ticket,paper,pageCount:3});return true;}
  }));
  assert.equal(result.status,'saved');assert.equal(result.pageCount,3);assert.equal(result.publicationReady,false);
  assert.deepEqual(await readFile(destination),bytes);
}));
test('verification failure and stale print refuse publication',()=>fixture(async dir=>{
  const destination=join(dir,'book.pdf');
  await assert.rejects(outputTrialPdf(options({chooseDestination:async()=>destination,verify:async()=>false})),/検査/);
  let current=true;
  await assert.rejects(outputTrialPdf(options({chooseDestination:async()=>destination,isCurrent:()=>current,print:async()=>{current=false;return bytes;}})),/更新/);
  assert.deepEqual(await readdir(dir),[]);
}));
