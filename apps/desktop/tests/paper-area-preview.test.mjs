import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSavedAreaPreview,verifySavedAreaPreview,measureInlineAreaProposal,resolvePaperAreaSelection,captureBookAreaLease,prepareBookAreaCommit,prepareBookAreaRestore,acknowledgeBookAreaCommit,prepareBookFixedRelease,resolveBookFixedSelection,prepareBookFixedCommit,resolveBookMoveBounds,prepareBookPreferredCommit,prepareBookGroupCommit,prepareBookGroupRelease,resolveBookGroupMembers,validBookMovePage,createBookPositionPreviewSession} from '../paper-area-preview.mjs';
const origin=(documentId,blockKey,persistentId)=>({documentId,blockKey,persistentId});
const options={revision:'r1',fingerprint:'f1',width:1000,height:2000,sections:[{id:'a',blocks:[{origin:origin('a','40','q')}]},{id:'b',blocks:[{origin:origin('b','70','q')}]}]};
const snapshot={revision:'saved',document:{schemaVersion:1,entries:[{documentId:'a',persistentId:'q',minHeightPercent:30},{documentId:'b',persistentId:'q',minWidthPercent:50}]}};
test('whole-book intent uses current prepared keys and preserves other options',()=>{
  const p=prepareSavedAreaPreview(options,snapshot,{whole:true});
  assert.deepEqual(p.intents,[{documentId:'a',blockKey:'40',placement:{sizeConstraints:{minHeightPercent:30}}},{documentId:'b',blockKey:'70',placement:{sizeConstraints:{minWidthPercent:50}}}]);
  assert.equal(p.options.sections,options.sections);assert.equal(options.intelligentLayout,undefined);
});
test('selected manuscript filters other documents but whole book rejects missing targets',()=>{
  const a={...options,sections:[options.sections[0]]};
  assert.equal(prepareSavedAreaPreview(a,snapshot,{whole:false,documentId:'a'}).intents.length,1);
  assert.throws(()=>prepareSavedAreaPreview(a,snapshot,{whole:true}),{code:'AREA_CONFLICT'});
  assert.equal(prepareSavedAreaPreview(a,snapshot,{whole:false,documentId:'other'}).options,a);
});
test('actual measured fragments, revision and footprint must agree before adoption',()=>{
  const p=prepareSavedAreaPreview(options,snapshot,{whole:true});
  const a={origin:origin('a','40','q'),placement:{rect:{width:1000,height:100},occupiedRect:{width:1000,height:600}}};
  const b={origin:origin('b','70','q'),placement:{rect:{width:500,height:100}}};
  const il={status:'placed',revision:'r1',fingerprint:'f1',fragments:[a,b]};
  assert.doesNotThrow(()=>verifySavedAreaPreview(p,{intelligentLayout:il}));
  for(const bad of [{...il,revision:'old'},{...il,fragments:[a]},{...il,fragments:[a,a,b]},{...il,fragments:[{...a,placement:{rect:{width:1000,height:100}}},b]}])assert.throws(()=>verifySavedAreaPreview(p,{intelligentLayout:bad}));
  assert.throws(()=>verifySavedAreaPreview(p,{}));
});

test('transient resize measures scoped intent without mutating saved data or sharing caches',async()=>{
  const context={target:{documentId:'a'},persistentId:'q',areaPrepared:prepareSavedAreaPreview(options,snapshot,{whole:false,documentId:'a'}),areaSnapshot:snapshot,options:{...options,measurementCache:{},pageCache:{},intelligentLayout:{intents:[]}}};
  const fragment={origin:origin('a','40','q'),placement:{occupiedRect:{width:1000,height:1000}}};
  const result={plan:{completeness:'full',diagnostics:[]},intelligentLayout:{status:'placed',revision:'r1',fingerprint:'f1',fragments:[fragment]}};
  let calls=0;
  const actual=await measureInlineAreaProposal(context,{height:50},async o=>{
    calls++;assert.equal(o.measurementCache,undefined);assert.equal(o.pageCache,undefined);
    assert.deepEqual(o.intelligentLayout.intents,[{documentId:'a',blockKey:'40',placement:{sizeConstraints:{minHeightPercent:50}}}]);
    return result;
  },()=>true);
  assert.equal(actual,result);assert.equal(calls,1);assert.equal(snapshot.document.entries[0].minHeightPercent,30);
  assert.equal(await measureInlineAreaProposal(context,{height:30},()=>{throw Error('no-op measured');},()=>true),undefined);
  let current=true;
  assert.equal(await measureInlineAreaProposal(context,{height:50},async()=>{current=false;return result;},()=>current),undefined);
  assert.equal(await measureInlineAreaProposal(context,{height:50},()=>{throw Error('stale measured');},()=>false),undefined);
  await assert.rejects(()=>measureInlineAreaProposal(context,{height:75},async()=>result,()=>true),/占有領域/);
});

