import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultHeadingDesign,validateHeadingDesign,compileHeadingDesign} from '../dist/index.js';

const group={id:'canvas',type:'group',direction:'canvas',width:'fill',height:50000,gap:0,padding:2000,background:'#ffffff',children:[{id:'content',type:'content',x:0,y:0,width:30000}]};
const design=g=>({...defaultHeadingDesign(),direction:'column',children:[g]});
test('fixed and automatic Canvas dimensions persist and compile without changing child coordinates',()=>{
  for(const g of [group,{...group,heightMode:'auto',height:0},{...group,heightMode:'auto',height:25000}]){
    const d=design(g);
    assert.deepEqual(validateHeadingDesign(d),d);
    assert.deepEqual(compileHeadingDesign(d).component.children[0],g);
  }
});
test('reject invalid automatic height, out of range minimum and flow mode metadata',()=>{
  for(const g of [{...group,height:0},{...group,heightMode:'fixed'},{...group,heightMode:'auto',height:-1},{...group,heightMode:'auto',height:100001},{...group,heightMode:'auto',gap:1},{...group,heightMode:'auto',direction:'column',height:undefined,children:[{id:'content',type:'content'}]}]){
    assert.throws(()=>validateHeadingDesign(design(g)),RangeError);
  }
});
