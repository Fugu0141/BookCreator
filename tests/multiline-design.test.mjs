import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultParagraphDesign,defaultStudyDesign,compileParagraphDesign,compileStudyBlock,compileNamedSlotRequests,validateComponentDesign,multilineTextOptions} from '../dist/index.js';
const font={fontFamily:'serif',fontWeight:400};
test('physical paragraph gap is validated, scoped and stripped from Engine geometry',()=>{
  const p={...defaultParagraphDesign(),paragraphGap:2000};
  const compiled=compileParagraphDesign(p,font);
  assert.equal(compiled.paragraphGap,2000);assert.equal(compiled.component.paragraphGap,undefined);
  assert.throws(()=>validateComponentDesign(p,'heading'),RangeError);
  for(const gap of [-1,30001,0.5,'2',null])assert.throws(()=>validateComponentDesign({...p,paragraphGap:gap},'paragraph'),RangeError);
  const base=defaultStudyDesign('example'),design={...base,paragraphGap:1000,children:[...base.children,{id:'hint',type:'slot',name:'hint',width:'fill',fontSize:3000,lineHeight:1.5,color:'#123456',paragraphGap:2500}]};
  const study=compileStudyBlock('example',undefined,font,design);
  assert.equal(study.paragraphGap,1000);assert.equal(study.component.children.at(-1).paragraphGap,undefined);
  assert.deepEqual(compileNamedSlotRequests(study,[{name:'hint',text:'One\r\n\r\nTwo'}])[0].request,{text:'One\r\n\r\nTwo',fontFamily:'serif',fontWeight:400,fontSize:3000,lineHeight:1.5,multiline:true,paragraphGap:2500});
  assert.deepEqual(multilineTextOptions('One',2000),{});assert.deepEqual(multilineTextOptions('One\nTwo'),{multiline:true});
});
