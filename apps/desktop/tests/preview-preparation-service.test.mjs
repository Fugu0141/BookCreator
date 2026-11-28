import test from 'node:test';
import assert from 'node:assert/strict';
import {preparationPayload,createPreparationService} from '../preview-preparation-service.mjs';
test('only preparation data crosses the boundary',()=>{
  const input={whole:false,needsContext:true,file:{id:'a',path:'secret'},theme:{library:{entries:[]},unrelated:'secret'},fonts:[{bytes:[] }],raw:'duplicate',rev:'1',fingerprint:'f',geometry:{content:{width:100,height:100},paper:{width:120}},typography:{}};
  const result=preparationPayload(input,[{documentId:'a',revision:'1',source:'text',startOn:'page',path:'secret'}]);
  assert.deepEqual(result.input.file,{id:'a'});
  assert.deepEqual(result.input.geometry,{content:{width:100,height:100}});
  assert.equal(result.input.theme.unrelated,undefined);
  assert.equal(result.input.raw,undefined);
  assert.equal(result.input.fonts,undefined);
  assert.equal(result.documents[0].path,undefined);
  assert.doesNotThrow(()=>structuredClone(result));
});
test('service preserves request identity, bounds sessions to retained work, and resets',()=>{
  let created=0,cleared=0,t=0;
  const make=()=>{created++;let hits=0,misses=0,bypasses=0;return {touch(){hits++;},stats:()=>({hits,misses,bypasses}),clear(){cleared++;}};};
  const service=createPreparationService({prepare:(docs,rev,fingerprint,content,deps)=>{
    deps.scanSession?.touch();deps.inlineSession?.touch();
    return {options:{revision:rev,fingerprint,sections:[{id:'a'},{id:'b'}]},diagnostics:[]};
  },deps:{},createScanSession:make,createInlineSession:make,now:()=>++t});
  const request={type:'prepare',id:1,retained:true,input:{whole:false,needsContext:true,file:{id:'a'},rev:'1',fingerprint:'f',geometry:{content:{width:100,height:100}}},documents:[]};
  const a=service.handle(request);
  assert.equal(a.id,1);assert.equal(a.type,'prepared');
  assert.deepEqual(a.prepared.options.sections,[{id:'a'}]);
  assert.equal(a.preparationMs,1);
  assert.deepEqual(a.work,{scan:{hits:1,misses:0},inline:{hits:1,misses:0,bypasses:0}});
  assert.equal(service.handle({...request,id:2,retained:false}).work,null);
  assert.equal(created,2);
  assert.deepEqual(service.handle({type:'reset',id:3}),{type:'reset',id:3});
  assert.equal(cleared,2);
  assert.equal(service.handle({...request,id:4}).type,'prepared');
  assert.equal(created,4);
  assert.equal(service.handle({type:'bad',id:5}).type,'error');
  assert.equal(service.handle({type:'bad',id:-1}).id,null);
  assert.equal(service.handle({...request,id:6,input:{...request.input,theme:{studyResourceErrors:{bad:'unavailable'}}},documents:[{source:'bad'}]}).type,'error');
});