test('draft-owned caches are reused, never page templates or normal preview caches',async()=>{
  const shared={},paragraph={},math={},display={};
  const context={target:{documentId:'a'},persistentId:'q',areaPrepared:prepareSavedAreaPreview(options,snapshot,{whole:false,documentId:'a'}),areaSnapshot:snapshot,options:{...options,paragraphCache:shared,mathCache:shared,displayMathCache:shared,pageCache:shared}};
  const privateCaches={paragraphCache:paragraph,mathCache:math,displayMathCache:display,pageCache:shared,measurementCache:shared};
  for(const height of [40,50]){
    await measureInlineAreaProposal(context,{height},async o=>{
      assert.equal(o.paragraphCache,paragraph);assert.equal(o.mathCache,math);assert.equal(o.displayMathCache,display);
      assert.equal(o.pageCache,undefined);assert.equal(o.measurementCache,undefined);
    },()=>true,privateCaches);
  }
  await assert.rejects(()=>measureInlineAreaProposal(context,{height:50},()=>{throw Error('must not measure');},()=>true,{paragraphCache:shared}),/must not be shared/);
});

test('trailing whitespace must be reserved beyond both measured content and minimum height',()=>{
  const stored={revision:'saved',document:{schemaVersion:1,entries:[{documentId:'a',persistentId:'q',minHeightPercent:30,spaceAfter:200}]}};
  const p=prepareSavedAreaPreview(options,stored,{whole:false,documentId:'a'});
  const result=height=>({intelligentLayout:{status:'placed',revision:'r1',fingerprint:'f1',fragments:[{origin:origin('a','40','q'),placement:{rect:{width:1000,height:700},occupiedRect:{width:1000,height}}}]}});
  assert.doesNotThrow(()=>verifySavedAreaPreview(p,result(900)));
  assert.throws(()=>verifySavedAreaPreview(p,result(800)));
  assert.throws(()=>verifySavedAreaPreview(p,result(899)));
});

test('leading whitespace is verified against preceding occupied footprint or page top',()=>{
  const stored={revision:'saved',document:{schemaVersion:1,entries:[{documentId:'a',persistentId:'q',spaceBefore:200}]}};
  const p=prepareSavedAreaPreview(options,stored,{whole:false,documentId:'a'});
  const prev={origin:origin('a','10','prev'),placement:{page:0,rect:{x:0,y:100,width:500,height:200},occupiedRect:{x:0,y:100,width:500,height:300}}};
  const result=(page,y)=>({intelligentLayout:{status:'placed',revision:'r1',fingerprint:'f1',fragments:[prev,{origin:origin('a','40','q'),placement:{page,rect:{x:0,y,width:1000,height:100}}}]}});
  assert.doesNotThrow(()=>verifySavedAreaPreview(p,result(0,600)));
  assert.throws(()=>verifySavedAreaPreview(p,result(0,599)),/前方余白/);
  assert.doesNotThrow(()=>verifySavedAreaPreview(p,result(1,200)));
  assert.throws(()=>verifySavedAreaPreview(p,result(1,199)),/前方余白/);
});

