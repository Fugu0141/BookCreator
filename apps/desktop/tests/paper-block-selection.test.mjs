import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePaperBlock} from '../paper-block-selection.mjs';
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
