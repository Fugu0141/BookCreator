import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {editDocument,compileMeasuredManuscript,canReviewLayout,prepareBrowserPreview,prepareBookBrowserPreview,defaultHeadingDesign} from '../dist/index.js';
const load = (variable, fallback) => import(pathToFileURL(resolve(process.env[variable] ?? fallback)).href);
const bcm = await load('BCM_DIST', '../BookCreator_Markdown/dist/index.js');
const engine = await load('ENGINE_DIST', '../BookCreator_LayoutEngine/dist/index.js');
test('BCM attribute edit -> document revision -> geometry', () => {
  const source = '::figure{#fig-unity width="75%" alt="日本語😀"}\r\n';
  const snapshot = {documentId:'chapter-1', revision:1, source};
  const parsed = bcm.parseDirectiveHeader(source.trimEnd());
  assert.equal(parsed.diagnostics.length,0);
  const attr = parsed.directives[0].attributes.find(a=>a.key==='width');
  assert.equal(attr.value,'75%');
  const old = source.slice(attr.range.start,attr.range.end);
  const next = editDocument(snapshot,1,[{start:attr.range.start,end:attr.range.end,expected:old,replacement:'width="50%"'}],(s,edits)=>bcm.applyPatches(s,edits.map(e=>({range:{start:e.start,end:e.end},expected:e.expected,replacement:e.replacement}))));
  assert.equal(next.source, source.replace('75%','50%'));
  assert.equal(next.revision,2);
  const updated = bcm.parseDirectiveHeader(next.source.trimEnd()).directives[0];
  assert.equal(updated.id,'fig-unity');
  const width = updated.attributes.find(a=>a.key==='width').value;
  const available = engine.toMicrometres('160mm');
  const rect = engine.layoutFlow('column',[{width:Math.round(available*parseFloat(width)/100),height:engine.toMicrometres('20mm')}],0,{width:available,height:engine.toMicrometres('100mm')})[0];
  assert.deepEqual(rect,{x:0,y:0,width:80000,height:20000});
});
test('nested BCM component -> measured hybrid heading tree',()=>{
  const source='::::layout{}\n:::component{name="chapter-heading"}\n# 日本語\n:::\n\n::::\n';
  const parsed=bcm.scanDocument(source);assert.equal(parsed.diagnostics.length,0);
  const heading=parsed.blocks[0].children[0].children[0];assert.equal(heading.kind,'heading');assert.equal(source.slice(heading.range.start,heading.range.end),'# 日本語\n');
  const tree={id:'heading',type:'stack',width:'fill',height:'auto',children:[{id:'row',type:'row',width:'fill',height:'auto',gap:3000,children:[{id:'bar',type:'leaf',width:2000,height:'fill'},{id:'text',type:'leaf',width:'fill',height:'auto',natural:{width:30000,height:12000}}]},{id:'overlay',type:'canvas',role:'overlay',width:'fill',height:'fill',children:[{id:'dot',type:'leaf',width:2000,height:2000,anchorX:'end',x:1000,y:1000}]}]};
  const result=engine.layoutTree(tree,{width:160000,height:100000});assert.equal(result.rect.height,12000);assert.equal(result.children[0].children[0].rect.height,12000);assert.equal(result.children[1].children[0].rect.x,157000);
});

test('real scanner -> compiler -> measured pagination, preserving source and figure width',()=>{
  const a='# Chapter A\n\nOne\nTwo\n\n::figure{#fig-a src="a.png" width="75%"}\n';
  const b='# Chapter B\n\nText\n\n# Next\n\n::pagebreak{side="any"}\n\nEnd\n';
  const docs=[{documentId:'a',revision:'1',source:a,startOn:'page'},{documentId:'b',revision:'1',source:b,startOn:'continuous'}];
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds,measure:item=>item.kind==='heading'?[20]:item.kind==='figure'?[30]:item.text.split('\n').map(()=>10)};
  const compiled=compileMeasuredManuscript(docs,'1','fixture',{width:100,height:100},deps);
  assert.deepEqual(compiled.diagnostics,[]);assert.equal(compiled.publicationReady,false);
  const plan=engine.paginateMeasured(compiled.input);
  assert.equal(plan.completeness,'full');assert.equal(plan.publicationReady,false);assert.equal(canReviewLayout({revision:'1',fingerprint:'fixture'},plan),false);
  assert.deepEqual(plan.pages.map(p=>p.fragments.map(f=>f.origin.documentId+':'+f.origin.blockKey)),[
    ["a:0","a:13","a:22","b:0","b:13"],["b:19"],["b:52"]
  ]);
  const fig=plan.pages[0].fragments.find(f=>f.origin.persistentId==='fig-a');
  assert.equal(fig.rect.width,75);assert.equal(a.slice(fig.origin.range.start,fig.origin.range.end),'::figure{#fig-a src="a.png" width="75%"}\n');
});
test('unsupported content and duplicate IDs do not produce layout input',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds,measure:()=>[10]};
  const run=(...sources)=>compileMeasuredManuscript(sources.map((source,i)=>({documentId:String(i),revision:'1',source,startOn:'page'})),'1','fixture',{width:100,height:100},deps);
  assert.equal(run('**bold**\n').input,undefined);
  assert.equal(run('::pagebreak{side="right"}\n').input,undefined);
  assert.equal(run('::figure{#id src="a.png"}\n','::figure{#id src="b.png"}\n').diagnostics[0].code,'BCM_DUPLICATE_BLOCK_ID');
});