test('whole-book draft preserves all other manuscript intents including equal local IDs',async()=>{
  const context={scope:'book',target:{documentId:'b'},persistentId:'q',areaPrepared:prepareSavedAreaPreview(options,snapshot,{whole:true}),areaSnapshot:snapshot,options};
  const a={origin:origin('a','40','q'),placement:{rect:{width:1000,height:100},occupiedRect:{width:1000,height:600}}};
  const b={origin:origin('b','70','q'),placement:{rect:{width:750,height:100}}};
  const result={plan:{completeness:'full',diagnostics:[]},intelligentLayout:{status:'placed',revision:'r1',fingerprint:'f1',fragments:[a,b]}};
  assert.equal(await measureInlineAreaProposal(context,{width:75},async o=>{
    assert.equal(o.sections,options.sections);
    assert.deepEqual(o.intelligentLayout.intents,[{documentId:'a',blockKey:'40',placement:{sizeConstraints:{minHeightPercent:30}}},{documentId:'b',blockKey:'70',placement:{sizeConstraints:{minWidthPercent:75}}}]);
    return result;
  },()=>true),result);
  assert.equal(snapshot.document.entries[1].minWidthPercent,50);
  await assert.rejects(()=>measureInlineAreaProposal(context,{width:75},async()=>({...result,intelligentLayout:{...result.intelligentLayout,fragments:[b]}}),()=>true),{code:'AREA_CONFLICT'});
});
test('whole-book selection resolves the exact local identity, not same-named blocks in other manuscripts',()=>{
  const a={origin:origin('a','40','q')},b={origin:origin('b','40','q')};
  const plan={revision:'r1',fingerprint:'f1',fragments:[a,b]};
  assert.deepEqual(resolvePaperAreaSelection(plan,'b','40'),{persistentId:'q',selection:{documentId:'b',blockKey:'40',revision:'r1',fingerprint:'f1'}});
  assert.equal(resolvePaperAreaSelection(plan,'c','40'),null);
  assert.equal(resolvePaperAreaSelection({...plan,fragments:[a,b,b]},'b','40'),null);
  assert.equal(resolvePaperAreaSelection({...plan,fragments:[a,b,{origin:origin('b','41','q')}]},'b','40'),null);
  assert.equal(resolvePaperAreaSelection({...plan,fragments:[a,{...b,placement:{fixed:true}}]},'b','40'),null);
});

test('book placement lease rejects unsaved or unmatched source and duplicate documents',()=>{
  const hash='a'.repeat(64),other='b'.repeat(64);
  const source=[{documentId:'a',revision:hash,source:'text'},{documentId:'b',revision:other,source:'other'}];
  const input={snapshot:source,file:{id:'a',revision:hash},raw:'text',themeRevision:hash,settingsRevision:other};
  const lease=captureBookAreaLease(input);
  assert.deepEqual(lease,{themeRevision:hash,settingsRevision:other,documents:[{documentId:'a',revision:hash},{documentId:'b',revision:other}]});
  for(const bad of [{dirty:true},{themeDirty:true},{settingsDirty:true},{raw:'changed'},{file:{id:'a',revision:other}},{themeRevision:null},{snapshot:[source[0],source[0]]}])assert.equal(captureBookAreaLease({...input,...bad}),null);
});
test('whole book save prepares every chapter but persists only the selected slice',()=>{
  const plan={revision:'r1',fingerprint:'f1',fragments:[{origin:origin('a','40','q')},{origin:origin('b','70','q')}]};
  const context={scope:'book',bookLease:{documents:[{documentId:'a'},{documentId:'b'}]},areaPrepared:prepareSavedAreaPreview(options,snapshot,{whole:true}),areaSnapshot:snapshot,options:{...options,pageCache:{}},plan,...resolvePaperAreaSelection(plan,'b','70')};
  const commit=prepareBookAreaCommit(context,{width:75});
  assert.equal(commit.documentId,'b');
  assert.deepEqual(commit.value.entries,[{documentId:'b',persistentId:'q',minWidthPercent:75}]);
  assert.equal(commit.prepared.intents.length,2);
  assert.equal(commit.prepared.intents[0].placement.sizeConstraints.minHeightPercent,30);
  assert.equal(commit.prepared.options.pageCache,undefined);
  assert.equal(commit.expectedRevision,'saved');
  assert.equal(prepareBookAreaCommit(context,{width:50}),null);
  assert.throws(()=>prepareBookAreaCommit({...context,selection:{...context.selection,revision:'old'}},{width:75}));
  assert.throws(()=>prepareBookAreaCommit({...context,bookLease:{documents:[{documentId:'a'}]}},{width:75}));
  assert.equal(snapshot.document.entries[1].minWidthPercent,50);
});

