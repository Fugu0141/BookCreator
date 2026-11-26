import test from 'node:test';
import assert from 'node:assert/strict';
import {describeLayoutInput,collectLayoutDocuments,prepareLayoutOptions,validateLayoutOptions} from '../layout-input.mjs';

const services={paperGeometry:()=>({content:{width:100},paper:{width:120}}),hasDynamicLabels:()=>false,hasStudyNumbering:()=>false};
const create=(patch={})=>describeLayoutInput({whole:false,file:{id:'a',revision:'saved'},raw:'draft',page:{size:'A5'},typography:{body:{fontFamily:'serif'},heading:{fontFamily:'serif'}},theme:{},fonts:[],order:[{id:'a',startOn:'page'},{id:'b',startOn:'continuous'}],job:42,bundledFingerprint:'fonts',...patch},services);
const snapshot=[{documentId:'a',revision:'saved',source:'saved A',startOn:'page'},{documentId:'b',revision:'saved B',source:'saved B',startOn:'page'}];

test('ordinary manuscript preparation does not need a book read',()=>{
  const input=create();
  assert.equal(input.needsContext,false);
  assert.deepEqual(collectLayoutDocuments(input),[{documentId:'a',revision:'42',source:'draft',startOn:'page'}]);
});

test('context uses unsaved manuscript and section order without mutating saved source',()=>{
  const input=create({raw:'see :ref{x}',order:[{id:'b',startOn:'page'},{id:'a',startOn:'continuous'}]});
  assert.equal(input.needsContext,true);
  assert.deepEqual(collectLayoutDocuments(input,snapshot),[
    {documentId:'b',revision:'saved B',source:'saved B',startOn:'page'},
    {documentId:'a',revision:'42',source:'see :ref{x}',startOn:'continuous'}
  ]);
  assert.equal(snapshot[0].source,'saved A');
  assert.equal(snapshot[0].startOn,'page');
});

test('conflicting revisions and missing sections are rejected',()=>{
  assert.throws(()=>collectLayoutDocuments(create({whole:true,file:{id:'a',revision:'old'}}),snapshot),/外部変更/);
  assert.throws(()=>collectLayoutDocuments(create({whole:true}),snapshot.slice(0,1)),/原稿構成/);
});

test('context is passed to shared engine before filtering the displayed section',()=>{
  const input=create({raw:'see :ref{x}'}),docs=collectLayoutDocuments(input,snapshot);
  const diagnostics=[{code:'TEST',message:'diagnostic'}];
  const prepared=prepareLayoutOptions(input,docs,(documents,revision,fingerprint,content)=>{
    assert.equal(documents.length,2);
    assert.equal(revision,'42');
    assert.match(fingerprint,/fonts/);
    assert.equal(content.width,100);
    return {options:{sections:[{id:'a'},{id:'b'}]},diagnostics};
  },{});
  assert.deepEqual(prepared.options.sections,[{id:'a'}]);
  assert.deepEqual(prepared.diagnostics,diagnostics);
  assert.equal(prepareLayoutOptions(input,docs,()=>({diagnostics}),{}).options,undefined);
});

test('invalid font and component resource are rejected before measurement',()=>{
  assert.throws(()=>create({typography:{body:{fontFamily:'BCFont_missing'},heading:{fontFamily:'serif'}}}),/登録フォント/);
  const input=create({raw:'missing-id',theme:{studyResourceErrors:{'missing-id':'missing'}}});
  assert.throws(()=>prepareLayoutOptions(input,collectLayoutDocuments(input),()=>assert.fail('engine must not run'),{}),/素材/);
  const options={sections:[{blocks:[{request:{fontFamily:'serif',fontWeight:400,inlineStyles:[{fontFamily:'BCFont_custom',fontWeight:700}]}}]}]};
  assert.throws(()=>validateLayoutOptions(options,[{alias:'BCFont_custom',loaded:true,weight:400}]),/ウェイト/);
  assert.doesNotThrow(()=>validateLayoutOptions(options,[{alias:'BCFont_custom',loaded:true,weight:700}]));
});
