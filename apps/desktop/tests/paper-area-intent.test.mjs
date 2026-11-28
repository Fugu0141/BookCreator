import test from 'node:test';
import assert from 'node:assert/strict';
import {canEditPaperArea,planPaperAreaIntent,beginPaperAreaDrag,previewPaperAreaDrag,finishPaperAreaDrag,beginPaperGapDrag,previewPaperGapDrag,finishPaperGapDrag} from '../paper-area-intent.mjs';
const target={documentId:'chapter',blockKey:'example',revision:'r1',fingerprint:'f1',fragmentCount:1};
const input={target,current:{...target}};
test('independent occupied constraints preserve explicit mode, spacing and unrelated dimensions',()=>{
  const placement={mode:'preferred',preferred:{page:0,x:0,y:0},spaceAfter:3000,sizeConstraints:{minWidthPercent:40,maxHeight:200000}};
  const original=structuredClone(placement);
  const next=planPaperAreaIntent({...input,placement,axis:'height',value:25});
  assert.deepEqual(next,{documentId:'chapter',blockKey:'example',placement:{...placement,sizeConstraints:{...placement.sizeConstraints,minHeightPercent:25}}});
  assert.deepEqual(placement,original);
  const cleared=planPaperAreaIntent({...input,placement:next.placement,axis:'height',value:0});
  assert.deepEqual(cleared.placement,original);
  assert.equal(planPaperAreaIntent({...input,placement,axis:'width',value:40}),null);
  assert.equal(planPaperAreaIntent({...input,axis:'height',value:0}),null);
  assert.deepEqual(planPaperAreaIntent({...input,placement:{sizeConstraints:{minHeightPercent:25}},axis:'height',value:0}).placement,{});
});
test('reject stale, ambiguous and fixed targets and invalid percentages',()=>{
  for(const changes of [{revision:'r2'},{fingerprint:'f2'},{blockKey:'other'},{documentId:'other'},{fragmentCount:2}]){
    const current={...target,...changes};
    assert.equal(canEditPaperArea(target,current),false);
    assert.throws(()=>planPaperAreaIntent({target,current,axis:'width',value:50}));
  }
  assert.throws(()=>planPaperAreaIntent({...input,placement:{mode:'fixed'},axis:'height',value:30}),/固定/);
  assert.throws(()=>planPaperAreaIntent({...input,placement:{fixed:{page:0,x:0,y:0}},axis:'height',value:30}),/固定/);
  for(const value of [-1,100.1,101,NaN])assert.throws(()=>planPaperAreaIntent({...input,axis:'width',value}));
  assert.throws(()=>planPaperAreaIntent({...input,axis:'toString',value:50}));
});
test('drag is relative to full body extent and invariant to zoom',()=>{
  for(const scale of [1,0.5,2]){
    const gesture=beginPaperAreaDrag({...input,axis:'height',occupiedPx:200*scale,bodyPx:800*scale,originPx:300*scale});
    assert.equal(previewPaperAreaDrag(gesture,500*scale).value,50);
    assert.deepEqual(finishPaperAreaDrag(gesture,{current:target,pointerPx:500*scale}),{documentId:'chapter',blockKey:'example',placement:{sizeConstraints:{minHeightPercent:50}}});
  }
});
test('cancel, stale revision, no movement and return to fractional origin do not create an intent',()=>{
  const gesture=beginPaperAreaDrag({...input,axis:'width',occupiedPx:201,bodyPx:800,originPx:300});
  assert.equal(previewPaperAreaDrag(gesture,300).changed,false);
  for(const extra of [{cancelled:true,pointerPx:500},{pointerPx:300},{pointerPx:301},{current:{...target,revision:'r2'},pointerPx:500}]){
    assert.equal(finishPaperAreaDrag(gesture,{current:target,...extra}),null);
  }
  assert.equal(beginPaperAreaDrag({...input,axis:'width',occupiedPx:0,bodyPx:800,originPx:0}),null);
  assert.equal(beginPaperAreaDrag({...input,axis:'width',occupiedPx:200,bodyPx:800,originPx:0,placement:{mode:'fixed'}}),null);
});

test('gap drag is zoom invariant, independently measured in millimetres and can return to zero',()=>{
  for(const scale of [.5,1,2]){
    const start={...input,value:0,bodyPx:800*scale,bodyHeight:200000,originPx:300*scale};
    const gesture=beginPaperGapDrag(start);
    assert.equal(previewPaperGapDrag(gesture,340*scale).value,10000);
    assert.equal(finishPaperGapDrag(gesture,{current:target,pointerPx:340*scale}),10000);
    const existing=beginPaperGapDrag({...start,value:10000});
    assert.equal(finishPaperGapDrag(existing,{current:target,pointerPx:260*scale}),0);
    assert.equal(previewPaperGapDrag(existing,10000).value,200000);
    assert.equal(previewPaperGapDrag(existing,-10000).value,0);
    assert.equal(finishPaperGapDrag(existing,{current:target,pointerPx:start.originPx}),null);
    assert.equal(finishPaperGapDrag(existing,{current:{...target,revision:'r2'},pointerPx:500}),null);
    assert.equal(finishPaperGapDrag(existing,{current:target,pointerPx:500,cancelled:true}),null);
    assert.equal(finishPaperGapDrag(existing,{current:target,pointerPx:500,placement:{mode:'fixed'}}),null);
    assert.equal(beginPaperGapDrag({...start,placement:{mode:'fixed'}}),null);
    assert.equal(beginPaperGapDrag({...start,bodyPx:0}),null);
  }
});

test('leading gap grows upward and shrinks downward, including zero and zoom',()=>{
  for(const scale of [.5,1,2]){
    const start={...input,value:0,bodyPx:800*scale,bodyHeight:200000,originPx:300*scale,side:'before'};
    const gesture=beginPaperGapDrag(start);
    assert.equal(previewPaperGapDrag(gesture,260*scale).value,10000);
    assert.equal(finishPaperGapDrag(gesture,{current:target,pointerPx:260*scale}),10000);
    const existing=beginPaperGapDrag({...start,value:10000});
    assert.equal(finishPaperGapDrag(existing,{current:target,pointerPx:340*scale}),0);
    assert.equal(previewPaperGapDrag(existing,-10000).value,200000);
    assert.equal(finishPaperGapDrag(existing,{current:target,pointerPx:260*scale,cancelled:true}),null);
    assert.equal(finishPaperGapDrag(existing,{current:{...target,fingerprint:'old'},pointerPx:260*scale}),null);
    assert.equal(beginPaperGapDrag({...start,side:'unknown'}),null);
  }
});
