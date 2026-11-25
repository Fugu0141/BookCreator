import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultStudyDesign,compileStudyBlock,validateComponentDesign,validateComponentLibrary,resolveStudyDesigns,resolveHeadingBindings,resolveParagraphBinding} from '../dist/index.js';
const id='component-00000000-0000-4000-8000-000000000003';
const design=defaultStudyDesign('example'),font={fontFamily:'serif',fontWeight:400};
const library={schemaVersion:3,entries:[{id,name:'Study',usage:'study',design}]};
test('shared study template resolves the current semantic label and preserves custom geometry',()=>{
  const custom={...design,padding:5000};
  assert.equal(compileStudyBlock('warning','計算',font,custom).component.children[0].text,'注意：計算');
  assert.equal(compileStudyBlock('example',undefined,font,custom).component.children[0].text,'例題');
  assert.equal(compileStudyBlock('warning',undefined,font,custom).component.padding,5000);
  const result=resolveStudyDesigns({schemaVersion:1,kinds:{example:{componentId:id},warning:{componentId:id}}},library);
  assert.deepEqual(result.studyBindings,{example:id,warning:id});
  assert.deepEqual(result.studyDesigns.warning,design);
  result.studyDesigns.warning.padding=10;assert.equal(result.studyDesigns.example.padding,3000);
});
test('study reference scopes are strict, including dynamic field scope',()=>{
  assert.throws(()=>validateComponentDesign(design,'heading'),RangeError);
  assert.throws(()=>validateComponentDesign({...design,children:[{...design.children[0],field:'chapter-number'},design.children[1]]},'study'),RangeError);
  assert.throws(()=>validateComponentLibrary({...library,schemaVersion:2}),RangeError);
  assert.throws(()=>resolveHeadingBindings(null,{}, {default:id},library),/usage/);
  assert.throws(()=>resolveParagraphBinding({schemaVersion:2,componentId:id},library),/usage/);
  assert.throws(()=>resolveStudyDesigns({schemaVersion:1,kinds:{unknown:design}},library),RangeError);
  assert.throws(()=>resolveStudyDesigns({schemaVersion:1,kinds:{warning:{componentId:id}}},{schemaVersion:1,entries:[]}),/Missing/);
});
