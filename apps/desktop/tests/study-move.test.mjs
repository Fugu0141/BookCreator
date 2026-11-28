import test from 'node:test';
import assert from 'node:assert/strict';
import {scanDocument,applyPatches} from '../../../../BookCreator_Markdown/dist/index.js';
import {parsePreviewInline} from '../../../dist/index.js';
import {parsePreviewMath,parseDisplayMath} from '../../../../BookCreator_LayoutEngine/dist/index.js';
import {projectStructuredEditor} from '../structured-projection.mjs';
import {canBlockOperation,planBlockOperation,paperMoveBounds,planPaperRangeMove,resolveBookPaperMove,planBookPaperMove} from '../structured-operations.mjs';
const parseInline=value=>parsePreviewInline(value,0,parsePreviewMath);
const deps={scan:scanDocument,parseInline,applyPatches,validateMath:parseDisplayMath};
const project=source=>projectStructuredEditor(source,scanDocument,parseInline).rows;
const move=(source,index,action)=>planBlockOperation(source,{source,index,action},deps);
const question=':::component{name="exercise" #q-1}\n$2x=4$ を解きなさい。\n:::\n';
const answer=':::component{name="explanation" #a-1 answer-to="q-1"}\n$x=2$ です。\n:::\n';
const note=':::callout{kind="note"}\n補足です。\n:::\n';
test('move whole identified study block across a paragraph and back',()=>{
  const source='# 章\n\n本文です。\n\n'+question+'\n'+answer;
  assert.equal(canBlockOperation(source,project(source),2,'up'),true);
  const next=move(source,2,'up');
  assert.equal(next,'# 章\n\n'+question+'\n本文です。\n\n'+answer);
  assert.equal(project(next)[1].study.id,'q-1');
  assert.equal(project(next)[3].study.answerTo,'q-1');
  assert.equal(move(next,1,'down'),source);
});
test('allow moving unrelated supported study blocks while retaining nested content',()=>{
  const custom='::::component{name="example" #ex-1}\n:::slot{name="content"}\n例題 $x^2$ です。\n:::\n\n:::slot{name="hint"}\nヒントです。\n:::\n::::\n';
  const source=custom+'\n'+note;
  assert.equal(move(source,0,'down'),note+'\n'+custom);
});
test('linked question and answer cannot swap; heading and unsupported structures remain protected',()=>{
  const source='# 章\n\n'+question+'\n'+answer;
  const rows=project(source);
  for(const [index,action] of [[1,'up'],[1,'down'],[2,'up'],[1,'delete'],[1,'duplicate']]){
    assert.equal(canBlockOperation(source,rows,index,action),false);
    assert.throws(()=>move(source,index,action),/操作できません/);
  }
  const code=question+'\n'+'~~~js\nconst a=1;\n~~~\n';
  assert.equal(canBlockOperation(code,project(code),0,'down'),false);
});
test('CRLF and final block without newline preserve boundary style and study content',()=>{
  const source=(note+'\n'+question.trimEnd()).replace(/\n/g,'\r\n');
  const next=move(source,0,'down');
  assert.equal(next,(question+'\n'+note.trimEnd()).replace(/\n/g,'\r\n'));
  assert.equal(move(next,0,'down'),source);
});
test('stale source refuses move',()=>{
  const source=note+'\n'+question;
  assert.throws(()=>planBlockOperation(source,{source:source+'変更',index:0,action:'down'},deps),/原稿が変化/);
});

const rangeMove=(source,index,target)=>planPaperRangeMove(source,{source,index,target},deps);
test('range move rotates several rows in one patch, preserving positional separators and CRLF',()=>{
  const source='A\r\n\r\nB\r\n \r\nC\r\n\r\nD';
  assert.deepEqual(paperMoveBounds(source,project(source),0),{min:0,max:3});
  const next=rangeMove(source,0,3);
  assert.equal(next,'B\r\n\r\nC\r\n \r\nD\r\n\r\nA');
  assert.equal(rangeMove(next,3,0),source);
  assert.throws(()=>rangeMove(source,0,0),/操作できません/);
});
test('range move never crosses a heading or linked answer even if later rows are movable',()=>{
  const source='# 章\n\n'+question+'\n本文です。\n\n'+answer+'\n最後です。\n';
  assert.deepEqual(paperMoveBounds(source,project(source),1),{min:1,max:2});
  assert.throws(()=>rangeMove(source,1,4),/操作できません/);
  assert.throws(()=>rangeMove(source,1,0),/操作できません/);
  assert.equal(rangeMove(source,1,2),move(source,1,'down'));
});
test('range move rejects stale inputs and noninteger targets',()=>{
  const source='A\n\nB\n\nC';
  assert.throws(()=>planPaperRangeMove(source,{source:source+'変更',index:0,target:2},deps),/原稿が変化/);
  for(const target of [-1,1.5,3,NaN])assert.throws(()=>rangeMove(source,0,target),/操作できません/);
});

test('book-paper reorder uses exact source range and retains protected boundaries',()=>{
  const source='# 章\n\n本文です。\n\n'+question+'\n'+answer;
  const range=project(source)[2].range;
  const selection=resolveBookPaperMove(source,range,deps);
  assert.equal(selection.up,true);
  assert.equal(selection.down,false);
  assert.equal(planBookPaperMove(source,{expectedSource:source,range,action:'up'},deps),move(source,2,'up'));
  assert.throws(()=>planBookPaperMove(source,{expectedSource:source,range,action:'down'},deps));
  assert.throws(()=>planBookPaperMove(source+'変更',{expectedSource:source,range,action:'up'},deps));
  assert.equal(resolveBookPaperMove(source,{start:range.start+1,end:range.end},deps),null);
  assert.equal(resolveBookPaperMove(source,project(source)[0].range,deps),null);
});
