import test from 'node:test';
import assert from 'node:assert/strict';
import {installPaperNavigation} from '../paper-navigation.mjs';

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
