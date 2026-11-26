import test from 'node:test';
import assert from 'node:assert/strict';
import {settingsDraftSession} from '../settings-draft-session.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const baseline={baseRevision:'r1',saved:{size:'A5'},candidate:null};
function fixture(info=baseline){
  let record=info.candidate,revision=info.baseRevision,n=0;
  const requests=[],states=[];
  const session=settingsDraftSession(info,async req=>{
    requests.push(req);
    if(req.action==='inspect')return {baseRevision:revision,saved:info.saved,candidate:record};
    assert.equal(req.version,record?.version??null);
    if(req.action==='remove'){record=null;return true;}
    if(req.baseRevision!==revision)throw Error('stale baseline');
    record={version:'v'+(++n),baseRevision:revision,value:req.value,status:'recoverable'};
    return record;
  },(phase,message)=>states.push({phase,message}),1);
  return {session,requests,states,record:()=>record,setRevision:r=>{revision=r;}};
}
test('coalesces settings edits and drains before successful save cleanup',async()=>{
  const f=fixture();
  f.session.update({revision:'r1',dirty:true,value:{size:'A4'}});
  f.session.update({revision:'r1',dirty:true,value:{size:'B5'}});
  await sleep(20);await f.session.pause();
  assert.deepEqual(f.record().value,{size:'B5'});
  f.setRevision('r2');
  await f.session.saved({revision:'r2',dirty:false,value:{size:'B5'}});
  f.session.resume();await sleep(10);
  assert.equal(f.record(),null);f.session.close();
});
test('unresolved candidate survives ordinary discard and rejects changed baseline',async()=>{
  const candidate={version:'old',baseRevision:'r1',status:'recoverable',value:{size:'A4'}};
  const f=fixture({...baseline,candidate});
  f.session.update({revision:'r1',dirty:true,value:{size:'B5'}});
  await sleep(10);await f.session.pause();await f.session.discard();
  assert.deepEqual(f.record(),candidate);assert.equal(f.requests.length,0);
  f.setRevision('r2');
  await assert.rejects(f.session.resolve('restore','r1'),/変更/);
  assert.deepEqual(f.record(),candidate);
  await f.session.resolve('discard','r2');assert.equal(f.record(),null);
  f.session.close();
});
test('explicit restore returns candidate without persisting ordinary settings',async()=>{
  const candidate={version:'old',baseRevision:'r1',status:'recoverable',value:{size:'A4'}};
  const f=fixture({...baseline,candidate});
  assert.deepEqual(await f.session.resolve('restore','r1'),{size:'A4'});
  assert.deepEqual(f.record(),candidate);
  assert.deepEqual(f.requests,[{action:'inspect'}]);
  f.session.close();
});
