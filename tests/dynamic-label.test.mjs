import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultHeadingDesign,validateHeadingDesign,compileHeadingDesign,hasDynamicLabels} from '../dist/index.js';
const slot={id:'number',type:'dynamic',field:'chapter-number',prefix:'第',suffix:'章',fallback:'未定',width:20000,fontSize:3000,lineHeight:1.5,color:'#315b86',font:{id:'system-monospace',weight:400}};
const design={...defaultHeadingDesign(),children:[slot,{id:'content',type:'content'}]};
test('dynamic label resolves only with context and keeps definition immutable',()=>{
  assert.equal(hasDynamicLabels(design),true);assert.equal(hasDynamicLabels(defaultHeadingDesign()),false);
  assert.throws(()=>compileHeadingDesign(design),/context/);
  const n=compileHeadingDesign(design,undefined,{'chapter-number':'12'}).component.children[0];
  assert.equal(n.type,'label');assert.equal(n.text,'第12章');assert.equal(n.fontFamily,'monospace');assert.equal(n.fontWeight,400);
  assert.equal(compileHeadingDesign(design,undefined,{}).component.children[0].text,'第未定章');
  assert.equal(slot.type,'dynamic');assert.equal(Object.hasOwn(slot,'text'),false);
});
test('invalid binding, arbitrary expression and unsupported formatting rejected',()=>{
  for(const patch of [{field:'page-number'},{field:'chapter.number'},{prefix:'x\ny'},{fallback:''},{suffix:'x'.repeat(65)},{text:'literal'}]){
    assert.throws(()=>validateHeadingDesign({...design,children:[{...slot,...patch},design.children[1]]}),RangeError);
  }
});
