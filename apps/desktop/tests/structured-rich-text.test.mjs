import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePreviewInline} from '../../../dist/index.js';
import {replaceLogicalText,formatLogicalText} from '../structured-rich-text.mjs';
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

test('batch underline preserves bold and italic outside and inside selection',()=>{
  const raw='**重要**な*文章*です。',next=formatLogicalText(raw,1,4,'underline',parse);
  assert.equal(parse(next).text,'重要な文章です。');
  assert.deepEqual(parse(next).inlineStyles,[{start:0,end:1,fontWeight:700},{start:1,end:2,fontWeight:700,underline:true},{start:2,end:3,underline:true},{start:3,end:4,italic:true,underline:true},{start:4,end:5,italic:true}]);
  const cleared=formatLogicalText(next,1,4,'underline',parse);
  assert.equal(parse(cleared).text,parse(raw).text);
  assert.deepEqual(parse(cleared).inlineStyles,[{start:0,end:1,fontWeight:700},{start:1,end:2,fontWeight:700},{start:3,end:4,italic:true},{start:4,end:5,italic:true}]);
});
test('mixed bold selection applies uniformly and then removes only weight',()=>{
  const raw='**重要**な*文章*です。',next=formatLogicalText(raw,0,5,'bold',parse),cleared=formatLogicalText(next,0,5,'bold',parse);
  assert.deepEqual(parse(next).inlineStyles,[{start:0,end:2,fontWeight:700},{start:2,end:3,fontWeight:700},{start:3,end:5,fontWeight:700,italic:true}]);
  assert.deepEqual(parse(cleared).inlineStyles,[{start:3,end:5,italic:true}]);
});
test('color and font changes do not clear independent weight',()=>{
  const raw='**重要**な*文章*です。',colored=formatLogicalText(raw,0,5,{color:'#112233'},parse);
  const fonted=formatLogicalText(colored,0,5,{font:'system-serif'},parse);
  const cleared=formatLogicalText(fonted,0,5,{font:null},parse);
  assert.deepEqual(parse(cleared).inlineStyles,parse(colored).inlineStyles);
  assert.equal(parse(cleared).text,parse(raw).text);
});
test('unsupported newline and whitespace boundaries fail safely',()=>{
  assert.throws(()=>formatLogicalText('一行\n二行',0,4,'bold',parse));
  assert.throws(()=>formatLogicalText('前 後',1,3,'underline',parse));
});
