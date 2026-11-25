import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultParagraphDesign,validateParagraphDesign,compileParagraphDesign,defaultHeadingDesign} from '../dist/index.js';
test('paragraph frame is restricted to one source slot and inherits body typography',()=>{
  const d=defaultParagraphDesign(),font={fontFamily:'serif',fontWeight:400};
  assert.deepEqual(validateParagraphDesign(d),d);
  const c=compileParagraphDesign(d,font);
  assert.deepEqual(c.textStyle,font);assert.equal(c.component.padding,2000);
  assert.equal(c.component.children.length,1);
  const override=compileParagraphDesign({...d,font:{id:'system-monospace',weight:500}},font);
  assert.deepEqual(override.textStyle,{fontFamily:'monospace',fontWeight:500});
  for(const bad of [defaultHeadingDesign(),{...d,gap:100},{...d,direction:'row'},{...d,children:[...d.children,{id:'bar',type:'rect',width:2000,height:1000,color:'#123456'}]}])assert.throws(()=>validateParagraphDesign(bad),RangeError);
});
