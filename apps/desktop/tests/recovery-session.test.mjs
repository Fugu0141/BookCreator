import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverySession} from '../recovery-session.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const saved={id:'chapter',revision:'r1',text:'保存済み',recovery:{token:'token',status:'none',candidate:null}};
function fixture(file=saved){
  let record=file.recovery.candidate,n=0;
  const requests=[],states=[];
  const session=recoverySession(file,async req=>{
    requests.push(req);await sleep(2);
    assert.equal(req.version,record?.version??null);
    if(req.action==='remove'){record=null;return true;}
    record={version:'v'+(++n),text:req.text};return record;
  },(phase,message)=>states.push({phase,message}),1);
  return {session,requests,states,record:()=>record};
}
test('rapid changes coalesce and pause drains before explicit discard',async()=>{
  const f=fixture();
  f.session.update('一');f.session.update('二');
  await sleep(20);await f.session.pause();
  assert.equal(f.record().text,'二');
  await f.session.discard();assert.equal(f.record(),null);
  await sleep(10);assert.equal(f.record(),null);
  f.session.close();
});
test('save cleanup uses new baseline and stops pending old writes',async()=>{
  const f=fixture();
  f.session.update('未保存');await sleep(20);await f.session.pause();
  await f.session.saved('r2','未保存');
  assert.equal(f.requests.at(-1).action,'remove');
  assert.equal(f.requests.at(-1).baseRevision,'r2');
  f.session.resume('未保存');await sleep(10);
  assert.equal(f.record(),null);
  f.session.close();
});
test('unresolved recovery cannot be overwritten or discarded by switching',async()=>{
  const candidate={version:'old',text:'復旧候補'};
  const f=fixture({...saved,recovery:{...saved.recovery,candidate,status:'recoverable'}});
  f.session.update('別の文字');await sleep(10);
  await f.session.pause();await f.session.discard();
  assert.equal(f.requests.length,0);assert.deepEqual(f.record(),candidate);
  assert.equal(f.session.restore(),'復旧候補');
  f.session.resume('編集済み');await sleep(20);await f.session.pause();
  assert.equal(f.record().text,'編集済み');
  f.session.close();
});
test('candidate deletion is explicit and leaves ordinary text unchanged',async()=>{
  const f=fixture({...saved,recovery:{...saved.recovery,candidate:{version:'old',text:'候補'},status:'diverged'}});
  await f.session.discardCandidate();assert.equal(f.record(),null);
  assert.equal(f.requests[0].action,'remove');
  f.session.close();
});
