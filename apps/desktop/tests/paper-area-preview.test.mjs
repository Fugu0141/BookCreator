import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSavedAreaPreview,verifySavedAreaPreview,measureInlineAreaProposal} from '../paper-area-preview.mjs';
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
