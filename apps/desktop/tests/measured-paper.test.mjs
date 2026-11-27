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

test('sparse publication consumes validated fragments and updates current source ranges without rescanning pages',()=>{
  const listeners={},calls=[],nav=[];
  const node=()=>({tabIndex:0,style:{cursor:'pointer'},querySelectorAll:()=>[]});
  const a=node(),b=node(),pages=[{querySelectorAll:()=>assert.fail('validated page must not be rescanned')},{querySelectorAll:()=>assert.fail('validated page must not be rescanned')}];
  const root={addEventListener:(name,fn)=>{listeners[name]=fn;}};
  const origin=(documentId,blockKey)=>({documentId,blockKey});
  const oa=origin('doc-a','a'),ob=origin('doc-b','b');
  const result={slices:[{origin:oa,sourceSlice:{start:40,end:45}},{origin:ob,sourceSlice:{start:60,end:65}}]};
  const options={sections:[{blocks:[{origin:oa},{origin:ob}]}]};
  const actual=describeMeasuredPaper(result,options,{previewSourceRange:(_,slice)=>slice.sourceSlice,paperThumbnail:page=>{calls.push(page);return null;},onNavigate:(...args)=>nav.push(args)},{root,pages:[{node:pages[0],reuse:true,fragments:[a]},{node:pages[1],reuse:false,fragments:[b]}]});
  assert.deepEqual(actual,[{number:1,documents:['doc-a'],blocks:1,thumbnail:null},{number:2,documents:['doc-b'],blocks:1,thumbnail:null}]);
  assert.deepEqual(calls,pages);
  listeners.click({composedPath:()=>[a,root],stopPropagation(){}});
  listeners.click({composedPath:()=>[b,root],stopPropagation(){}});
  assert.deepEqual(nav,[['doc-a',{start:40,end:45}],['doc-b',{start:60,end:65}]]);
});

test('reused paper thumbnail geometry is shared, but current navigation is rebuilt',()=>{
  const listeners={},nav=[],calls=[];
  const page={},block={style:{},querySelectorAll:()=>[]};
  const root={addEventListener:(name,fn)=>{listeners[name]=fn;}};
  const origin={documentId:'doc',blockKey:'a'};
  const options={sections:[{blocks:[{origin}]}]};
  const adapter={previewSourceRange:(_,s)=>s.range,paperThumbnail:(p,fragments)=>{
    assert.equal(p,page);assert.deepEqual(fragments,[block]);
    const value={sample:calls.length};calls.push(value);return value;
  },onNavigate:(...args)=>nav.push(args)};
  function publish(reuse,start){
    return describeMeasuredPaper({slices:[{origin,range:{start,end:start+1}}]},options,adapter,{root,pages:[{node:page,reuse,fragments:[block]}]})[0];
  }
  const first=publish(false,1),next=publish(true,5);
  assert.equal(next.thumbnail,first.thumbnail);assert.equal(calls.length,1);
  listeners.click({composedPath:()=>[block,root],stopPropagation(){}});
  assert.deepEqual(nav,[['doc',{start:5,end:6}]]);
  assert.notEqual(publish(false,9).thumbnail,first.thumbnail);
  assert.equal(calls.length,2);
  const otherAdapter={...adapter,paperThumbnail:()=>null};
  const other=describeMeasuredPaper({slices:[{origin,range:{start:10,end:11}}]},options,otherAdapter,{root,pages:[{node:page,reuse:true,fragments:[block]}]})[0];
  assert.equal(other.thumbnail,null);
});
