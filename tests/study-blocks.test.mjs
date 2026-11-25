import test from 'node:test';
import assert from 'node:assert/strict';
import {studyKinds,studyKind,studyTemplate,compileStudyBlock} from '../dist/index.js';
const font={fontFamily:'serif',fontWeight:400};
test('seven semantic study presets have one source slot and inherit body font',()=>{
  for(const kind of studyKinds){
    const callout=['note','tip','warning','important'].includes(kind);
    assert.equal(studyKind(callout?'callout':'component',callout?{kind}:{name:kind}),kind);
    const c=compileStudyBlock(kind,undefined,font);
    assert.deepEqual(c.textStyle,font);
    assert.equal(c.component.children.filter(n=>n.type==='content').length,1);
    assert.equal(c.component.children[0].type,'label');
    assert.match(studyTemplate(kind),/^:::(callout|component)\{[^\n]+\}\n[^\n]+\n:::\n$/);
  }
  assert.equal(compileStudyBlock('example','計算',font).component.children[0].text,'例題：計算');
});
test('unsupported semantics, attributes and unsafe titles are refused',()=>{
  assert.equal(studyKind('callout',{kind:'example'}),undefined);
  assert.equal(studyKind('component',{name:'warning'}),undefined);
  assert.equal(studyKind('callout',{kind:'tip',title:'改\n行'}),undefined);
  assert.equal(studyKind('callout',{kind:'tip',title:' '}),undefined);
  assert.equal(studyKind('callout',{kind:'tip',title:'x'.repeat(129)}),undefined);
  assert.equal(studyKind('callout',{kind:'tip',variant:'custom'}),undefined);
  assert.throws(()=>studyTemplate('custom'),RangeError);
});
