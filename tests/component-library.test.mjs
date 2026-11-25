import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultHeadingDesign,validateComponentLibrary,emptyComponentLibrary} from '../dist/index.js';
const entry={id:'component-00000000-0000-4000-8000-000000000001',name:'章見出し',usage:'heading',design:defaultHeadingDesign()};
test('library validates and clones independent definitions',()=>{
  const input={schemaVersion:1,entries:[entry]},copy=validateComponentLibrary(input);
  copy.entries[0].design.children[0].height=9999;
  assert.notEqual(entry.design.children[0].height,9999);
  assert.deepEqual(emptyComponentLibrary(),{schemaVersion:1,entries:[]});
});
test('reject duplicate normalized names, IDs, unsupported usage, malformed and oversize registry',()=>{
  const another={...entry,id:'component-00000000-0000-4000-8000-000000000002'};
  for(const entries of [[entry,another],[entry,{...entry,name:'別名'}],[{...entry,usage:'paragraph'}],[{...entry,name:' '}],[{...entry,id:'__proto__'}],[{...entry,design:{}}],[...Array(33).fill(entry)],[{...entry,name:'Café'},{...another,name:'Cafe\u0301'}]])assert.throws(()=>validateComponentLibrary({schemaVersion:1,entries}),RangeError);
  assert.throws(()=>validateComponentLibrary({schemaVersion:2,entries:[]}),RangeError);
});