import {createSavedPaperAreaHistory,setPaperAreaValues} from '../paper-area-store.mjs';

test('book history restores two different chapters in reverse order without overwriting other entries',()=>{
  const history=createSavedPaperAreaHistory(),scope='book-session';
  let current=snapshot,seq=0;
  const context=()=>({scope:'book',bookLease:{documents:[{documentId:'a'},{documentId:'b'}]},areaPrepared:prepareSavedAreaPreview(options,current,{whole:true}),areaSnapshot:current,options});
  function step(action,id,values){
    const next=action==='edit'?setPaperAreaValues(current.document,{documentId:id,persistentId:'q',values}):undefined;
    const ticket=history.plan(scope,current,action,next);
    const commit=prepareBookAreaRestore(context(),ticket);
    assert.equal(commit.documentId,id);
    assert.equal(commit.prepared.intents.length,2);
    const saved={revision:'saved-'+(++seq),document:commit.value};
    current=acknowledgeBookAreaCommit(commit,saved);
    history.accept(ticket,current);
    return current.document.entries.map(e=>e.minHeightPercent??e.minWidthPercent);
  }
  assert.deepEqual(step('edit','a',{height:40}),[40,50]);
  assert.deepEqual(step('edit','b',{width:70}),[40,70]);
  assert.deepEqual(step('undo','b'),[40,50]);
  assert.deepEqual(step('undo','a'),[30,50]);
  assert.deepEqual(step('redo','a'),[40,50]);
  assert.deepEqual(step('redo','b'),[40,70]);
  assert.equal(history.availability('other-session',current).canUndo,false);
  assert.equal(history.availability(scope,{...current,revision:'external'}).canUndo,false);
  const ticket=history.plan(scope,current,'undo');
  const commit=prepareBookAreaRestore(context(),ticket);
  assert.throws(()=>acknowledgeBookAreaCommit(commit,{revision:'bad',document:current.document}));
  assert.equal(history.availability(scope,current).canUndo,true);
  assert.throws(()=>prepareBookAreaRestore(context(),{...ticket,next:snapshot.document}),/復元対象/);
  assert.throws(()=>prepareBookAreaRestore(context(),{...ticket,revision:'old'}));
});

test('absolute page lock cannot be applied with manuscript-local page numbers and must match exact measured coordinates',()=>{
  const stored={revision:'saved',document:{schemaVersion:1,entries:[{documentId:'a',persistentId:'q',bookFixed:{page:2,x:100,y:300}}]}};
  assert.throws(()=>prepareSavedAreaPreview(options,stored,{whole:false,documentId:'a'}),{code:'AREA_BOOK_SCOPE'});
  assert.equal(prepareSavedAreaPreview(options,stored,{whole:false,documentId:'b'}).intents.length,0);
  const p=prepareSavedAreaPreview(options,stored,{whole:true});
  const result=placement=>({intelligentLayout:{status:'placed',revision:'r1',fingerprint:'f1',fragments:[{origin:origin('a','40','q'),placement}]}});
  const exact={page:2,fixed:true,rect:{x:100,y:300,width:500,height:100}};
  assert.doesNotThrow(()=>verifySavedAreaPreview(p,result(exact)));
  for(const bad of [{...exact,page:1},{...exact,fixed:false},{...exact,rect:{...exact.rect,x:101}},{...exact,rect:{...exact.rect,y:301}}])assert.throws(()=>verifySavedAreaPreview(p,result(bad)),/固定位置/);
});