test('BCM schema validation and Inspector connected at application boundary',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds,measure:()=>[10]};
  const run=source=>compileMeasuredManuscript([{documentId:'a',revision:'1',source,startOn:'page'}],'1','fixture',{width:100,height:100},deps);
  const bad=run('::figure{src="https://example.test/image.png"}\n');
  assert.equal(bad.input,undefined);assert.equal(bad.diagnostics[0].code,'BCM_ATTRIBUTE_VALUE');
  const good=run('::figure{src="../assets/a.png" width="50%"}\n');
  const inspected=engine.inspectMeasuredInput(good.input);
  assert.equal(inspected.ok,true);assert.equal(inspected.plan.completeness,'full');
  assert.equal(inspected.plan.pages[0].fragments[0].rect.width,50);
  assert.equal(inspected.plan.publicationReady,false);
});

test('browser preview preparation separates parsing from measurement and verifies exact source offsets',()=>{
  const source='# 見出し\r\n\r\nCafé and 日本語。\r\n';
  const doc={documentId:'preview',revision:'3',source,startOn:'page'};
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds};
  const result=prepareBrowserPreview(doc,'3','fixture',{width:100000,height:70000},deps);
  assert.deepEqual(result.diagnostics,[]);
  const blocks=result.options.blocks;assert.equal(blocks.length,2);
  assert.equal(blocks[0].startPosition,'page-top');
  for(const b of blocks)assert.equal(source.slice(b.sourceTextStart,b.sourceTextStart+b.request.text.length),b.request.text);
  assert.equal(result.publicationReady,false);
  assert.equal(prepareBrowserPreview({...doc,source:'::figure{src="a.png"}\n'},'3','fixture',{width:100000,height:70000},deps).options,undefined);
  assert.equal(prepareBrowserPreview({...doc,source:'One\nTwo\n'},'3','fixture',{width:100000,height:70000},deps).options,undefined);
});

test('independent font role settings are forwarded and invalid font CSS is rejected',()=>{
  const doc={documentId:'fonts',revision:'1',source:'# 見出し\n\n本文。\n',startOn:'page'};
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds};
  const settings={body:{fontFamily:'BCFont_NotoSansJP',fontWeight:400},heading:{fontFamily:'serif',fontWeight:700}};
  const result=prepareBrowserPreview(doc,'1','fonts',{width:100000,height:70000},deps,settings);
  assert.equal(result.options.blocks[0].request.fontFamily,'serif');
  assert.equal(result.options.blocks[0].request.fontWeight,700);
  assert.equal(result.options.blocks[1].request.fontFamily,'BCFont_NotoSansJP');
  assert.equal(result.options.blocks[1].request.fontWeight,400);
  assert.throws(()=>prepareBrowserPreview(doc,'1','bad',{width:100000,height:70000},deps,{...settings,body:{fontFamily:'serif; color:red',fontWeight:400}}));
});

test('book preview adapter preserves manuscript order, manual breaks and origins',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds};
  const docs=[{documentId:'a',revision:'1',source:'First\n',startOn:'page'},{documentId:'b',revision:'2',source:'# Second\n\n::pagebreak{}\n\nThird\n',startOn:'continuous'}];
  const r=prepareBookBrowserPreview(docs,'1','book',{width:100000,height:100000},deps);
  assert.deepEqual(r.diagnostics,[]);
  assert.deepEqual(r.options.sections.map(s=>[s.id,s.startOn]),[['a','page'],['b','continuous']]);
  assert.equal(r.options.sections[1].blocks[1].kind,'pagebreak');
  assert.equal(r.options.sections[1].blocks[2].origin.documentId,'b');
});

test('heading design compiler applies only to headings and leaves source text exact',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds};
  const design=defaultHeadingDesign();
  const doc={documentId:'a',revision:'1',source:'# 見出し\n\n本文。\n',startOn:'page'};
  const r=prepareBookBrowserPreview([doc],'1','lab',{width:100000,height:100000},deps,undefined,design);
  assert.deepEqual(r.diagnostics,[]);
  const [heading,body]=r.options.sections[0].blocks;
  assert.equal(heading.component.direction,'row');
  assert.equal(heading.request.fontSize,design.fontSize);
  assert.equal(heading.request.text,'見出し');
  assert.equal(body.component,undefined);
});

test('level-specific heading style and independent label font resolve without source changes',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds};
  const shared=defaultHeadingDesign(),special={...shared,direction:'column',font:{id:'system-serif',weight:700},children:[{id:'label',type:'label',width:'fill',text:'SECTION',fontSize:3000,lineHeight:1.5,color:'#123456',font:{id:'system-monospace',weight:400}},{id:'content',type:'content'}]};
  const doc={documentId:'a',revision:'1',source:'# 一章\n\n## 小見出し\n\n本文。\n',startOn:'page'};
  const r=prepareBookBrowserPreview([doc],'1','levels',{width:100000,height:100000},deps,undefined,shared,{'2':special});
  assert.deepEqual(r.diagnostics,[]);
  const [h1,h2,body]=r.options.sections[0].blocks;
  assert.equal(h1.component.direction,'row');assert.equal(h2.component.direction,'column');
  assert.equal(h2.request.fontFamily,'serif');assert.equal(h2.component.children[0].fontFamily,'monospace');
  assert.equal(h2.request.text,'小見出し');assert.equal(body.component,undefined);
});
