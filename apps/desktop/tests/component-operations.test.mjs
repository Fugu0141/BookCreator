import test from 'node:test';
import assert from 'node:assert/strict';
import {duplicateComponentNode,subtreeSize,isComponentLocked,lockedChange} from '../component-operations.mjs';
const rect={id:'r',type:'rect',width:2000,height:1000,color:'#123456'};
const label={id:'l',type:'label',width:4000,text:'CHAPTER',font:{id:'mono',weight:400}};
const group={id:'g',type:'group',direction:'column',children:[rect,label]};
const content={id:'content',type:'content'};
test('duplicate nested decoration with independent IDs and properties',()=>{
  let n=0;const clone=duplicateComponentNode(group,['g','r','l','content'],type=>type+'-'+(++n));
  assert.equal(subtreeSize(clone),3);
  assert.deepEqual([clone.id,...clone.children.map(c=>c.id)],['group-1','rect-2','label-3']);
  clone.children[1].font.weight=700;
  assert.equal(label.font.weight,400);
  assert.throws(()=>duplicateComponentNode(group,['g'],()=> 'g'));
  assert.throws(()=>duplicateComponentNode({...group,children:[content]},[],()=> 'new'));
});
test('locks protect subtree, deletion, reparent and relative order, but permit unrelated edits',()=>{
  const initial=[group,content],locks=new Set(['g']);
  assert.equal(isComponentLocked(initial,'r',locks),true);
  assert.equal(isComponentLocked(initial,'content',locks),false);
  assert.equal(lockedChange(initial,[group,{...content,x:1}],locks),null);
  assert.equal(lockedChange(initial,[{...rect,id:'extra'},group,content],locks),null);
  assert.equal(lockedChange(initial,[content,group],locks),'g');
  assert.equal(lockedChange(initial,[content],locks),'g');
  assert.equal(lockedChange(initial,[{...group,children:[{...rect,width:3000},label]},content],locks),'g');
  assert.equal(lockedChange(initial,[{...group,id:'new',children:[group]},content],locks),'g');
});
