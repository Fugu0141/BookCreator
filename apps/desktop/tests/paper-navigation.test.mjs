import test from 'node:test';
import assert from 'node:assert/strict';
import {installPaperNavigation,preparePaperNavigationTransfer} from '../paper-navigation.mjs';

test('root navigation chooses the closest binding and supports click and keyboard',()=>{
  const listeners={},root={host:{inert:false},addEventListener:(name,fn)=>{assert.equal(listeners[name],undefined);listeners[name]=fn;}};
  const block={},math={},child={},calls=[];
  const range={start:2,end:5},inner={start:3,end:4};
  installPaperNavigation(root,new WeakMap([[block,{documentId:'a',range}],[math,{documentId:'a',range:inner}]]),(...args)=>calls.push(args));
  let stopped=0,prevented=0;
  const event=(path,key)=>({key,composedPath:()=>[...path,root],stopPropagation(){stopped++;},preventDefault(){prevented++;}});
  listeners.click(event([child,math,block]));
  listeners.keydown(event([block],'Enter'));
  listeners.keydown(event([math,block],' '));
  listeners.keydown(event([math,block],'Tab'));
  listeners.click(event([child]));
  root.host.inert=true;
  listeners.click(event([block]));
  assert.deepEqual(calls,[['a',inner],['a',range],['a',inner]]);
  assert.equal(stopped,3);assert.equal(prevented,2);
});

test('reinstall on retained root replaces ranges and callbacks without adding listeners',()=>{
  const listeners={},root={host:{inert:false},addEventListener:(name,fn)=>{assert.equal(listeners[name],undefined);listeners[name]=fn;}};
  const retained={},removed={},calls=[];
  installPaperNavigation(root,new WeakMap([[retained,{documentId:'old',range:{start:1,end:2}}],[removed,{documentId:'old',range:{start:3,end:4}}]]),()=>calls.push('stale'));
  const range={start:20,end:21};
  installPaperNavigation(root,new WeakMap([[retained,{documentId:'new',range}]]),(...args)=>calls.push(args));
  const event=node=>({composedPath:()=>[node,root],stopPropagation(){}});
  listeners.click(event(removed));
  listeners.click(event(retained));
  assert.deepEqual(calls,[['new',range]]);
});

test('transfer uses fresh ranges on reused nodes and new nodes, not stale callbacks',()=>{
  const makeRoot=()=>({host:{inert:false},listeners:{},addEventListener(name,fn){assert.equal(this.listeners[name],undefined);this.listeners[name]=fn;}});
  const node=(...childNodes)=>({nodeType:1,childNodes});
  const oldRoot=makeRoot(),nextRoot=makeRoot(),oldBlock=node(),newBlock=node(),replacement=node(),oldPage=node(oldBlock),newPage=node(newBlock),newPage2=node(replacement);
  const calls=[];
  installPaperNavigation(oldRoot,new WeakMap([[oldBlock,{documentId:'old',range:{start:0,end:1}}]]),()=>calls.push('stale'));
  const latest={start:20,end:22},added={start:30,end:31};
  installPaperNavigation(nextRoot,new WeakMap([[newBlock,{documentId:'new',range:latest}],[replacement,{documentId:'new',range:added}]]),(...args)=>calls.push(args));
  const commit=preparePaperNavigationTransfer(oldRoot,nextRoot,{pages:[{previous:oldPage,next:newPage,reuse:true},{next:newPage2,reuse:false}]});
  assert.equal(typeof commit,'function');
  commit();
  for(const target of [oldBlock,replacement,newBlock])oldRoot.listeners.click({composedPath:()=>[target,oldRoot],stopPropagation(){}});
  assert.deepEqual(calls,[['new',latest],['new',added]]);
  assert.equal(preparePaperNavigationTransfer(oldRoot,nextRoot,{pages:[{previous:node(),next:newPage,reuse:true}]}),null);
});
