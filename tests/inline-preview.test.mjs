import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePreviewInline,inlineSourceRange} from '../dist/index.js';
test('restricted emphasis parser preserves logical text and raw fragment coverage',()=>{
  const raw='前**重要な用語**と*斜体*です。\r\n\r\n次の段落。';
  const result=parsePreviewInline(raw,100);
  assert.equal(result.text,'前重要な用語と斜体です。\r\n\r\n次の段落。');
  assert.deepEqual(result.inlineStyles,[{start:1,end:6,fontWeight:700},{start:7,end:9,italic:true}]);
  const slices=[[0,3],[3,6],[6,9],[9,result.text.length]].map(([a,b])=>inlineSourceRange(result.sourceMap,a,b));
  assert.equal(slices.map(s=>raw.slice(s.start-100,s.end-100)).join(''),raw);
  assert.ok(slices.every((s,i)=>i===0||s.start===slices[i-1].end));
  assert.throws(()=>inlineSourceRange(result.sourceMap,0,0),RangeError);
  assert.throws(()=>inlineSourceRange(result.sourceMap,0,result.text.length+1),RangeError);
});
test('unsupported or ambiguous syntax fails closed, not silently transformed',()=>{
  for(const raw of ['***nested***','**bold *inner* text**','*unclosed','** leading**','*trailing *','*a\nb*','[link](target)','<u>text</u>','_italic_','a**b**\u0301','a\\*b','1. list','text  \nnext','a\rb','**a**'.repeat(129)])assert.throws(()=>parsePreviewInline(raw),RangeError,raw);
  assert.equal(parsePreviewInline('Café と日本語。').text,'Café と日本語。');
});
