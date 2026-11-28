import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePaperAreaDocument,encodePaperAreaDocument,decodePaperAreaDocument,setPaperAreaValue,setPaperAreaValues,bindPaperAreaDocument,createPaperAreaDraft} from '../paper-area-store.mjs';
const empty={schemaVersion:1,entries:[]};
const width={documentId:'ch',persistentId:'q-1',axis:'width',value:50};
const height={...width,axis:'height',value:25};
const doc=setPaperAreaValue(setPaperAreaValue(empty,width),height);
const fragment=(blockKey,persistentId='q-1',documentId='ch')=>({origin:{documentId,blockKey,persistentId}});
test('canonical round trip stores stable identity and intent only',()=>{
  const restored=decodePaperAreaDocument(encodePaperAreaDocument(doc));
  assert.deepEqual(restored,{schemaVersion:1,entries:[{documentId:'ch',persistentId:'q-1',minWidthPercent:50,minHeightPercent:25}]});
  assert.ok(Object.isFrozen(restored.entries[0]));
  assert.deepEqual(setPaperAreaValue(restored,{...width,value:0}).entries,[{documentId:'ch',persistentId:'q-1',minHeightPercent:25}]);
  assert.deepEqual(setPaperAreaValue(setPaperAreaValue(restored,{...width,value:0}),{...height,value:0}),empty);
  assert.deepEqual(empty,{schemaVersion:1,entries:[]});
});
test('reject unsupported schemas, unknown geometry, zero and duplicate records',()=>{
  for(const v of [{...doc,schemaVersion:2},{...doc,revision:'r1'},{...doc,entries:[...doc.entries,...doc.entries]},{...doc,entries:[{...doc.entries[0],blockKey:'10'}]},{...doc,entries:[{...doc.entries[0],minHeightPercent:0}]},{...doc,entries:[{documentId:'ch',persistentId:'x'}]}])assert.throws(()=>validatePaperAreaDocument(v));
  assert.throws(()=>decodePaperAreaDocument('{'));
});
test('rebind after source offsets change without affecting another document',()=>{
  for(const offset of ['10','70']){
    assert.deepEqual(bindPaperAreaDocument(doc,[fragment(offset),fragment('10','q-1','other')]),{status:'ready',intents:[{documentId:'ch',blockKey:offset,placement:{sizeConstraints:{minWidthPercent:50,minHeightPercent:25}}}],diagnostics:[]});
  }
});
test('missing, duplicate or split identity rejects entire plan without deleting intents',()=>{
  const two=setPaperAreaValue(doc,{...width,persistentId:'q-2'});
  for(const [fragments,code] of [[[fragment('10','q-2')],'AREA_MISSING'],[[fragment('10'),fragment('10'),fragment('20','q-2')],'AREA_AMBIGUOUS'],[[fragment('10'),fragment('11'),fragment('20','q-2')],'AREA_AMBIGUOUS'],[[fragment('10'),fragment('10','q-2')],'AREA_AMBIGUOUS']]){
    const result=bindPaperAreaDocument(two,fragments);
    assert.equal(result.status,'conflict');assert.deepEqual(result.intents,[]);assert.ok(result.diagnostics.some(d=>d.code===code));
  }
  assert.equal(two.entries.length,2);
});
test('one edit one history step, redo branch, dirty and stale lease protection',()=>{
  const draft=createPaperAreaDraft();
  const first=draft.apply(width,0);assert.equal(first.version,1);assert.equal(first.dirty,true);
  assert.equal(draft.apply(width,1).version,1);
  const second=draft.apply(height,1);assert.equal(second.version,2);
  assert.throws(()=>draft.apply(width,1),/変更/);
  const previous=draft.undo(2);assert.equal(previous.version,3);assert.deepEqual(previous.document,first.document);
  const again=draft.redo(3);assert.deepEqual(again.document,doc);
  assert.equal(draft.markSaved(4).dirty,false);
  assert.equal(draft.undo(4).dirty,true);
  const changed=draft.apply({...height,value:30},5);assert.equal(changed.canRedo,false);
  assert.throws(()=>draft.markSaved(4),/変更/);
});

test('unidentified or unrelated fragment sharing a current key is also ambiguous',()=>{
  for(const other of [{origin:{documentId:'ch',blockKey:'10'}},fragment('10','other-id')]){
    const result=bindPaperAreaDocument(doc,[fragment('10'),other]);
    assert.equal(result.status,'conflict');assert.deepEqual(result.intents,[]);
  }
});

test('combined area proposal preserves omitted dimensions and applies both axes as one document',()=>{
  const next=setPaperAreaValues(doc,{documentId:'ch',persistentId:'q-1',values:{width:60,height:0}});
  assert.deepEqual(next.entries,[{documentId:'ch',persistentId:'q-1',minWidthPercent:60}]);
  assert.deepEqual(setPaperAreaValues(doc,{documentId:'ch',persistentId:'q-1',values:{height:35}}).entries,[{documentId:'ch',persistentId:'q-1',minWidthPercent:50,minHeightPercent:35}]);
  assert.deepEqual(setPaperAreaValues(empty,{documentId:'ch',persistentId:'q-1',values:{width:40,height:30}}).entries,[{documentId:'ch',persistentId:'q-1',minWidthPercent:40,minHeightPercent:30}]);
  for(const values of [{width:60,height:101},{width:60,depth:10},{},null]){
    assert.throws(()=>setPaperAreaValues(doc,{documentId:'ch',persistentId:'q-1',values}));
  }
  assert.deepEqual(doc.entries,[{documentId:'ch',persistentId:'q-1',minWidthPercent:50,minHeightPercent:25}]);
});
