import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePreviewInline} from '../../../dist/index.js';
import {replaceLogicalText} from '../structured-rich-text.mjs';
const parse=value=>parsePreviewInline(value);
test('cross-style replacement preserves surviving styles and plain replacement',()=>{
  const source='**重要**な*文章*です。',next=replaceLogicalText(source,'重新章です。',parse);
  assert.equal(next,'**重**新*章*です。');
  assert.deepEqual(parse(next).inlineStyles,[{start:0,end:1,fontWeight:700},{start:2,end:3,italic:true}]);
});
test('cross-style deletion handles adjacent emphasis without dropping styles',()=>{
  const next=replaceLogicalText('**重要**な*文章*です。','重章です。',parse);
  assert.equal(parse(next).text,'重章です。');
  assert.deepEqual(parse(next).inlineStyles,[{start:0,end:1,fontWeight:700},{start:1,end:2,italic:true}]);
});
test('selection disambiguates identical letters across style boundaries',()=>{
  const next=replaceLogicalText('**ああ**ああ','ああ',parse,{start:1,end:3});
  assert.equal(parse(next).text,'ああ');
  assert.deepEqual(parse(next).inlineStyles,[{start:0,end:1,fontWeight:700}]);
});
test('unsafe markup and invalid empty result are rejected',()=>{
  assert.throws(()=>replaceLogicalText('**重要**な*文章*です。','重*章です。',parse));
  assert.throws(()=>replaceLogicalText('**重要**な*文章*です。','',parse));
});
