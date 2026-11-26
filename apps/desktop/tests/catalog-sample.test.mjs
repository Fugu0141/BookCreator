import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogSampleOptions} from '../catalog-sample.mjs';
const env={typography:{heading:{fontFamily:'serif',fontWeight:700},body:{fontFamily:'sans-serif',fontWeight:400}},width:100000,height:200000,revision:'1'};
const compiled={component:{children:[]},fontSize:5000,lineHeight:1.5,textStyle:{fontFamily:'serif',fontWeight:700}};
const deps={multilineTextOptions:()=>({}),compileHeadingDesign:()=>compiled,compileParagraphDesign:()=>compiled,compileStudyBlock:()=>compiled,compileCustomStudyBlock:()=>compiled,namedSlotDefinitions:()=>[{name:'hint'}],resolveNamedSlotPresence:(c,s)=>({component:c.component,namedSlots:s})};
test('plain inherited heading and paragraph match base typography rather than inventing a component',()=>{
  const heading=catalogSampleOptions({category:'heading',key:'heading-1',sample:'章'},env,deps).blocks[0];
  const paragraph=catalogSampleOptions({category:'paragraph',key:'paragraph',sample:'本文'},env,deps).blocks[0];
  assert.equal(heading.component,undefined);assert.equal(heading.request.fontSize,6500);assert.equal(heading.request.fontFamily,'serif');
  assert.equal(paragraph.component,undefined);assert.equal(paragraph.request.fontSize,4200);assert.equal(paragraph.splitPolicy,'allow');
});
test('registered and built-in study samples use real compilers and named slot sources',()=>{
  let used;
  const core={...deps,compileCustomStudyBlock:entry=>{used=entry;return compiled;}};
  const design={children:[]},id='component-00000000-0000-4000-8000-000000000001';
  const result=catalogSampleOptions({category:'study',key:'registered-'+id,name:'独自',registered:true,design,sample:'本文'},env,core).blocks[0];
  assert.deepEqual(used,{id,name:'独自',usage:'study',design});
  assert.equal(result.component,compiled.component);assert.equal(result.namedSlots[0].name,'hint');
  assert.equal(result.splitPolicy,'strict');
});
test('configured heading delegates dynamic fields and geometry to Core',()=>{
  let args;
  const design={children:[]};
  const result=catalogSampleOptions({category:'heading',key:'heading-2',sample:'節',design},env,{...deps,compileHeadingDesign:(...a)=>{args=a;return compiled;}}).blocks[0];
  assert.equal(args[0],design);assert.equal(args[2]['heading-level'],'2');assert.equal(result.request.width,env.width);assert.equal(result.request.fontSize,5000);
});
