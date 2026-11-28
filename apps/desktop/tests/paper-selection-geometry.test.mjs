import test from 'node:test';
import assert from 'node:assert/strict';
import {clipPaperRect,placePaperPropertyPanel,paperPositionFromDrag,paperPositionFromPagePointer,resolvePaperSelectionNodes,preferredPositionEditStart,placeBookPositionPanel,parsePaperMillimetres,paperPositionFromCoordinates} from '../paper-selection-geometry.mjs';
const v={left:10,top:20,right:110,bottom:120};
test('visible rectangle and partial clipping',()=>{
  assert.deepEqual(clipPaperRect({left:20,top:30,right:70,bottom:80},v),{left:20,top:30,width:50,height:50});
  assert.deepEqual(clipPaperRect({left:0,top:15,right:150,bottom:70},v),{left:10,top:20,width:100,height:50});
});
test('hide offscreen, zero and invalid rectangles',()=>{
  for(const r of [{left:120,top:0,right:130,bottom:100},{left:0,top:0,right:10,bottom:100},{left:NaN,top:0,right:50,bottom:60}])
    assert.equal(clipPaperRect(r,v),null);
});

test('floating properties prefer below, flip above, and fit narrow viewports',()=>{
  const bounds={left:10,top:20,right:510,bottom:420},size={width:260,height:100};
  assert.deepEqual(placePaperPropertyPanel({left:30,top:40,width:100,height:40},bounds,size),{left:30,top:88,width:260,maxHeight:384});
  assert.deepEqual(placePaperPropertyPanel({left:400,top:350,width:100,height:40},bounds,size),{left:242,top:242,width:260,maxHeight:384});
  assert.deepEqual(placePaperPropertyPanel({left:30,top:40,width:100,height:40},{left:10,top:20,right:210,bottom:120},size),{left:18,top:28,width:184,maxHeight:84});
});


test('physical drag position is zoom-independent and rejects out-of-bounds destinations',()=>{
  const origin={page:3,x:20000,y:30000},bounds={maxX:80000,maxY:150000},body={width:100000,height:200000,pixelWidth:500,pixelHeight:1000};
  const expected={page:3,x:30000,y:20000};
  assert.deepEqual(paperPositionFromDrag(origin,bounds,body,{x:50,y:-50}),expected);
  assert.deepEqual(paperPositionFromDrag(origin,bounds,{...body,pixelWidth:250,pixelHeight:500},{x:25,y:-25}),expected);
  assert.deepEqual(paperPositionFromDrag(origin,bounds,body,{x:0,y:0}),origin);
  for(const delta of [{x:-101,y:0},{x:301,y:0},{x:0,y:601},{x:NaN,y:0}])assert.equal(paperPositionFromDrag(origin,bounds,body,delta),null);
});


test('cross-page pointer preserves physical grab offset with different page origins and zoom',()=>{
  const body={width:100000,height:200000},bounds={maxX:80000,maxY:150000},grab={x:2000,y:3000};
  const page={page:4,left:550,top:20,width:500,height:1000};
  assert.deepEqual(paperPositionFromPagePointer(page,body,{x:660,y:185},grab,bounds),{page:4,x:20000,y:30000});
  assert.deepEqual(paperPositionFromPagePointer({...page,left:800,width:250,height:500},body,{x:855,y:102.5},grab,bounds),{page:4,x:20000,y:30000});
  for(const pointer of [{x:549,y:185},{x:1050,y:185},{x:550,y:20},{x:1000,y:185},{x:660,y:900}])assert.equal(paperPositionFromPagePointer(page,body,pointer,grab,bounds),null);
});


test('group selection frame nodes match exact document and block identities, retaining selection order',()=>{
  const node=(document,block)=>({dataset:{document,block}});
  const a=node('ch','a'),b=node('ch','b'),other=node('other','a'),dup=node('ch','b');
  assert.deepEqual(resolvePaperSelectionNodes([a,other,b],'ch',['b','a']),[{key:'b',index:0,node:b},{key:'a',index:1,node:a}]);
  assert.deepEqual(resolvePaperSelectionNodes([a,b,dup,other],'ch',['b','a','missing']),[{key:'a',index:1,node:a}]);
  assert.deepEqual(resolvePaperSelectionNodes([a,b],'ch',['a','a']),[]);
  const quoted=node('ch','a"]#unexpected');
  assert.deepEqual(resolvePaperSelectionNodes([quoted],'ch',['a"]#unexpected']),[{key:'a"]#unexpected',index:0,node:quoted}]);
});


test('preferred position editing preserves requested coordinates and tolerances instead of measured fallback',()=>{
  const position={page:1,x:1000,y:3000},bounds={maxX:80000,maxY:150000},body={width:100000,height:200000};
  const stored={position:{page:1,x:25000,y:35000},tolerance:{x:1234,y:0}};
  assert.deepEqual(preferredPositionEditStart(position,bounds,body,stored),{...stored,requiresRebase:false});
  for(const invalid of [{...stored,position:{...stored.position,page:0}},{...stored,position:{...stored.position,x:90000}},{...stored,tolerance:{x:100001,y:0}}]){
    const start=preferredPositionEditStart(position,bounds,body,invalid);
    assert.equal(start.requiresRebase,true);
    assert.deepEqual(start.tolerance,invalid.tolerance);
  }
  assert.deepEqual(preferredPositionEditStart(position,bounds,body,undefined),{position,tolerance:{x:5000,y:5000},requiresRebase:false});
});


test('position property panel avoids the drag handle even in a short viewport',()=>{
  const bounds={left:200,top:420,right:1000,bottom:650},selection={left:280,top:578,width:630,height:56},handle={left:282,top:580,width:32,height:32};
  const assertFree=(bounds,selection,handle)=>{
    const p=placeBookPositionPanel(selection,handle,bounds,{width:260,height:270});
    assert.ok(p.width>0&&p.maxHeight>0);
    assert.ok(p.left>=bounds.left&&p.top>=bounds.top&&p.left+p.width<=bounds.right&&p.top+p.maxHeight<=bounds.bottom);
    assert.ok(p.left>=handle.left+handle.width||p.left+p.width<=handle.left||p.top>=handle.top+handle.height||p.top+p.maxHeight<=handle.top);
  };
  assertFree(bounds,selection,handle);
  assertFree({left:0,top:0,right:220,bottom:150},{left:0,top:55,width:220,height:60},{left:2,top:57,width:32,height:32});
});


test('physical position input parses exact millimetres without rounding or clamping',()=>{
  assert.equal(parsePaperMillimetres('1.001',1001),1001);
  assert.equal(parsePaperMillimetres('0.009',1001),9);
  assert.equal(parsePaperMillimetres('0',0),0);
  for(const v of ['','-1','1.','1.0001','1e2',' 1','Infinity','999999999999999999999999','1.002'])assert.equal(parsePaperMillimetres(v,1001),null);
  const bounds={maxX:50000,maxY:100000},position={page:2,x:0,y:0};
  assert.deepEqual(paperPositionFromCoordinates(position,bounds,{x:'12.345',y:'99.999'}),{page:2,x:12345,y:99999});
  assert.equal(paperPositionFromCoordinates(position,bounds,{x:'50.001',y:'0'}),null);
  assert.equal(paperPositionFromCoordinates(position,bounds,{x:'0',y:''}),null);
});