test('failed whole-book recovery removes only the requested existing lock without a measured plan',()=>{
  const lock={page:2,x:20,y:30};
  const areaSnapshot={revision:'a'.repeat(64),document:{schemaVersion:1,entries:[
    {documentId:'a',persistentId:'q',bookFixed:lock,minWidthPercent:40,spaceAfter:100},
    {documentId:'a',persistentId:'other',bookFixed:lock},
    {documentId:'b',persistentId:'q',bookFixed:lock}
  ]}};
  const bookLease={documents:[{documentId:'a'},{documentId:'b'}]};
  const context={areaSnapshot,bookLease};
  const result=prepareBookFixedRelease(context,'a','q');
  assert.deepEqual(result.value,{schemaVersion:1,entries:[
    {documentId:'a',persistentId:'other',bookFixed:lock},
    {documentId:'a',persistentId:'q',minWidthPercent:40,spaceAfter:100}
  ]});
  assert.equal(result.lease,bookLease);
  assert.equal(result.expectedRevision,areaSnapshot.revision);
  assert.equal(areaSnapshot.document.entries[0].bookFixed,lock);
  assert.throws(()=>prepareBookFixedRelease(context,'a','missing'));
  assert.throws(()=>prepareBookFixedRelease({...context,bookLease:{documents:[{documentId:'b'}]}},'a','q'));
  assert.throws(()=>prepareBookFixedRelease({...context,areaSnapshot:{...areaSnapshot,revision:null}},'a','q'));
  assert.deepEqual(prepareBookFixedRelease(context,'a','other').value.entries.map(e=>e.persistentId),['q']);
});


test('empty whole-book opt-in still requests IL geometry for a first lock',()=>{
  const empty={revision:null,document:{schemaVersion:1,entries:[]}};
  assert.deepEqual(prepareSavedAreaPreview(options,empty,{whole:true}).options.intelligentLayout,{intents:[]});
  assert.equal(prepareSavedAreaPreview(options,empty,{whole:false,documentId:'a'}).options,options);
});
test('explicit current-position lock and unlock preserve other intents and validate measured identity',()=>{
  const position={page:2,x:100,y:300};
  const fragment={origin:origin('a','40','q'),placement:{page:2,fixed:false,rect:{x:100,y:300,width:400,height:600}}};
  const plan={revision:'r1',fingerprint:'f1',fragments:[fragment,{origin:origin('b','70','q')}]};
  const selected=resolveBookFixedSelection(plan,'a','40');
  assert.deepEqual(selected.position,position);
  const context={scope:'book',bookLease:{documents:[{documentId:'a'},{documentId:'b'}]},areaPrepared:prepareSavedAreaPreview(options,snapshot,{whole:true}),areaSnapshot:snapshot,options:{...options,pageCache:{}},plan,...selected};
  const commit=prepareBookFixedCommit(context,'lock');
  assert.deepEqual(commit.value.entries,[{documentId:'a',persistentId:'q',minHeightPercent:30,bookFixed:position}]);
  assert.equal(commit.prepared.intents.length,2);
  assert.equal(commit.prepared.options.pageCache,undefined);
  assert.equal(snapshot.document.entries[0].bookFixed,undefined);
  assert.throws(()=>prepareBookFixedCommit(context,'unlock'));
  assert.throws(()=>prepareBookFixedCommit({...context,selection:{...selected.selection,revision:'old'}},'lock'));
  assert.throws(()=>prepareBookFixedCommit({...context,bookLease:{documents:[{documentId:'b'}]}},'lock'));
  assert.equal(resolveBookFixedSelection({...plan,fragments:[fragment,fragment]},'a','40'),null);
  assert.equal(resolveBookFixedSelection({...plan,fragments:[{...fragment,placement:undefined}]},'a','40'),null);
  const lockedPlan={...plan,fragments:[{...fragment,placement:{...fragment.placement,fixed:true}},plan.fragments[1]]};
  const locked={...context,plan:lockedPlan,areaPrepared:commit.prepared,areaSnapshot:{revision:'locked',document:commit.prepared.document},...resolveBookFixedSelection(lockedPlan,'a','40')};
  assert.equal(resolvePaperAreaSelection(lockedPlan,'a','40'),null);
  assert.deepEqual(prepareBookFixedCommit(locked,'unlock').value.entries,snapshot.document.entries.slice(0,1));
  assert.throws(()=>prepareBookFixedCommit(locked,'lock'));
  assert.throws(()=>prepareBookFixedCommit({...locked,plan:{...lockedPlan,fragments:[{...lockedPlan.fragments[0],placement:{...lockedPlan.fragments[0].placement,page:3}},plan.fragments[1]]}},'unlock'));
});


