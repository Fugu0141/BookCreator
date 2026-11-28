import test from 'node:test';
import assert from 'node:assert/strict';
import {scanDocument,validateScannedBlocks,indexBlockIds,applyPatches,parseReferenceToken} from '../../../../BookCreator_Markdown/dist/index.js';
import {parsePreviewMath,parseDisplayMath} from '../../../../BookCreator_LayoutEngine/dist/index.js';
import {planStudyInstanceOperation} from '../study-instance-operation.mjs';
const deps={scan:scanDocument,validate:validateScannedBlocks,index:indexBlockIds,validateDisplayMath:parseDisplayMath,validateInlineMath:parsePreviewMath,parseReference:parseReferenceToken};
const doc=(documentId,source)=>({documentId,revision:'r1',startOn:'page',source});
const problem=':::component{name="exercise" #q-1}\n$2x=4$ を解きなさい。\n:::\n';
const answer=':::component{name="explanation" #a-1 answer-to="q-1"}\n$x=2$ です。\n:::\n';
const range=source=>({start:0,end:source.length});
const plan=(documents,id,block,action,newId)=>planStudyInstanceOperation(documents,id,range(block),action,{deps,applyPatches,newId});
test('copy identified exercise with new ID without redirecting a cross-file answer',()=>{
  const documents=[doc('lesson',problem),doc('answers',answer)];
  const copy=plan(documents,'lesson',problem,'duplicate','q-2');
  assert.equal(copy,problem+'\n'+problem.replace('#q-1','#q-2'));
  assert.equal(documents[1].source,answer);
});
test('refuse deletion of an exercise referenced from a different manuscript',()=>{
  const documents=[doc('lesson',problem),doc('answers',answer)];
  assert.throws(()=>plan(documents,'lesson',problem,'delete'),/answers/);
  assert.equal(documents[0].source,problem);
});
test('deleting an unreferenced identified problem preserves the next block exactly',()=>{
  const tail='\n本文です。\n',documents=[doc('lesson',problem+tail)];
  assert.equal(plan(documents,'lesson',problem,'delete'),tail);
});
test('duplicate linked explanation with a fresh ID and retain its target',()=>{
  const documents=[doc('lesson',problem),doc('answers',answer)];
  assert.equal(plan(documents,'answers',answer,'duplicate','a-2'),answer+'\n'+answer.replace('#a-1','#a-2'));
  assert.equal(plan(documents,'answers',answer,'delete'),'');
});
test('duplicate ID anywhere in the book is rejected',()=>{
  const documents=[doc('lesson',problem),doc('answers',answer)];
  assert.throws(()=>plan(documents,'lesson',problem,'duplicate','a-1'),/検証/);
});
test('linked anonymous explanation receives an ID and retains reference',()=>{
  const anonymous=answer.replace(' #a-1',''),documents=[doc('lesson',problem),doc('answers',anonymous)];
  assert.equal(plan(documents,'answers',anonymous,'duplicate','a-2'),anonymous+'\n'+anonymous.replace('answer-to="q-1"}','answer-to="q-1" #a-2}'));
});
test('copy a named-slot component without changing content or slot envelopes',()=>{
  const nested='::::component{name="example" #ex-1}\n:::slot{name="content"}\n本文です。\n:::\n\n:::slot{name="hint"}\nヒント $x^2$ です。\n:::\n::::\n';
  assert.equal(plan([doc('lesson',nested)],'lesson',nested,'duplicate','ex-2'),nested+'\n'+nested.replace('#ex-1','#ex-2'));
});
