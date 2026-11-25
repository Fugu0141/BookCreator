import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePreviewInline,inlineSourceRange,serializeInlineStyle} from '../dist/index.js';
test('digit scripts work adjacent to ASCII, with lossless source coverage',()=>{
  const raw='x^2^ と H~2~O。',parsed=parsePreviewInline(raw,20);
  assert.equal(parsed.text,'x2 と H2O。');
  assert.deepEqual(parsed.inlineStyles,[{start:1,end:2,baseline:'super'},{start:6,end:7,baseline:'sub'}]);
  for(const [a,b,expected] of [[1,2,'^2^'],[6,7,'~2~']]){
    const slice=inlineSourceRange(parsed.sourceMap,a,b);
    assert.equal(raw.slice(slice.start-20,slice.end-20),expected);
  }
  assert.deepEqual(serializeInlineStyle('2',{baseline:'super'}),{raw:'^2^',innerOffset:1});
  assert.deepEqual(serializeInlineStyle('2',{baseline:'sub'},true),{raw:'~2~',innerOffset:1});
});
test('absolute physical size and combined baseline normalize to Engine properties',()=>{
  const raw='例 :style{text="文字" weight="700" font-size="5.25mm" baseline="sub"}';
  const r=parsePreviewInline(raw);
  assert.equal(r.text,'例 文字');
  assert.deepEqual(r.inlineStyles,[{start:2,end:4,fontWeight:700,fontSize:5250,baseline:'sub'}]);
  const {start,end,...style}=r.inlineStyles[0];
  assert.equal(serializeInlineStyle('文字',style,true).raw,raw.slice(2));
  for(const bad of ['^abc^','~abc~','~~2~~','^^2^^','^2','~2','^2^~3~~',':style{text="字" font-size="0.9mm"}',':style{text="字" font-size="30.001mm"}',':style{text="字" font-size="5pt"}',':style{text="字" baseline="top"}'])assert.throws(()=>parsePreviewInline(bad),RangeError,bad);
});