test('same-page movement preserves explicit dimensions and rejects invalid or stale positions',()=>{
  const fragment={origin:origin('a','40','q'),placement:{page:2,fixed:false,rect:{x:100,y:300,width:400,height:600},occupiedRect:{x:100,y:300,width:500,height:700}}};
  const plan={revision:'r1',fingerprint:'f1',fragments:[fragment,{origin:origin('b','70','q')}]};
  const selected=resolveBookFixedSelection(plan,'a','40');
  const context={scope:'book',bookLease:{documents:[{documentId:'a'},{documentId:'b'}]},areaPrepared:prepareSavedAreaPreview(options,snapshot,{whole:true}),areaSnapshot:snapshot,options,plan,...selected};
  assert.deepEqual(resolveBookMoveBounds(context,selected),{maxX:500,maxY:1300,width:500,height:700});
  const position={page:2,x:500,y:1300},commit=prepareBookFixedCommit(context,'move',position);
  assert.deepEqual(commit.value.entries,[{documentId:'a',persistentId:'q',minHeightPercent:30,bookFixed:position}]);
  assert.equal(commit.prepared.intents.length,2);
  assert.equal(prepareBookFixedCommit(context,'move',selected.position),null);
  for(const bad of [{...position,page:3},{...position,x:501},{...position,y:1301},{...position,x:-1},{...position,x:2.5},{...position,extra:true}])assert.throws(()=>prepareBookFixedCommit(context,'move',bad));
  assert.throws(()=>prepareBookFixedCommit({...context,selection:{...selected.selection,revision:'stale'}},'move',position));
});


test('preferred position is distinct from hard lock; both honored and fallback must be reported accurately',()=>{
  const fragment={origin:origin('a','40','q'),placement:{page:2,fixed:false,rect:{x:100,y:300,width:400,height:600}}},other={origin:origin('b','70','q'),placement:{page:2,fixed:false,rect:{x:0,y:1000,width:500,height:100}}};
  const plan={revision:'r1',fingerprint:'f1',fragments:[fragment,other]},selected=resolveBookFixedSelection(plan,'a','40');
  const context={scope:'book',bookLease:{documents:[{documentId:'a'},{documentId:'b'}]},areaPrepared:prepareSavedAreaPreview(options,snapshot,{whole:true}),areaSnapshot:snapshot,options,plan,...selected};
  const preferred={position:{page:2,x:150,y:300},tolerance:{x:50,y:0}},commit=prepareBookPreferredCommit(context,preferred);
  assert.deepEqual(commit.value.entries,[{documentId:'a',persistentId:'q',minHeightPercent:30,bookPreferred:preferred}]);
  assert.deepEqual(commit.prepared.intents[0].placement,{sizeConstraints:{minHeightPercent:30},preferred:preferred.position,preferredTolerance:preferred.tolerance});
  const result=(placement)=>({intelligentLayout:{status:'placed',revision:'r1',fingerprint:'f1',fragments:[{...fragment,placement},other]}});
  const honored={...fragment.placement,preference:'honored'},fallback={...fragment.placement,rect:{...fragment.placement.rect,x:99},preference:'fallback'};
  assert.doesNotThrow(()=>verifySavedAreaPreview(commit.prepared,result(honored)));
  assert.doesNotThrow(()=>verifySavedAreaPreview(commit.prepared,result(fallback)));
  assert.throws(()=>verifySavedAreaPreview(commit.prepared,result({...fallback,preference:'honored'})));
  assert.throws(()=>verifySavedAreaPreview(commit.prepared,result({...honored,preference:'fallback'})));
  const saved={...context,areaPrepared:commit.prepared,areaSnapshot:{revision:'a'.repeat(64),document:commit.prepared.document}};
  assert.throws(()=>prepareBookFixedCommit(saved,'lock'));
  assert.throws(()=>prepareSavedAreaPreview(options,saved.areaSnapshot,{whole:false,documentId:'a'}),{code:'AREA_BOOK_SCOPE'});
  assert.deepEqual(prepareBookPreferredCommit(saved,null).value.entries,snapshot.document.entries.slice(0,1));
  assert.deepEqual(prepareBookFixedRelease(saved,'a','q','preferred').value.entries,snapshot.document.entries.slice(0,1));
  assert.equal(prepareBookPreferredCommit(saved,preferred),null);
  assert.throws(()=>prepareBookPreferredCommit(context,{...preferred,tolerance:{x:-1,y:0}}));
});


