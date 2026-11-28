import test from 'node:test';
import assert from 'node:assert/strict';
import {scanDocument,applyPatches} from '../../../../BookCreator_Markdown/dist/index.js';
import {parsePreviewInline} from '../../../dist/index.js';
import {parsePreviewMath,parseDisplayMath} from '../../../../BookCreator_LayoutEngine/dist/index.js';
import {projectStructuredEditor} from '../structured-projection.mjs';
import {canBlockOperation,planBlockOperation} from '../structured-operations.mjs';
const parseInline=value=>parsePreviewInline(value,0,parsePreviewMath);
const deps={scan:scanDocument,parseInline,applyPatches,validateMath:parseDisplayMath};
const project=source=>projectStructuredEditor(source,scanDocument,parseInline).rows;
const operate=(source,index,action)=>planBlockOperation(source,{source,index,action},deps);
const example=':::component{name="example"}\n$x^2=4$ を解きなさい。\n:::\n';
const prefix='# 章\n\n本文です。\n\n',suffix='\n次の段落です。\n';
test('duplicate anonymous example exactly between neighboring blocks',()=>{
  const source=prefix+example+suffix;
  assert.equal(canBlockOperation(source,project(source),2,'duplicate'),true);
  const next=operate(source,2,'duplicate');
  assert.equal(next,prefix+example+'\n'+example+suffix);
  assert.equal(project(next).filter(r=>r.study).length,2);
});
test('delete anonymous study block without deleting neighboring source bytes',()=>{
  const source=prefix+example+suffix;
  assert.equal(canBlockOperation(source,project(source),2,'delete'),true);
  assert.equal(operate(source,2,'delete'),prefix+suffix);
});
test('duplicate named slots intact, then remove the duplicate',()=>{
  const nested='::::component{name="example"}\n:::slot{name="content"}\n本文です。\n:::\n\n:::slot{name="hint"}\nヒント $x^2$ です。\n:::\n::::\n';
  const next=operate(nested,0,'duplicate');
  assert.equal(next,nested+'\n'+nested);
  assert.deepEqual(project(next).map(r=>r.study.fields.map(f=>f.name)),[['content','hint'],['content','hint']]);
  assert.equal(operate(next,1,'delete'),nested+'\n');
});
test('CRLF and a final anonymous block without newline are preserved safely',()=>{
  const raw=example.trimEnd().replace(/\n/g,'\r\n');
  const next=operate(raw,0,'duplicate');
  assert.equal(next,raw+'\r\n\r\n'+raw+'\r\n');
  assert.equal(operate(raw,0,'delete'),'');
});
test('identified and linked study blocks cannot be copied or removed',()=>{
  for(const source of [example.replace('name="example"','name="example" #ex-1'),':::component{name="explanation" answer-to="q-1"}\n解説です。\n:::\n']){
    const rows=project(source);assert.ok(rows[0].study);
    for(const action of ['duplicate','delete']){
      assert.equal(canBlockOperation(source,rows,0,action),false);
      assert.throws(()=>operate(source,0,action),/操作できません/);
    }
  }
});
