import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultStudyDesign,compileStudyBlock,compileCustomStudyBlock,linkedStudyTemplate,studyKind,hasStudyNumbering,validateComponentDesign} from '../dist/index.js';
const font={fontFamily:'serif',fontWeight:400},answer={number:{chapter:2,index:4,sequence:9},kind:'練習問題',title:'基本計算'};
test('linked labels and explicit target fields distinguish own and target numbers',()=>{
  const base=defaultStudyDesign('explanation'),label=base.children[0];
  const design={...base,children:[...['answer-number','answer-index','answer-sequence','answer-kind','answer-title','study-number'].map((field,i)=>({...label,id:'f'+i,field,fallback:'未定'})),base.children[1]]};
  const own={chapter:3,index:1,sequence:1};
  assert.equal(compileStudyBlock('explanation',undefined,font,undefined,own,answer).component.children[0].text,'解説 2.4');
  assert.equal(compileStudyBlock('explanation',undefined,font).component.children[0].text,'解説');
  assert.deepEqual(compileStudyBlock('explanation',undefined,font,design,own,answer).component.children.slice(0,6).map(n=>n.text),['2.4','4','9','練習問題','基本計算','3.1']);
  assert.equal(compileStudyBlock('explanation',undefined,font,design).component.children[0].text,'未定');
  assert.equal(hasStudyNumbering(design),true);assert.throws(()=>validateComponentDesign(design,'heading'),RangeError);
  assert.equal(compileCustomStudyBlock({id:'component-00000000-0000-4000-8000-000000000001',name:'自作解答',usage:'study',design},undefined,font,own,answer).component.children[0].text,'2.4');
});
test('linked source templates validate identity and scope',()=>{
  assert.match(linkedStudyTemplate('exercise','q-1'),/^:::component\{name="exercise" #q-1\}/);
  assert.match(linkedStudyTemplate('explanation','a-1','q-1'),/answer-to="q-1"/);
  assert.equal(studyKind('component',{name:'explanation','answer-to':'q-1'}),'explanation');
  assert.equal(studyKind('component',{name:'exercise','answer-to':'q-1'}),undefined);
  for(const args of [['exercise','q-1','x'],['explanation','x','x'],['explanation','bad id'],['explanation',undefined,'"bad']])assert.throws(()=>linkedStudyTemplate(...args),RangeError);
});