test('group commits are atomic, consecutive, within one manuscript, and verified on one page',()=>{
  const blocks=['a','b','c'].map((k,i)=>({origin:origin('a',k,k+'-id')}));
  const groupOptions={...options,sections:[{id:'a',blocks}]};
  const areaSnapshot={revision:'a'.repeat(64),document:{schemaVersion:1,entries:[{documentId:'a',persistentId:'a-id',minWidthPercent:30}]}};
  const fragments=blocks.map((b,i)=>({...b,placement:{page:0,fixed:false,rect:{x:0,y:i*100,width:300,height:100}}}));
  const plan={revision:'r1',fingerprint:'f1',fragments},selected=resolveBookFixedSelection(plan,'a','a');
  const context={scope:'book',bookLease:{documents:[{documentId:'a'}]},areaSnapshot,areaPrepared:prepareSavedAreaPreview(groupOptions,areaSnapshot,{whole:true}),options:groupOptions,plan,...selected};
  assert.equal(resolveBookGroupMembers(context,'a',['a','c']),null);
  assert.equal(resolveBookGroupMembers(context,'a',['a','a']),null);
  assert.equal(resolveBookGroupMembers({...context,options:{...groupOptions,sections:[{id:'a',blocks:[blocks[0],{kind:'pagebreak'},blocks[1],blocks[2]]}]}},'a',['a','b']),null);
  assert.deepEqual(resolveBookGroupMembers(context,'a',['b','a']),['a-id','b-id']);
  const commit=prepareBookGroupCommit(context,{groupId:'g',blockKeys:['a','b'],layout:'rows'});
  assert.equal(commit.value.entries.length,2);
  assert.equal(commit.value.entries[0].minWidthPercent,30);
  assert.deepEqual(commit.prepared.intents[1].placement,{keepTogetherGroup:'g',keepTogetherLayout:'rows',sideBySide:true});
  const result=fragments=>({intelligentLayout:{status:'placed',revision:'r1',fingerprint:'f1',fragments}});
  assert.doesNotThrow(()=>verifySavedAreaPreview(commit.prepared,result(fragments)));
  assert.throws(()=>verifySavedAreaPreview(commit.prepared,result([fragments[0],{...fragments[1],placement:{...fragments[1].placement,page:1}},fragments[2]])),/同一ページ/);
  const saved={...context,areaPrepared:commit.prepared,areaSnapshot:{...areaSnapshot,document:commit.prepared.document}};
  assert.throws(()=>prepareBookFixedCommit(saved,'lock'));
  assert.throws(()=>prepareBookGroupCommit(context,{groupId:'g',blockKeys:['a','c'],layout:'vertical'}));
  assert.deepEqual(prepareBookGroupCommit(saved,{groupId:'g',layout:'vertical'}).prepared.intents[1].placement,{keepTogetherGroup:'g',keepTogetherLayout:'vertical'});
  assert.deepEqual(prepareBookGroupCommit(saved,{groupId:'g',layout:null}).value,areaSnapshot.document);
  assert.deepEqual(prepareBookGroupRelease(saved,'a','g').value,areaSnapshot.document);
});


