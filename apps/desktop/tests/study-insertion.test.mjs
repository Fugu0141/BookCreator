import test from 'node:test';
import assert from 'node:assert/strict';
import {scanDocument,applyPatches,indexBlockIds} from '../../../../BookCreator_Markdown/dist/index.js';
import {parsePreviewInline,slottedStudyTemplate} from '../../../dist/index.js';
import {parsePreviewMath} from '../../../../BookCreator_LayoutEngine/dist/index.js';
import {planStudyInsertion} from '../study-insertion.mjs';

const deps={scan:scanDocument,parseInline:s=>parsePreviewInline(s,0,parsePreviewMath),applyPatches,indexBlockIds,file:{id:'chapter',revision:'test'}};
const template=slottedStudyTemplate('example','example-01',undefined,[]);
function insert(source,caret,raw=template,line=1){
  const plan=planStudyInsertion(source,caret,raw,line,deps);
  const next=applyPatches(source,[plan.patch]);
  assert.equal(next.slice(0,plan.patch.range.start)+next.slice(plan.patch.range.start+plan.patch.replacement.length),source);
  return {next,plan};
}
test('inserts after the entire paragraph without splitting lines or changing other bytes',()=>{
  const source='# 見出し\n\n最初の行です。\n続きの行です。\n\n次の段落です。\n';
  const {next,plan}=insert(source,source.indexOf('最初')+1);
  assert.equal(next,source.replace('次の段落です。',()=>template+'\n次の段落です。'));
  assert.equal(next.slice(plan.selection.start,plan.selection.end),template.split('\n')[1]);
});
test('inserts in a blank gap and before the first block',()=>{
  const source='# 見出し\n\n本文です。\n';
  assert.equal(insert(source,0).next,'# 見出し\n\n'+template+'\n本文です。\n');
  assert.equal(insert(source,source.indexOf('\n\n')+1).next,'# 見出し\n\n'+template+'\n本文です。\n');
  const leading='\n# 見出し\n\n本文です。\n';
  assert.equal(insert(leading,0).next,'\n\n'+template+'\n# 見出し\n\n本文です。\n');
});
test('inserts after a closed directive without entering it',()=>{
  const existing=slottedStudyTemplate('exercise','exercise-01',undefined,[]);
  const source=existing+'\n最後の本文。\n';
  const {next}=insert(source,existing.indexOf('\n')+1);
  assert.equal(next,existing+'\n'+template+'\n最後の本文。\n');
});
test('supports empty manuscript, terminal block without newline and CRLF',()=>{
  assert.equal(insert('',0).next,template);
  assert.equal(insert('本文です。',3).next,'本文です。\n\n'+template);
  const source='# 見出し\r\n\r\n本文です。\r\n\r\n次の本文。\r\n';
  const {next,plan}=insert(source,source.indexOf('本文です'));
  assert.equal(next,source.replace('次の本文。',()=>template.replace(/\n/g,'\r\n')+'\r\n次の本文。'));
  assert.equal(next.slice(plan.selection.start,plan.selection.end),template.split('\n')[1]);
});
test('rejects duplicate IDs, malformed source and invalid positions',()=>{
  assert.throws(()=>insert(template,template.length),/重複/);
  assert.throws(()=>insert(':::component{name="example"}\n未閉鎖\n',2),/構文/);
  assert.throws(()=>insert('本文',-1),/挿入位置/);
});
