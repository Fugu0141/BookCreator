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
  assert.equal(next,first);assert.ok(Object.isFrozen(next));assert.ok(Object.isFrozen(next.documents));
  listeners.click({composedPath:()=>[block,root],stopPropagation(){}});
  assert.deepEqual(nav,[['doc',{start:5,end:6}]]);
  assert.notEqual(publish(false,9).thumbnail,first.thumbnail);
  assert.equal(calls.length,2);
  const otherAdapter={...adapter,paperThumbnail:()=>null};
  const other=describeMeasuredPaper({slices:[{origin,range:{start:10,end:11}}]},options,otherAdapter,{root,pages:[{node:page,reuse:true,fragments:[block]}]})[0];
  assert.equal(other.thumbnail,null);
});

test('reused fragments skip topology searches while rebinding math and named slot source ranges',()=>{
  const listeners={},nav=[];let searches=0;
  const root={addEventListener:(name,fn)=>{listeners[name]=fn;}};
  const slot={dataset:{namedSlot:'answer'},style:{}};
  const math={dataset:{mathStart:'2',mathEnd:'3'},style:{},closest:()=>slot};
  const block={style:{},querySelectorAll(selector){
    searches++;return selector==='[data-named-slot]'?[slot]:[math];
  }};
  const page={},origin={documentId:'a',blockKey:'b'},options={sections:[{blocks:[{origin}]}]};
  let offset=10;
  const adapter={previewSourceRange:(_,range)=>({start:offset+range.textStart,end:offset+range.textEnd}),paperThumbnail:()=>null,onNavigate:(...args)=>nav.push(args)};
  const publish=reuse=>describeMeasuredPaper({slices:[{origin,textStart:0,textEnd:5,namedSlots:[{name:'answer',textStart:1,textEnd:4}]}]},options,adapter,{root,pages:[{node:page,reuse,fragments:[block]}]});
  publish(false);assert.equal(searches,2);
  offset=100;publish(true);assert.equal(searches,2);
  for(const node of [block,math,slot])listeners.click({composedPath:()=>[node,root],stopPropagation(){}});
  assert.deepEqual(nav,[['a',{start:100,end:105}],['a',{start:102,end:103}],['a',{start:101,end:104}]]);
  publish(false);assert.equal(searches,4);
});

test('source index isolates document and block keys and resolves the current source object',()=>{
  const root={addEventListener(){}};
  const fragment=()=>({style:{},querySelectorAll:()=>[]});
  const origin=(documentId,blockKey)=>({documentId,blockKey});
  const a=origin('a,b','c'),b=origin('a','b,c'),c=origin('other','c');
  const previous={origin:a},current={origin:a},second={origin:b},third={origin:c};
  const slices=[a,b,c,origin('missing','c')].map(origin=>({origin,textStart:0,textEnd:1}));
  const options={sections:[{blocks:[previous,second,{kind:'break',origin:a}]},{blocks:[third,current,{kind:'break',origin:c}]}]};
  const seen=[];
  const fragments=slices.map(fragment);
  describeMeasuredPaper({slices},options,{
    previewSourceRange:(block,slice)=>{seen.push([block,slice]);return block?{start:1,end:2}:null;},
    paperThumbnail:()=>null,onNavigate:()=>{}
  },{root,pages:[{node:{},reuse:false,fragments}]});
  assert.deepEqual(seen.map(([block])=>block),[current,second,third,undefined]);
  assert.equal(seen[0][0],current);
  assert.deepEqual(seen.map(([,slice])=>slice),slices);
  assert.equal(fragments[3].tabIndex,undefined);
});

test('reused page metadata is shared only with matching document order and page number',()=>{
  const root={addEventListener(){}},page={},emptyPage={};
  const fragments=Array.from({length:3},()=>({style:{},querySelectorAll:()=>[]}));
  const a={documentId:'a',blockKey:'a'},b={documentId:'b',blockKey:'b'};
  const options={sections:[{blocks:[{origin:a},{origin:b}]}]};
  const adapter={previewSourceRange:()=>({start:1,end:2}),paperThumbnail:()=>null,onNavigate:()=>{}};
  const publish=(origins,reuse,shift=false)=>describeMeasuredPaper({slices:origins.map(origin=>({origin}))},options,adapter,{root,pages:[...(shift?[{node:emptyPage,reuse:false,fragments:[]}]:[]),{node:page,reuse,fragments}]}).at(-1);
  const first=publish([a,b,a],false);
  assert.deepEqual(first.documents,['a','b']);
  assert.equal(publish([a,b,a],true),first);
  const changed=publish([b,a,b],true);
  assert.notEqual(changed,first);assert.deepEqual(changed.documents,['b','a']);
  const shifted=publish([b,a,b],true,true);
  assert.notEqual(shifted,changed);assert.equal(shifted.number,2);
  assert.equal(publish([b,a,b],true,true),shifted);
  assert.notEqual(publish([b,a,b],false,true),shifted);
});
