import test from 'node:test';
import assert from 'node:assert/strict';
import {describeBookPaperProperties} from '../book-paper-properties.mjs';
const origin={documentId:'a',blockKey:'b',persistentId:'id'};
const placement={page:1,rect:{x:123,y:456,width:500,height:600},occupiedRect:{x:123,y:456,width:800,height:900},preference:'fallback'};
const candidate={current:()=>true,selection:{documentId:'a',blockKey:'b'},persistentId:'id',plan:{fragments:[{origin,placement}]},options:{width:1000,height:2000},areaPrepared:{document:{entries:[{documentId:'a',persistentId:'id',minWidthPercent:80,spaceAfter:300,bookPreferred:{position:{page:0,x:0,y:0},tolerance:{x:0,y:0}}}]}}};
test('inspector distinguishes saved intent from actual measured position and footprint',()=>{
  const p=describeBookPaperProperties(candidate);
  assert.equal(p.page,2);assert.equal(p.x,123);assert.equal(p.mode,'preferred');assert.equal(p.preference,'fallback');assert.equal(p.savedWidth,80);assert.equal(p.savedHeight,null);assert.equal(p.occupiedWidth,800);assert.equal(p.after,300);assert.equal(p.preferred.position.page,0);
  assert.equal(describeBookPaperProperties({...candidate,areaPrepared:{document:{entries:[]}}}).mode,'automatic');
  assert.equal(describeBookPaperProperties({...candidate,current:()=>false}),null);
  assert.equal(describeBookPaperProperties({...candidate,plan:{fragments:[{origin,placement},{origin,placement}]}}),null);
});
