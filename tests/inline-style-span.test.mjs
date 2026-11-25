import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePreviewInline,inlineSourceRange,serializeInlineStyle,inlineFontFamily} from '../dist/index.js';
test('typed style directive maps combined properties and exact raw envelopes',()=>{
  const span=':style{text="重要な用語" weight="700" italic="true" underline="true" color="#AABBCC" font="system-monospace"}';
  const raw='前'+span+'です。\r\n次の段落。',r=parsePreviewInline(raw,50);
  assert.equal(r.text,'前重要な用語です。\r\n次の段落。');
  assert.deepEqual(r.inlineStyles,[{start:1,end:6,fontWeight:700,italic:true,underline:true,color:'#aabbcc',fontFamily:'monospace'}]);
  const ranges=[[0,3],[3,6],[6,r.text.length]].map(([a,b])=>inlineSourceRange(r.sourceMap,a,b));
  assert.equal(ranges.map(s=>raw.slice(s.start-50,s.end-50)).join(''),raw);
  const full=inlineSourceRange(r.sourceMap,1,6);
  assert.equal(raw.slice(full.start-50,full.end-50),span);
  const serialized=serializeInlineStyle('重要な用語',r.inlineStyles.map(({start,end,...style})=>style)[0],true);
  assert.equal(serialized.raw,span.replace('#AABBCC','#aabbcc'));
  assert.equal(serialized.raw.slice(serialized.innerOffset,serialized.innerOffset+5),'重要な用語');
  const id='font-'+'a'.repeat(64);
  assert.equal(inlineFontFamily(id),'BCFont_'+'a'.repeat(64));
  assert.match(serializeInlineStyle('文字',{fontFamily:inlineFontFamily(id),fontWeight:400}).raw,new RegExp(id));
});
test('inline style grammar rejects arbitrary markup, duplicate keys, untrusted font names and empty spans',()=>{
  for(const raw of [
    ':style{text="文"}',':style{text="文" color="red"}',':style{text="文" color="#123456" color="#654321"}',
    ':style{text="文" font="Arial"}',':style{text="文" font="file:///tmp/a.ttf"}',':style{text="文" weight="901"}',
    ':style{text="文" italic="false"}',':style{text="文" underline="yes"}',':style{text="文" size="14"}',
    ':style{text="**文**" underline="true"}',':style{text="文\n字" underline="true"}',
    ':style{text=" 文" underline="true"}','abc:style{text="文" underline="true"}',
    ':style{color="#123456" text="文"}',':style{text="文" underline="true"'
  ])assert.throws(()=>parsePreviewInline(raw),RangeError,raw);
  assert.throws(()=>serializeInlineStyle('字',{fontFamily:'arbitrary'}),RangeError);
});
