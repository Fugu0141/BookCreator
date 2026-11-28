import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePaperAreaDocument,encodePaperAreaDocument,decodePaperAreaDocument,setPaperAreaValue,setPaperAreaValues,setBookPaperFixed,bindPaperAreaDocument,createPaperAreaDraft,createSavedPaperAreaHistory} from '../paper-area-store.mjs';
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

test('saved history moves only on successful acknowledgement, with revision and scope leases',()=>{
  const h=createSavedPaperAreaHistory(),scope='book/ch/source-r1',s0={revision:null,document:empty};
  const s1={revision:'r1',document:doc},edit=h.plan(scope,s0,'edit',doc);
  assert.deepEqual(h.availability(scope,s0),{canUndo:false,canRedo:false});
  h.accept(edit,s1);
  assert.deepEqual(h.availability(scope,s1),{canUndo:true,canRedo:false});
  assert.equal(h.plan('book/other',s1,'undo'),null);
  assert.equal(h.plan(scope,{...s1,revision:'external'},'undo'),null);
  assert.equal(h.plan(scope,{...s1,document:empty},'undo'),null);
  const back=h.plan(scope,s1,'undo');
  assert.deepEqual(back.next,empty);
  assert.throws(()=>h.accept(back,{revision:'r2',document:doc}));
  assert.equal(h.availability(scope,s1).canUndo,true);
  const s2={revision:'r2',document:empty};
  h.accept(back,s2);
  assert.throws(()=>h.accept(back,s2));
  const forward=h.plan(scope,s2,'redo');
  assert.deepEqual(forward.next,doc);
  h.accept(forward,s1);
  const again=h.plan(scope,s1,'undo');h.accept(again,s2);
  const changed=setPaperAreaValue(empty,width);
  h.accept(h.plan(scope,s2,'edit',changed),{revision:'r3',document:changed});
  assert.equal(h.availability(scope,{revision:'r3',document:changed}).canRedo,false);
  h.clear();assert.equal(h.plan(scope,{revision:'r3',document:changed},'undo'),null);
});

test('trailing space is independent of occupied dimensions and binds as an IL field',()=>{
  const edit={documentId:'ch',persistentId:'q-1'};
  const next=setPaperAreaValues(doc,{...edit,values:{gap:6000}});
  assert.deepEqual(next.entries,[{...edit,minWidthPercent:50,minHeightPercent:25,spaceAfter:6000}]);
  assert.deepEqual(bindPaperAreaDocument(next,[fragment('10')]).intents,[{documentId:'ch',blockKey:'10',placement:{sizeConstraints:{minWidthPercent:50,minHeightPercent:25},spaceAfter:6000}}]);
  assert.deepEqual(setPaperAreaValues(next,{...edit,values:{gap:0}}),doc);
  const only=setPaperAreaValues(empty,{...edit,values:{gap:6000}});
  assert.deepEqual(bindPaperAreaDocument(only,[fragment('10')]).intents,[{documentId:'ch',blockKey:'10',placement:{spaceAfter:6000}}]);
  assert.deepEqual(decodePaperAreaDocument(encodePaperAreaDocument(only)),only);
  for(const gap of [-1,1.5,1000001])assert.throws(()=>setPaperAreaValues(doc,{...edit,values:{gap}}));
});

test('leading and trailing whitespace are independent and do not replace dimensions',()=>{
  const edit={documentId:'ch',persistentId:'q-1'};
  const next=setPaperAreaValues(doc,{...edit,values:{before:4000,gap:6000}});
  assert.deepEqual(bindPaperAreaDocument(next,[fragment('10')]).intents,[{documentId:'ch',blockKey:'10',placement:{sizeConstraints:{minWidthPercent:50,minHeightPercent:25},spaceBefore:4000,spaceAfter:6000}}]);
  assert.deepEqual(setPaperAreaValues(next,{...edit,values:{before:0}}).entries,[{...edit,minWidthPercent:50,minHeightPercent:25,spaceAfter:6000}]);
  for(const before of [-1,1.5,1000001])assert.throws(()=>setPaperAreaValues(doc,{...edit,values:{before}}));
});

test('absolute page lock roundtrips and preserves all explicit area constraints on release',()=>{
  const edit={documentId:'ch',persistentId:'q-1'};
  const position={page:2,x:12000,y:45000};
  const fixed=setBookPaperFixed(doc,{...edit,position});
  assert.deepEqual(decodePaperAreaDocument(encodePaperAreaDocument(fixed)),fixed);
  assert.ok(Object.isFrozen(fixed.entries[0].bookFixed));
  assert.deepEqual(bindPaperAreaDocument(fixed,[fragment('70')]).intents,[{documentId:'ch',blockKey:'70',placement:{sizeConstraints:{minWidthPercent:50,minHeightPercent:25},mode:'fixed',fixed:position}}]);
  assert.throws(()=>setPaperAreaValues(fixed,{...edit,values:{width:60}}),/固定位置/);
  assert.deepEqual(setBookPaperFixed(fixed,{...edit,position:null}),doc);
  assert.deepEqual(setBookPaperFixed(setBookPaperFixed(empty,{...edit,position}),{...edit,position:null}),empty);
  for(const bad of [{page:-1,x:0,y:0},{page:10000,x:0,y:0},{page:0,x:0.5,y:0},{page:0,x:0,y:0,width:1},{page:0,x:0},undefined])assert.throws(()=>setBookPaperFixed(doc,{...edit,position:bad}));
});
