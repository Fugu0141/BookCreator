import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePaperBlock,resolvePaperDrop} from '../paper-block-selection.mjs';
const rows=[{range:{start:0,end:10}},{range:{start:12,end:30}}];
test('a partial or complete fragment selects its containing row',()=>{
 for(const range of [{start:12,end:30},{start:14,end:17},{start:29,end:30}])
   assert.deepEqual(resolvePaperBlock(rows,range),{row:rows[1],index:1});
});
test('reject gaps, overlaps, empty and invalid ranges',()=>{
 for(const range of [{start:10,end:12},{start:8,end:14},{start:12,end:12},{start:-1,end:1},{start:1.5,end:3},null])
   assert.equal(resolvePaperBlock(rows,range),null);
 assert.equal(resolvePaperBlock([...rows,{range:{start:13,end:20}}],{start:14,end:17}),null);
});

test('paper drop accepts any reachable row in the same manuscript, including index zero',()=>{
  const rows=[{range:{start:0,end:5}},{range:{start:7,end:12}},{range:{start:14,end:19}},{range:{start:21,end:26}}];
  const selection={command:{file:{id:'chapter'}},rows,index:1,bounds:{min:0,max:3}};
  const hit=(i,documentId='chapter')=>({documentId,range:rows[i].range});
  assert.equal(resolvePaperDrop(selection,hit(0)),0);
  assert.equal(resolvePaperDrop(selection,hit(2)),2);
  assert.equal(resolvePaperDrop(selection,hit(1)),null);
  assert.equal(resolvePaperDrop(selection,hit(3)),3);
  assert.equal(resolvePaperDrop(selection,hit(0,'other')),null);
  assert.equal(resolvePaperDrop({...selection,bounds:{min:1,max:2}},hit(0)),null);
  assert.equal(resolvePaperDrop({...selection,bounds:{min:1,max:2}},hit(3)),null);
  assert.equal(resolvePaperDrop({...selection,bounds:null},hit(2)),null);
  assert.equal(resolvePaperDrop(selection,{documentId:'chapter',range:{start:4,end:8}}),null);
});
