import test from 'node:test';
import assert from 'node:assert/strict';
import {createPaperAreaController} from '../paper-area-controller.mjs';
const fragment=(blockKey='10',persistentId='q-1',placement={})=>({origin:{documentId:'ch',blockKey,persistentId},placement});
const plan=(fragments=[fragment()],revision='r1')=>({revision,fingerprint:'f1',fragments});
const selection={documentId:'ch',blockKey:'10',revision:'r1',fingerprint:'f1'};
const geometry={axis:'height',occupiedPx:200,bodyPx:800,originPx:300};
test('controller connects drag preview, explicit intent, history and remapping',()=>{
  let latest=plan();
  const c=createPaperAreaController(undefined,()=>latest);
  const handle=c.begin(selection,geometry);
  assert.equal(c.preview(handle,500).value,50);
  assert.equal(c.snapshot().dirty,false);
  const result=c.finish(handle,500);
  assert.equal(result.version,1);assert.equal(result.dirty,true);
  assert.deepEqual(result.document.entries,[{documentId:'ch',persistentId:'q-1',minHeightPercent:50}]);
  latest=plan([fragment('70')],'r2');
  assert.equal(c.bind().intents[0].blockKey,'70');
  assert.equal(c.undo(1).document.entries.length,0);
  assert.equal(c.redo(2).document.entries[0].minHeightPercent,50);
  assert.equal(c.clear({...selection,blockKey:'70',revision:'r2'},'height',3).document.entries.length,0);
});
test('cancel, stale plan or stale draft cannot commit a drag',()=>{
  let latest=plan();
  const c=createPaperAreaController(undefined,()=>latest);
  const handle=c.begin(selection,geometry);
  assert.equal(c.finish(handle,500,true),null);
  latest=plan([fragment()],'r2');assert.equal(c.finish(handle,500),null);
  latest=plan();assert.ok(c.finish(handle,500));
  assert.equal(c.finish(handle,600),null);
  assert.equal(c.clear(selection,'height',0),null);
});
test('no persistent identity, split/duplicate identity, fixed or missing plan is not editable',()=>{
  for(const latest of [null,plan([fragment('10','')]),plan([fragment(),fragment()]),plan([fragment(),fragment('20')]),plan([fragment('10','q-1',{mode:'fixed'})])]){
    const c=createPaperAreaController(undefined,()=>latest);
    assert.equal(c.begin(selection,geometry),null);
  }
});
