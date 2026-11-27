import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scanDocument} from '../../../../BookCreator_Markdown/dist/index.js';
import {parsePreviewInline} from '../../../dist/index.js';
import {parsePreviewMath} from '../../../../BookCreator_LayoutEngine/dist/index.js';
import {projectBlocks} from '../structured-blocks.mjs';
import {projectStudy} from '../structured-study.mjs';
import {projectEquation} from '../structured-equation.mjs';
import {projectStructuredEditor} from '../structured-projection.mjs';
const parseInline=value=>parsePreviewInline(value,0,parsePreviewMath);
const reference=(source,scan)=>{
  const result=projectBlocks(source,scan,parseInline);
  if(!result.diagnostics.length){
    const blocks=scan(source).blocks;
    for(const row of result.rows)if(row.kind==='directive'){
      row.study=projectStudy(source,blocks[row.index]);
      row.equation=projectEquation(source,row,scan);
    }
  }
  return result;
};
const fixture='# 章\n\n本文です。 $x^2$\n\n'+Array.from({length:12},(_,i)=>':::component{name="example"}\n例題 '+i+'。 $x^2$\n:::\n\n').join('')+'- 一\n- 二\n\n$$\nx^2\n$$\n';
test('mixed manuscript preserves complete projection and scans the full source once',()=>{
  let oldCount=0,newCount=0;
  const old=reference(fixture,value=>{if(value===fixture)oldCount++;return scanDocument(value);});
  const actual=projectStructuredEditor(fixture,value=>{if(value===fixture)newCount++;return scanDocument(value);},parseInline);
  assert.deepEqual(actual,old);
  assert.equal(actual.rows.filter(r=>r.study).length,12);
  assert.ok(oldCount>1);
  assert.equal(newCount,1);
});
test('new source and CRLF offsets never reuse a previous snapshot',()=>{
  const next=fixture.replace('本文です。','新しい本文です。').replaceAll('\n','\r\n');
  const first=projectStructuredEditor(fixture,scanDocument,parseInline);
  const second=projectStructuredEditor(next,scanDocument,parseInline);
  assert.deepEqual(second,reference(next,scanDocument));
  assert.notDeepEqual(first,second);
  for(const row of second.rows)assert.equal(next.slice(row.range.start,row.range.end),row.raw);
});
test('malformed source keeps diagnostic and conservative projection semantics',()=>{
  const source=':::component{name="example"}\n閉じていない部品\n';
  const expected=reference(source,scanDocument),actual=projectStructuredEditor(source,scanDocument,parseInline);
  assert.deepEqual(actual,expected);
  assert.ok(actual.diagnostics.length);
});
