import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultStudyDesign,compileStudyBlock,compileNamedSlotRequests,namedSlotNames,validateComponentDesign,slottedStudyTemplate,resolveStudyDesigns} from '../dist/index.js';
const base=defaultStudyDesign('exercise'),hint={id:'hint',type:'slot',name:'hint',width:'fill',fontSize:3500,lineHeight:1.5,color:'#123456',font:{id:'system-monospace',weight:700}};
const design={...base,children:[...base.children,hint]};
test('study slot definition compiles separate font, source, geometry and required name set',()=>{
  assert.deepEqual(namedSlotNames(validateComponentDesign(design,'study')),['hint']);
  const c=compileStudyBlock('exercise',undefined,{fontFamily:'serif',fontWeight:400},design);
  assert.deepEqual(c.component.children.at(-1),{id:'hint',type:'slot',name:'hint',width:'fill',color:'#123456'});
  assert.deepEqual(compileNamedSlotRequests(c,[{name:'hint',text:'ヒント。',sourceTextStart:55}]),[{name:'hint',request:{text:'ヒント。',fontSize:3500,lineHeight:1.5,fontFamily:'monospace',fontWeight:700},sourceTextStart:55}]);
  for(const slots of [[],[{name:'answer',text:'答え'}],[{name:'hint',text:'a'},{name:'hint',text:'b'}]])assert.throws(()=>compileNamedSlotRequests(c,slots),RangeError);
});
test('scope, unique names, reserved names and templates are validated',()=>{
  assert.throws(()=>validateComponentDesign(design,'heading'),RangeError);
  assert.throws(()=>validateComponentDesign({...design,children:[...design.children,{...hint,id:'other'}]},'study'),RangeError);
  assert.throws(()=>validateComponentDesign({...base,children:[...base.children,{...hint,name:'content'}]},'study'),RangeError);
  assert.throws(()=>resolveStudyDesigns({schemaVersion:1,kinds:{note:design}},{schemaVersion:1,entries:[]}),/component syntax/);
  assert.match(slottedStudyTemplate('exercise','q-1',undefined,['hint']),/^::::component\{name="exercise" #q-1\}\n:::slot\{name="content"\}\n/);
  assert.match(slottedStudyTemplate('exercise',undefined,undefined,['hint']),/:::slot\{name="hint"\}/);
  assert.throws(()=>slottedStudyTemplate('note',undefined,undefined,['hint']),RangeError);
});
