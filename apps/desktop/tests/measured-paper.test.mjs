import test from 'node:test';
import assert from 'node:assert/strict';
import {describeMeasuredPaper} from '../measured-paper.mjs';

test('measured paper builds page metadata and delegates source navigation',()=>{
  const listeners={},page={querySelectorAll:()=>[block]};
  const block={style:{},closest:()=>page,querySelectorAll:()=>[]};
  const source={origin:{documentId:'a',blockKey:'key'}};
  const slice={origin:source.origin,textStart:0,textEnd:3};
  const root={querySelectorAll:selector=>selector==='[data-page]'?[page]:[block],addEventListener:(name,fn)=>{listeners[name]=fn;}};
  const result={slices:[slice],element:{shadowRoot:root}};
  const navigated=[];
  const pages=describeMeasuredPaper(result,{sections:[{blocks:[source]}]},{
    previewSourceRange:(b,s)=>{assert.equal(b,source);assert.equal(s,slice);return {start:4,end:7};},
    paperThumbnail:()=>({sample:true}),
    onNavigate:(...args)=>navigated.push(args)
  });
  assert.deepEqual(pages,[{number:1,documents:['a'],blocks:1,thumbnail:{sample:true}}]);
  assert.equal(block.tabIndex,0);
  listeners.click({composedPath:()=>[block,root],stopPropagation(){}});
  listeners.keydown({key:'Enter',composedPath:()=>[block,root],preventDefault(){},stopPropagation(){}});
  assert.deepEqual(navigated,[['a',{start:4,end:7}],['a',{start:4,end:7}]]);
});