test('cross-page fixed movement is restricted to current complete book page inventory',()=>{
  const fragment={origin:origin('a','40','q'),placement:{page:2,fixed:false,rect:{x:100,y:300,width:400,height:600},occupiedRect:{x:100,y:300,width:500,height:700}}};
  const plan={revision:'r1',fingerprint:'f1',pageCount:5,fragments:[fragment,{origin:origin('b','70','q')}]};
  const selected=resolveBookFixedSelection(plan,'a','40');
  const context={scope:'book',bookLease:{documents:[{documentId:'a'},{documentId:'b'}]},areaPrepared:prepareSavedAreaPreview(options,snapshot,{whole:true}),areaSnapshot:snapshot,options,plan,...selected};
  const position={page:4,x:100,y:300};
  const commit=prepareBookFixedCommit(context,'move',position);
  assert.deepEqual(commit.value.entries,[{documentId:'a',persistentId:'q',minHeightPercent:30,bookFixed:position}]);
  assert.equal(commit.prepared.intents[1].placement.sizeConstraints.minWidthPercent,50);
  for(const page of [-1,5,512,2.5,NaN])assert.throws(()=>prepareBookFixedCommit(context,'move',{...position,page}));
  assert.equal(validBookMovePage({...context,plan:{...plan,pageCount:undefined}},selected,4),false);
  assert.throws(()=>prepareBookPreferredCommit(context,{position,tolerance:{x:0,y:0}}));
  const locked={...fragment,placement:{...fragment.placement,page:4,fixed:true}};
  const other={origin:origin('b','70','q'),placement:{page:4,rect:{x:0,y:1200,width:500,height:100}}};
  const result=fragments=>({intelligentLayout:{status:'placed',revision:'r1',fingerprint:'f1',fragments}});
  assert.doesNotThrow(()=>verifySavedAreaPreview(commit.prepared,result([locked,other])));
  assert.throws(()=>verifySavedAreaPreview(commit.prepared,result([{...locked,placement:{...locked.placement,page:3}},other])),/固定位置/);
});


test('position live session adopts only verified complete current results and retains private snapshots',async()=>{
  const fragment={origin:origin('a','40','q'),placement:{page:2,fixed:false,rect:{x:100,y:300,width:400,height:600},occupiedRect:{x:100,y:300,width:500,height:700}}};
  const plan={revision:'r1',fingerprint:'f1',pageCount:5,fragments:[fragment,{origin:origin('b','70','q')}]};
  const selected=resolveBookFixedSelection(plan,'a','40');
  const context={scope:'book',bookLease:{documents:[{documentId:'a'},{documentId:'b'}]},areaPrepared:prepareSavedAreaPreview(options,snapshot,{whole:true}),areaSnapshot:snapshot,options:{...options,paragraphCache:{},pageCache:{}},plan,...selected};
  const session=createBookPositionPreviewSession(),privateCache={},first={page:2,x:200,y:300},second={page:3,x:300,y:400};
  const result=(position,handle)=>({element:{},snapshot:handle,plan:{completeness:'full',diagnostics:[]},intelligentLayout:{status:'placed',revision:'r1',fingerprint:'f1',fragments:[{...fragment,placement:{...fragment.placement,page:position.page,fixed:true,rect:{...fragment.placement.rect,x:position.x,y:position.y}}},{origin:origin('b','70','q'),placement:{rect:{width:500,height:100}}}]}});
  const one={},two={};
  assert.equal(await session.measure(context,'move',first,async(o,previous)=>{assert.equal(previous,undefined);assert.equal(o.pageCache,undefined);assert.equal(o.paragraphCache,privateCache);return result(first,one);},()=>true,{paragraphCache:privateCache}).then(r=>r.snapshot),one);
  await assert.rejects(()=>session.measure(context,'move',second,async(o,previous)=>{assert.equal(previous,one);return result(first,two);},()=>true),/固定位置/);
  let current=true;
  assert.equal(await session.measure(context,'move',second,async(o,previous)=>{assert.equal(previous,one);current=false;return result(second,two);},()=>current),undefined);
  assert.equal(await session.measure(context,'move',second,async(o,previous)=>{assert.equal(previous,one);return result(second,two);},()=>true).then(r=>r.snapshot),two);
  await assert.rejects(()=>session.measure(context,'move',first,async()=>{throw Error('unexpected');},()=>true,{paragraphCache:context.options.paragraphCache}),/Draft cache/);
  session.clear();
  await session.measure(context,'move',first,async(o,previous)=>{assert.equal(previous,undefined);return result(first,one);},()=>true);
  assert.equal(context.areaSnapshot.document.entries[0].bookFixed,undefined);
});
