import test from 'node:test';
import assert from 'node:assert/strict';
import {alignCanvasRects,measuredAlignment} from '../canvas-alignment.mjs';
const a={id:'a',x:1000,y:3000,width:2000,height:4000};
const b={id:'b',x:9000,y:1000,width:5000,height:2000};
const bounds={width:20000,height:12000};
test('align all six modes against selection bounds, preserve other axis',()=>{
  for(const [mode,expected] of Object.entries({
    left:[{id:'a',x:1000,y:3000},{id:'b',x:1000,y:1000}],
    center:[{id:'a',x:6500,y:3000},{id:'b',x:5000,y:1000}],
    right:[{id:'a',x:12000,y:3000},{id:'b',x:9000,y:1000}],
    top:[{id:'a',x:1000,y:1000},{id:'b',x:9000,y:1000}],
    middle:[{id:'a',x:1000,y:2000},{id:'b',x:9000,y:3000}],
    bottom:[{id:'a',x:1000,y:3000},{id:'b',x:9000,y:5000}]
  }))assert.deepEqual(alignCanvasRects([a,b],mode,bounds),expected,mode);
  assert.deepEqual(a,{id:'a',x:1000,y:3000,width:2000,height:4000});
});
test('reject invalid selection, stale/overflow geometry and schema coordinate limits',()=>{
  for(const rects of [[a],[a,a],[a,{...b,y:11000}],[a,{...b,height:NaN}]])assert.throws(()=>alignCanvasRects(rects,'left',bounds),RangeError);
  assert.throws(()=>alignCanvasRects([a,b],'unknown',bounds),RangeError);
  assert.throws(()=>alignCanvasRects([a,{...b,x:99000,width:5000}],'right',{width:150000,height:12000}),RangeError);
});
test('measured alignment uses exact direct child height and excludes nested or missing IDs',()=>{
  const px=n=>n*96/25400+'px';
  const canvas={dataset:{componentNode:'parent'},style:{width:px(24000),height:px(16000)},children:[{dataset:{componentNode:'a'},style:{height:px(4000)}},{dataset:{componentNode:'b'},style:{height:px(2000)}}]};
  const root={querySelectorAll:()=>[canvas]},parent={id:'parent',padding:2000,children:[a,b]};
  assert.deepEqual(measuredAlignment(root,parent,['a','b']),{rects:[a,b],bounds});
  assert.throws(()=>measuredAlignment(root,parent,['a','nested']));
});
