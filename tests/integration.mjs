import {makeMathTextbook,makeLibrary as makeMathLibrary,typography as mathTypography,size as mathSize,formulas as mathFormulas,expectedNumbers} from './fixtures/math-textbook.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createInlineParseSession,createManuscriptScanSession,editDocument,compileMeasuredManuscript,canReviewLayout,prepareBrowserPreview,prepareBookBrowserPreview,defaultHeadingDesign,defaultParagraphDesign,previewSourceRange,planInlineFormat,planListFormat,planListIndent,planListBatch,inspectDisplayMath,planDisplayMath,inspectInlineMath,planInlineMath,inspectComponentDisplayMath,planComponentDisplayMath,previewSampleInline,equationReferenceTargets,planEquationReference,planEquationNumbering,planNumberedComponentDisplayMath,previewStudySamples} from '../dist/index.js';
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
  assert.equal(run('[bold](https://example.invalid)\n').input,undefined);
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
  assert.equal(prepareBrowserPreview({...doc,source:'One\nTwo\n'},'3','fixture',{width:100000,height:70000},deps).options.blocks[0].request.text,'One\nTwo');
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

test('nested component compiler resolves label fonts recursively',()=>{
  const shared=defaultHeadingDesign();
  const group={id:'group',type:'group',direction:'column',width:'fill',gap:1000,padding:1000,background:'#ffffff',children:[{id:'label',type:'label',width:'fill',text:'SECTION',fontSize:3000,lineHeight:1.5,color:'#123456',font:{id:'system-monospace',weight:400}},{id:'content',type:'content'}]};
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds};
  const doc={documentId:'a',revision:'1',source:'# 見出し\n\n本文。\n',startOn:'page'};
  const r=prepareBookBrowserPreview([doc],'1','nested',{width:100000,height:100000},deps,undefined,{...shared,children:[shared.children[0],group]});
  assert.deepEqual(r.diagnostics,[]);
  assert.equal(r.options.sections[0].blocks[0].component.children[1].children[0].fontFamily,'monospace');
});

test('Canvas coordinates survive compilation to neutral preview',()=>{
  const design={...defaultHeadingDesign(),children:[{id:'canvas',type:'group',direction:'canvas',width:'fill',height:50000,gap:0,padding:1000,background:'#ffffff',children:[{id:'content',type:'content',x:2000,y:5000,width:50000}]}]};
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds};
  const doc={documentId:'a',revision:'1',source:'# 見出し\n\n本文。\n',startOn:'page'};
  const r=prepareBookBrowserPreview([doc],'1','canvas',{width:100000,height:100000},deps,undefined,design);
  assert.deepEqual(r.diagnostics,[]);
  const group=r.options.sections[0].blocks[0].component.children[0];
  assert.equal(group.direction,'canvas');assert.equal(group.height,50000);assert.equal(group.children[0].x,2000);
});

test('dynamic heading fields resolve in book order, reset descendants and preserve original source slices',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds};
  const label=(field,extra={})=>({id:field,type:'dynamic',width:20000,field,prefix:'',suffix:'',fallback:'未設定',fontSize:3000,lineHeight:1.5,color:'#315b86',...extra});
  const design={...defaultHeadingDesign(),direction:'column',children:[label('chapter-number',{prefix:'第',suffix:'章'}),label('chapter-title'),label('heading-number'),label('heading-title'),label('heading-level'),{id:'content',type:'content'}]};
  const docs=[{documentId:'a',revision:'1',source:'# 第一章\n\n## 節\n\n#### 深い節\n\n## 次の節\n',startOn:'page'},{documentId:'b',revision:'1',source:'## 章なし\n\n# 新章\n\n## 節\n',startOn:'continuous'}];
  const p=prepareBookBrowserPreview(docs,'1','dynamic',{width:100000,height:100000},deps,undefined,design);
  assert.deepEqual(p.diagnostics,[]);
  const blocks=p.options.sections.flatMap(s=>s.blocks);
  assert.deepEqual(blocks.map(b=>b.component.children.slice(0,3).map(n=>n.text)),[
    ['第1章','第一章','1'],['第1章','第一章','1.1'],['第1章','第一章','1.1.0.1'],['第1章','第一章','1.2'],
    ['第2章','未設定','2.1'],['第3章','新章','3'],['第3章','新章','3.1']]);
  for(const b of blocks){const source=docs.find(d=>d.documentId===b.origin.documentId).source;assert.equal(source.slice(b.sourceTextStart,b.sourceTextStart+b.request.text.length),b.request.text);assert.equal(b.component.children[3].text,b.request.text);assert.equal(b.component.children[0].type,'label');}
  assert.equal(design.children[0].type,'dynamic');
});
test('overlong dynamic label yields located diagnostic rather than truncation',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds};
  const doc={documentId:'long',revision:'1',source:'# '+ '長'.repeat(257)+'\n',startOn:'page'};
  const design={...defaultHeadingDesign(),children:[{id:'dynamic',type:'dynamic',field:'heading-title',prefix:'',suffix:'',fallback:'?',width:20000,fontSize:3000,lineHeight:1.5,color:'#000000'},{id:'content',type:'content'}]};
  const r=prepareBookBrowserPreview([doc],'1','long',{width:100000,height:100000},deps,undefined,design);
  assert.equal(r.options,undefined);assert.equal(r.diagnostics[0].code,'BC_PREVIEW_COMPONENT');assert.equal(r.diagnostics[0].documentId,'long');
});

test('paragraph design applies only to body and preserves source text and split policy',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds};
  const doc={documentId:'body',revision:'1',source:'# 見出し\n\n本文の文章です。\n',startOn:'page'};
  const paragraph={...defaultHeadingDesign(),direction:'column',gap:0,fontSize:4000,children:[{id:'content',type:'content'}]};
  const r=prepareBookBrowserPreview([doc],'1','paragraph',{width:100000,height:100000},deps,{body:{fontFamily:'serif',fontWeight:400},heading:{fontFamily:'monospace',fontWeight:700}},undefined,undefined,paragraph);
  assert.deepEqual(r.diagnostics,[]);
  const [heading,body]=r.options.sections[0].blocks;
  assert.equal(heading.component,undefined);assert.equal(heading.splitPolicy,'strict');
  assert.equal(body.component.direction,'column');assert.equal(body.splitPolicy,'allow');
  assert.equal(body.request.fontFamily,'serif');assert.equal(body.request.fontSize,4000);
  assert.equal(doc.source.slice(body.sourceTextStart,body.sourceTextStart+body.request.text.length),body.request.text);
});

test('study directives preserve exact body offsets and stable IDs in both previews',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds};
  const source='# 章\r\n\r\n:::callout{#notice kind="warning" title="同じ文字"}\r\n同じ文字\r\n:::\r\n\r\n:::component{name="example" #ex-1}\r\n例題の本文。\r\n:::\r\n\r\n普通の本文。\r\n';
  const doc={documentId:'study',revision:'1',source,startOn:'page'},size={width:100000,height:100000};
  const one=prepareBrowserPreview(doc,'1','one',size,deps);
  const book=prepareBookBrowserPreview([doc],'1','book',size,deps);
  assert.deepEqual(one.diagnostics,[]);assert.deepEqual(book.diagnostics,[]);
  for(const blocks of [one.options.blocks,book.options.sections[0].blocks]){
    const [h,warning,example,body]=blocks;
    assert.equal(warning.component.children[0].text,'注意：同じ文字');
    assert.equal(example.component.children[0].text,'例題');
    assert.equal(warning.origin.persistentId,'notice');assert.equal(example.origin.persistentId,'ex-1');
    assert.equal(warning.splitPolicy,'strict');assert.equal(body.splitPolicy,'allow');
    assert.equal(warning.sourceTextStart,source.indexOf('同じ文字\r\n'));
    for(const b of blocks)assert.equal(source.slice(b.sourceTextStart,b.sourceTextStart+b.request.text.length),b.request.text);
  }
});
test('unsupported study forms and duplicate IDs fail closed',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds};
  const run=source=>prepareBookBrowserPreview([{documentId:'bad',revision:'1',source,startOn:'page'}],'1','bad',{width:100000,height:100000},deps);
  for(const source of [
    ':::callout{kind="unknown"}\n本文。\n:::\n',
    ':::component{name="exercise" split-policy="allow"}\n本文。\n:::\n',
    ':::callout{kind="tip"}\n[強調](https://example.invalid)\n:::\n',
    ':::callout{kind="tip"}\n本文。\n[強調](https://example.invalid)\n:::\n',
    '::::component{name="exercise"}\n:::slot{name="answer"}\n本文。\n:::\n::::\n',
    ':::callout{kind="tip"}\n:::\n',
    ':::callout{kind="tip" #dup}\n本文。\n:::\n\n:::component{name="example" #dup}\n本文。\n:::\n'
  ])assert.equal(run(source).options,undefined,source);
});

test('study customization resolves semantic title and source range without affecting other kinds',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds};
  const source=':::callout{kind="warning" title="確認"}\n本文。\n:::\n\n:::component{name="example"}\n例題。\n:::\n';
  const warning={...defaultHeadingDesign(),direction:'column',children:[{id:'custom',type:'dynamic',field:'study-title',prefix:'注意：',suffix:'',fallback:'なし',width:'fill',fontSize:4000,lineHeight:1.5,color:'#123456'},{id:'content',type:'content'}]};
  const result=prepareBookBrowserPreview([{documentId:'s',revision:'1',source,startOn:'page'}],'1','study-custom',{width:100000,height:100000},deps,undefined,undefined,undefined,undefined,{warning});
  assert.deepEqual(result.diagnostics,[]);
  const [a,b]=result.options.sections[0].blocks;
  assert.equal(a.component.children[0].text,'注意：確認');assert.equal(b.component.children[0].text,'例題');
  assert.equal(a.splitPolicy,'strict');assert.equal(source.slice(a.sourceTextStart,a.sourceTextStart+a.request.text.length),'本文。');
});

test('custom component references use stable library identity, not the display name',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds};
  const id='component-00000000-0000-4000-8000-000000000001';
  const source=':::component{#glossary name="'+id+'" title="用語"}\n用語の説明です。\n:::\n';
  const doc={documentId:'s',revision:'1',source,startOn:'page'},size={width:100000,height:100000};
  const design={...defaultHeadingDesign(),direction:'column',children:[{id:'custom',type:'dynamic',field:'study-label',prefix:'',suffix:'',fallback:'なし',width:'fill',fontSize:4000,lineHeight:1.5,color:'#123456'},{id:'content',type:'content'}]};
  const entry={id,name:'用語集',usage:'study',design},catalog={schemaVersion:3,entries:[entry]};
  const run=library=>prepareBookBrowserPreview([doc],'1','custom',size,deps,undefined,undefined,undefined,undefined,undefined,library);
  const a=run(catalog),b=run({...catalog,entries:[{...entry,name:'用語解説'}]});
  assert.deepEqual(a.diagnostics,[]);assert.deepEqual(b.diagnostics,[]);
  assert.equal(a.options.sections[0].blocks[0].component.children[0].text,'用語集：用語');
  const block=b.options.sections[0].blocks[0];assert.equal(block.component.children[0].text,'用語解説：用語');
  assert.equal(block.origin.persistentId,'glossary');assert.equal(source.slice(block.sourceTextStart,block.sourceTextStart+block.request.text.length),'用語の説明です。');
  const one=prepareBrowserPreview(doc,'1','one',size,deps,undefined,catalog);assert.deepEqual(one.diagnostics,[]);
  assert.equal(one.options.blocks[0].component.children[0].text,'用語集：用語');
  assert.equal(run(undefined).options,undefined);assert.match(run(undefined).diagnostics[0].message,/Missing custom/);
  const wrong=run({schemaVersion:1,entries:[{id,name:'Heading',usage:'heading',design:defaultHeadingDesign()}]});
  assert.match(wrong.diagnostics[0].message,/usage/);assert.equal(wrong.options,undefined);
});

test('study numbering follows manuscript order and semantic identity, not shared visual template',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds};
  const id='component-00000000-0000-4000-8000-000000000001';
  const design={...defaultHeadingDesign(),direction:'column',children:[...['study-number','study-sequence'].map((field,i)=>({id:'number'+i,type:'dynamic',field,prefix:'',suffix:'',fallback:'?',width:'fill',fontSize:3000,lineHeight:1.5,color:'#123456'})),{id:'content',type:'content'}]};
  const library={schemaVersion:3,entries:[{id,name:'用語集',usage:'study',design}]};
  const block=name=>':::component{name="'+name+'"}\n本文。\n:::\n\n';
  const a={documentId:'a',revision:'1',source:'# 第一章\n\n'+block('example')+block('exercise')+block('example')+block(id),startOn:'page'};
  const b={documentId:'b',revision:'1',source:block(id)+block('example')+'# 次章\n\n'+block('example'),startOn:'page'};
  const run=docs=>prepareBookBrowserPreview(docs,'1','numbering',{width:100000,height:100000},deps,undefined,undefined,undefined,undefined,{example:design,exercise:design},library);
  const labels=(result)=>result.options.sections.flatMap(s=>s.blocks.filter(b=>b.component).map(b=>b.component.children.slice(0,2).map(n=>n.text)));
  const r=run([a,b]);assert.deepEqual(r.diagnostics,[]);
  assert.deepEqual(labels(r),[['1.1','1'],['1.1','1'],['1.2','2'],['1.1','1'],['2.1','2'],['2.1','3'],['3.1','4']]);
  assert.deepEqual(labels(run([b,a])),[['1.1','1'],['1.1','1'],['2.1','2'],['3.1','3'],['3.1','1'],['3.2','4'],['3.1','2']]);
  for(const s of r.options.sections)for(const item of s.blocks.filter(b=>b.component)){const source=item.origin.documentId==='a'?a.source:b.source;assert.equal(item.request.text,'本文。');assert.equal(source.slice(item.sourceTextStart,item.sourceTextStart+item.request.text.length),'本文。');}
});

test('forward and cross-manuscript answer links follow question order without source changes',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds};
  const q=(id,title)=>':::component{name="exercise" #'+id+' title="'+title+'"}\n問題本文。\n:::\n\n';
  const a=(id)=>':::component{name="explanation" answer-to="'+id+'"}\n解答本文。\n:::\n\n';
  const questions={documentId:'q',revision:'1',source:'# 問題\n\n'+q('q1','基本')+q('q2','応用'),startOn:'page'};
  const answers={documentId:'a',revision:'1',source:'# 解答\n\n'+a('q2')+a('q1'),startOn:'page'};
  const size={width:100000,height:100000};
  const run=docs=>prepareBookBrowserPreview(docs,'1','answers',size,deps);
  const labels=(result,id)=>result.options.sections.find(s=>s.id===id).blocks.filter(b=>b.component).map(b=>b.component.children[0].text);
  const forward=run([answers,questions]);assert.deepEqual(forward.diagnostics,[]);assert.deepEqual(labels(forward,'a'),['解説 2.2','解説 2.1']);
  const normal=run([questions,answers]);assert.deepEqual(labels(normal,'a'),['解説 1.2','解説 1.1']);
  const swapped=run([{...questions,source:'# 問題\n\n'+q('q2','応用')+q('q1','基本')},answers]);assert.deepEqual(labels(swapped,'a'),['解説 1.1','解説 1.2']);
  for(const b of normal.options.sections[1].blocks.filter(b=>b.component))assert.equal(answers.source.slice(b.sourceTextStart,b.sourceTextStart+b.request.text.length),'解答本文。');
  const one=prepareBrowserPreview({...questions,source:a('q1')+q('q1','基本')},'1','one',size,deps);assert.deepEqual(one.diagnostics,[]);assert.equal(one.options.blocks[0].component.children[0].text,'解説 1.1');
  for(const source of [a('missing'),a('bad')+':::callout{kind="note" #bad}\n補足。\n:::\n',a('linked')+':::component{name="explanation" #linked answer-to="q1"}\n解答。\n:::\n\n'+q('q1','基本'),q('q1','基本')+q('q1','応用')]){
    const bad=run([{...questions,source}]);assert.equal(bad.options,undefined);assert.ok(bad.diagnostics.length);
  }
});
test('custom question and custom answer resolve target metadata by instance ID rather than template ID',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds};
  const id='component-00000000-0000-4000-8000-000000000001';
  const design={...defaultHeadingDesign(),direction:'column',children:[{id:'answer',type:'dynamic',field:'answer-title',prefix:'',suffix:'',fallback:'なし',width:'fill',fontSize:4000,lineHeight:1.5,color:'#123456'},{id:'content',type:'content'}]};
  const library={schemaVersion:3,entries:[{id,name:'自作',usage:'study',design}]};
  const source=':::component{name="'+id+'" #q1 title="自作問題"}\n問題。\n:::\n\n:::component{name="'+id+'" answer-to="q1"}\n答え。\n:::\n';
  const r=prepareBookBrowserPreview([{documentId:'custom',revision:'1',source,startOn:'page'}],'1','custom-links',{width:100000,height:100000},deps,undefined,undefined,undefined,undefined,undefined,library);
  assert.deepEqual(r.diagnostics,[]);assert.deepEqual(r.options.sections[0].blocks.map(b=>b.component.children[0].text),['なし','自作問題']);
});

test('named study slots preserve independent exact source offsets and reject mismatched schemas',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds};
  const id='component-00000000-0000-4000-8000-000000000001';
  const design={...defaultHeadingDesign(),direction:'column',children:[{id:'content',type:'content'},{id:'hint',type:'slot',name:'hint',width:'fill',fontSize:3500,lineHeight:1.5,color:'#123456',font:{id:'system-monospace',weight:700}}]};
  const library={schemaVersion:3,entries:[{id,name:'自作問題',usage:'study',design}]};
  const source='::::component{name="'+id+'" #q-1}\r\n:::slot{name="hint"}\r\n同じ文章。\r\n:::\r\n\r\n:::slot{name="content"}\r\n同じ文章。\r\n:::\r\n::::\r\n';
  const doc={documentId:'s',revision:'1',source,startOn:'page'},size={width:100000,height:100000};
  const run=(raw,lib=library)=>prepareBookBrowserPreview([{...doc,source:raw}],'1','slots',size,deps,undefined,undefined,undefined,undefined,undefined,lib);
  const r=run(source);assert.deepEqual(r.diagnostics,[]);
  const b=r.options.sections[0].blocks[0];
  assert.equal(b.origin.persistentId,'q-1');assert.equal(b.splitPolicy,'strict');
  assert.equal(b.sourceTextStart,source.lastIndexOf('同じ文章。'));assert.equal(b.namedSlots[0].sourceTextStart,source.indexOf('同じ文章。'));
  assert.equal(b.namedSlots[0].request.text,'同じ文章。');assert.equal(b.namedSlots[0].request.fontFamily,'monospace');
  const one=prepareBrowserPreview(doc,'1','one',size,deps,undefined,library);assert.deepEqual(one.diagnostics,[]);assert.deepEqual(one.options.blocks[0].namedSlots,b.namedSlots);
  for(const bad of [source.replace('name="hint"','name="unknown"'),source.replace('name="hint"','name="content"'),source.replace('同じ文章。\r\n:::','[強調](https://example.invalid)\r\n:::'),':::component{name="'+id+'"}\n本文。\n:::\n'])assert.equal(run(bad).options,undefined,bad);
  assert.equal(run(source,{...library,entries:[{...library.entries[0],design:defaultHeadingDesign()}]}).options,undefined);
});

test('optional study slots may be omitted in implicit or explicit primary-only source',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds};
  const id='component-00000000-0000-4000-8000-000000000001';
  const hint={id:'hint',type:'slot',name:'hint',optional:true,width:'fill',fontSize:3500,lineHeight:1.5,color:'#123456'};
  const group={id:'hint-group',type:'group',direction:'column',width:'fill',padding:2000,gap:1000,background:'#ffffff',showWhenSlot:'hint',children:[hint]};
  const design={...defaultHeadingDesign(),direction:'column',children:[{id:'content',type:'content'},group]};
  const library={schemaVersion:3,entries:[{id,name:'自作問題',usage:'study',design}]};
  const implicit=':::component{name="'+id+'"}\n本文。\n:::\n';
  const explicit='::::component{name="'+id+'"}\n:::slot{name="content"}\n本文。\n:::\n::::\n';
  const complete=explicit.replace('::::\n','\n:::slot{name="hint"}\nヒント。\n:::\n::::\n');
  const run=source=>prepareBookBrowserPreview([{documentId:'s',revision:'1',source,startOn:'page'}],'1','optional',{width:100000,height:100000},deps,undefined,undefined,undefined,undefined,undefined,library);
  for(const source of [implicit,explicit]){
    const result=run(source);assert.deepEqual(result.diagnostics,[]);
    const b=result.options.sections[0].blocks[0];assert.equal(b.namedSlots,undefined);assert.deepEqual(b.component.children.map(n=>n.id),['content']);
    assert.equal(source.slice(b.sourceTextStart,b.sourceTextStart+b.request.text.length),'本文。');
  }
  const result=run(complete);assert.deepEqual(result.diagnostics,[]);
  const b=result.options.sections[0].blocks[0];assert.deepEqual(b.component.children.map(n=>n.id),['content','hint-group']);
  assert.equal(complete.slice(b.namedSlots[0].sourceTextStart,b.namedSlots[0].sourceTextStart+b.namedSlots[0].request.text.length),'ヒント。');
  assert.equal(run(complete.replace('name="hint"','name="other"')).options,undefined);
  assert.equal(run(complete.replace('ヒント。\n','')).options,undefined);
});

test('multiline plain paragraphs and study slots preserve exact CRLF and LF source',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds};
  const id='component-00000000-0000-4000-8000-000000000001';
  const design={...defaultHeadingDesign(),direction:'column',paragraphGap:2500,children:[{id:'content',type:'content'},{id:'hint',type:'slot',name:'hint',width:'fill',fontSize:3500,lineHeight:1.5,color:'#123456',paragraphGap:1200}]};
  const library={schemaVersion:3,entries:[{id,name:'複数段落',usage:'study',design}]};
  const paragraph={...design,gap:0,children:[{id:'content',type:'content'}],paragraphGap:3000};
  const body='本文一行目。\r\n二行目。\r\n\r\n次の段落。',primary='問題文。\r\n\r\n追加説明。',hint='ヒント。\n\n追加ヒント。';
  const source=body+'\r\n\r\n::::component{name="'+id+'"}\r\n:::slot{name="content"}\r\n'+primary+'\r\n:::\r\n\r\n:::slot{name="hint"}\n'+hint+'\n:::\n::::\n';
  const doc={documentId:'s',revision:'1',source,startOn:'page'},size={width:100000,height:100000};
  const result=prepareBookBrowserPreview([doc],'1','multi',size,deps,undefined,undefined,undefined,paragraph,undefined,library);
  assert.deepEqual(result.diagnostics,[]);
  const [b,s]=result.options.sections[0].blocks;
  assert.equal(b.request.text,body);assert.equal(b.request.paragraphGap,3000);assert.equal(b.request.multiline,true);assert.equal(b.splitPolicy,'allow');
  assert.equal(s.request.text,primary);assert.equal(s.request.paragraphGap,2500);assert.equal(s.splitPolicy,'strict');
  assert.equal(s.namedSlots[0].request.text,hint);assert.equal(s.namedSlots[0].request.paragraphGap,1200);assert.equal(s.namedSlots[0].request.multiline,true);
  for(const block of [b,s])assert.equal(source.slice(block.sourceTextStart,block.sourceTextStart+block.request.text.length),block.request.text);
  assert.equal(source.slice(s.namedSlots[0].sourceTextStart,s.namedSlots[0].sourceTextStart+hint.length),hint);
  const one=prepareBrowserPreview(doc,'1','one',size,deps,undefined,library);assert.deepEqual(one.diagnostics,[]);
  assert.equal(one.options.blocks[0].request.text,body);
  for(const raw of [':::callout{kind="note"}\n本文。\n\n[bold](https://example.invalid)\n:::\n','One\n'.repeat(257),'First\rSecond\n'])assert.equal(prepareBrowserPreview({...doc,source:raw},'1','bad',size,deps).options,undefined,raw);
});

test('emphasis in headings, paragraphs and named study slots keeps logical and raw ranges distinct',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds};
  const id='component-00000000-0000-4000-8000-000000000001';
  const design={...defaultHeadingDesign(),direction:'column',children:[{id:'content',type:'content'},{id:'hint',type:'slot',name:'hint',width:'fill',fontSize:3500,lineHeight:1.5,color:'#123456'}]};
  const library={schemaVersion:3,entries:[{id,name:'強調例題',usage:'study',design}]};
  const raw='# **見出し**\r\n\r\nこれは**重要**です。\r\n\r\n*斜体*です。\r\n\r\n::::component{name="'+id+'"}\n:::slot{name="content"}\n**問題文**です。\n:::\n\n:::slot{name="hint"}\n*ヒント*です。\n:::\n::::\n';
  const doc={documentId:'rich',revision:'1',source:raw,startOn:'page'};
  const result=prepareBookBrowserPreview([doc],'1','rich',{width:100000,height:100000},deps,undefined,undefined,undefined,undefined,undefined,library);
  assert.deepEqual(result.diagnostics,[]);
  const [heading,body,study]=result.options.sections[0].blocks;
  assert.equal(heading.request.text,'見出し');assert.equal(body.request.text,'これは重要です。\r\n\r\n斜体です。');
  assert.deepEqual(body.request.inlineStyles,[{start:3,end:5,fontWeight:700},{start:12,end:14,italic:true}]);
  for(const b of [heading,body,study]){
    assert.equal(b.sourceTextStart,undefined);
    const full=previewSourceRange(b,{textStart:0,textEnd:b.request.text.length});
    assert.ok(raw.slice(full.start,full.end).includes('*'));
  }
  const fragment=previewSourceRange(body,{textStart:3,textEnd:5});assert.equal(raw.slice(fragment.start,fragment.end),'**重要**');
  const slot=study.namedSlots[0];assert.equal(slot.request.text,'ヒントです。');assert.equal(slot.sourceTextStart,undefined);
  const slotRange=previewSourceRange(study,{textStart:0,textEnd:3},'hint');
  assert.equal(raw.slice(slotRange.start,slotRange.end),'*ヒント*');
  const one=prepareBrowserPreview(doc,'1','rich',{width:100000,height:100000},deps,undefined,library);
  assert.deepEqual(one.diagnostics,[]);assert.deepEqual(one.options.blocks[1].sourceMap,body.sourceMap);
});

test('local inline format patches use real BCM scanner and preserve logical text and surrounding source',()=>{
  const source='# 見出し\r\n\r\n変数とは値を保存する領域です。\r\n\r\n::::component{name="exercise" #q-1}\r\n:::slot{name="content"}\r\n問題文。\r\n:::\r\n\r\n:::slot{name="hint"}\r\n重要なヒント。\r\n:::\r\n::::\r\n';
  const apply=(s,plan)=>bcm.applyPatches(s,[plan.patch]);
  let start=source.indexOf('値を保存する領域'),end=start+'値を保存する領域'.length;
  const bold=planInlineFormat(source,start,end,'bold',bcm.scanDocument);
  assert.equal(bold.action,'apply');assert.equal(bold.patch.expected,'値を保存する領域');
  const b=apply(source,bold);assert.equal(b,source.replace('値を保存する領域','**値を保存する領域**'));
  const ital=planInlineFormat(b,bold.selection.start,bold.selection.end,'italic',bcm.scanDocument);
  assert.equal(ital.action,'replace');const i=apply(b,ital);assert.equal(i,source.replace('値を保存する領域','*値を保存する領域*'));
  const clear=planInlineFormat(i,ital.selection.start-1,ital.selection.end+1,'italic',bcm.scanDocument);
  assert.equal(clear.action,'remove');assert.equal(apply(i,clear),source);
  for(const target of ['見出し','重要なヒント']){
    const pos=source.indexOf(target),p=planInlineFormat(source,pos,pos+target.length,'bold',bcm.scanDocument);
    assert.equal(apply(source,p),source.replace(target,'**'+target+'**'));
  }
  assert.throws(()=>planInlineFormat(b,bold.selection.start+1,bold.selection.end,'bold',bcm.scanDocument));
  assert.throws(()=>planInlineFormat(source,source.indexOf('exercise'),source.indexOf('exercise')+8,'bold',bcm.scanDocument));
  assert.throws(()=>planInlineFormat(source,source.indexOf('q-1'),source.indexOf('q-1')+3,'bold',bcm.scanDocument));
  assert.throws(()=>planInlineFormat(source,start,source.indexOf('問題文')+3,'bold',bcm.scanDocument));
});
test('formatting refuses protected ranges, ambiguous markup, grapheme splits and empty selections',()=>{
  for(const [raw,word] of [
    ['\x60\x60\x60js\nhello\n\x60\x60\x60\n','hello'],
    ['$$\nhello\n$$\n','hello'],
    ['<!--\nhello\n-->\n','hello'],
    ['- list\nhello\n','hello'],
    ['[hello](target)\n','hello'],
    [':::layout{}\nhello\n:::\n','hello'],
    [':::component{name="exercise"}\nhello\n','hello'],
    ['a **hello** b\n','ell'],
    ['a **hello** b\n','a **hello'],
    ['e\u0301x\n','e'],
    ['hello world\n','hello '],
    ['a,b\n',',']
  ]){
    const at=raw.indexOf(word);assert.throws(()=>planInlineFormat(raw,at,at+word.length,'bold',bcm.scanDocument),undefined,raw);
  }
  assert.throws(()=>planInlineFormat('hello',1,1,'bold',bcm.scanDocument));
});

test('style toolbar planner composes and clears typed attributes while preserving all other source',()=>{
  const original='# 見出し\n\n本文は重要です。\n';
  let raw=original,range={start:raw.indexOf('重要'),end:raw.indexOf('重要')+2};
  function step(format){
    const p=planInlineFormat(raw,range.start,range.end,format,bcm.scanDocument);
    raw=bcm.applyPatches(raw,[p.patch]);range=p.selection;
    assert.equal(raw.slice(range.start,range.end),'重要');
  }
  step('bold');assert.ok(raw.includes('**重要**'));
  step('underline');assert.ok(raw.includes(':style{text="重要" weight="700" underline="true"}'));
  step('italic');step({color:'#abcdef'});step({font:'system-monospace',weight:700});
  const expected=':style{text="重要" weight="700" italic="true" underline="true" color="#abcdef" font="system-monospace"}';
  assert.equal(raw,original.replace('重要',expected));
  const doc={documentId:'s',revision:'1',source:raw,startOn:'page'},deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds};
  const preview=prepareBookBrowserPreview([doc],'1','style',{width:100000,height:100000},deps);
  assert.deepEqual(preview.diagnostics,[]);
  const block=preview.options.sections[0].blocks[1];
  assert.equal(block.request.text,'本文は重要です。');
  assert.deepEqual(block.request.inlineStyles,[{start:3,end:5,fontWeight:700,italic:true,underline:true,color:'#abcdef',fontFamily:'monospace'}]);
  const slice=previewSourceRange(block,{textStart:3,textEnd:5});
  assert.equal(raw.slice(slice.start,slice.end),expected);
  step({color:null});step({font:null});step('italic');step('underline');
  assert.equal(raw,original);
  step('combined');assert.ok(raw.includes('weight="700" italic="true"'));step('combined');assert.equal(raw,original);
  assert.throws(()=>planInlineFormat(raw,range.start,range.end,{font:'file:///tmp/a.ttf'},bcm.scanDocument));
  assert.throws(()=>planInlineFormat('abcdef',1,3,'underline',bcm.scanDocument));
});

test('inline size and baseline editing preserve manuscript and compile into variable metric runs',()=>{
  const original='# 基本\n\nx2 と H2O。重要な語。\n';
  let raw=original;
  function apply(word,format,from=0){
    const start=raw.indexOf(word,from),p=planInlineFormat(raw,start,start+word.length,format,bcm.scanDocument);
    raw=bcm.applyPatches(raw,[p.patch]);
    assert.equal(raw.slice(p.selection.start,p.selection.end),word);
    return p.selection;
  }
  const x=apply('2',{baseline:'super'});
  assert.ok(raw.includes('x^2^'));
  apply('2',{baseline:'sub'},raw.indexOf('H'));
  assert.ok(raw.includes('H~2~O'));
  apply('重要な語',{fontSize:6500});
  apply('重要な語',{baseline:'super'});
  const doc={documentId:'s',revision:'1',source:raw,startOn:'page'},deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds};
  const result=prepareBookBrowserPreview([doc],'1','metrics',{width:100000,height:100000},deps);
  assert.deepEqual(result.diagnostics,[]);
  const block=result.options.sections[0].blocks[1];
  assert.equal(block.request.text,'x2 と H2O。重要な語。');
  assert.deepEqual(block.request.inlineStyles,[{start:1,end:2,baseline:'super'},{start:6,end:7,baseline:'sub'},{start:9,end:13,fontSize:6500,baseline:'super'}]);
  const slice=previewSourceRange(block,{textStart:1,textEnd:2});
  assert.equal(raw.slice(slice.start,slice.end),'^2^');
  apply('重要な語',{fontSize:null});apply('重要な語',{baseline:null});
  apply('2',{baseline:'sub'},raw.indexOf('H'));apply('2',{baseline:'super'});
  assert.equal(raw,original);
});

test('scanner list subset preserves marker-free source ranges, numbering and nesting',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds};
  const source='導入。\r\n\r\n3. **第一項**\r\n   - 子項目\r\n   1. 子番号\r\n   1. 子続き\r\n\r\n1. 第二項\r\n   1. 新しい子\r\n\r\n- 別リスト\r\n+ 次の項目\r\n\r\n結び。\r\n';
  const doc={documentId:'list',revision:'1',source,startOn:'page'};
  const one=prepareBrowserPreview(doc,'1','list',{width:100000,height:70000},deps);
  const book=prepareBookBrowserPreview([doc],'1','list',{width:100000,height:70000},deps);
  assert.deepEqual(one.diagnostics,[]);assert.deepEqual(book.diagnostics,[]);
  for(const blocks of [one.options.blocks,book.options.sections[0].blocks]){
    const list=blocks.filter(b=>b.listItem);
    assert.deepEqual(list.map(b=>[b.listItem.kind,b.listItem.depth,b.listItem.number]),[
      ['ordered',0,3],['bullet',1,undefined],['ordered',1,1],['ordered',1,2],['ordered',0,4],['ordered',1,1],['bullet',0,undefined],['bullet',0,undefined]
    ]);
    assert.deepEqual(blocks.filter(b=>!b.listItem).map(b=>b.request.text),['導入。','結び。']);
    assert.equal(list[0].request.text,'第一項');
    assert.equal(list[0].request.inlineStyles[0].fontWeight,700);
    assert.equal(list[0].sourceTextStart,undefined);
    const span=previewSourceRange(list[0],{textStart:0,textEnd:3});
    assert.equal(source.slice(span.start,span.end),'**第一項**');
    for(const b of list.slice(1)){
      assert.equal(source.slice(b.sourceTextStart,b.sourceTextStart+b.request.text.length),b.request.text);
      assert.equal(b.splitPolicy,'allow');assert.equal(b.component,undefined);
    }
    assert.equal(source.slice(list[0].origin.range.start,list[0].origin.range.end),'3. **第一項**\r\n');
  }
  for(const source of ['  - orphan\n','1. Parent\n  - wrong indent\n','- Parent\n    - deep\n','- Parent\n\n  - loose child\n','- Parent\ncontinuation\n','Paragraph\n- item\n','999. last\n1. overflow\n','- [link](url)\n','- \n']){
    const result=prepareBrowserPreview({...doc,source},'1','bad-list',{width:100000,height:70000},deps);
    assert.equal(result.options,undefined,source);assert.ok(result.diagnostics.length,source);
  }
});

test('isolated line list toolbar preserves exact CRLF source and selection',()=>{
  const source='# 見出し\r\n\r\n**重要**な項目。\r\n\r\n結び。\r\n';
  let raw=source,selection={start:source.indexOf('重要'),end:source.indexOf('重要')+2};
  for(const [kind,marker] of [['bullet','- '],['ordered','1. '],['ordered','']]){
    const plan=planListFormat(raw,selection.start,selection.end,kind,bcm.scanDocument);
    raw=bcm.applyPatches(raw,[plan.patch]);selection=plan.selection;
    assert.equal(raw,source.replace('**重要**',marker+'**重要**'));
    assert.equal(raw.slice(selection.start,selection.end),'重要');
  }
  for(const source of ['- one\n- two\n','- one\n\n- two\n','- one\n  - child\n','one\ntwo\n','    code\n',':::callout{kind="tip"}\none\n:::\n','- [one](url)\n']){
    const word=source.includes('one')?'one':'code',start=source.indexOf(word);
    assert.throws(()=>planListFormat(source,start,start+word.length,'ordered',bcm.scanDocument),RangeError,source);
  }
});

test('list indent and outdent edit only leading whitespace, preserving CRLF and styled body',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds};
  for(const [parent,prefix] of [['- ','  '],['3. ','   ']]){
    const source=parent+'親項目\r\n'+prefix+'- 既存の子\r\n- **重要**な項目\r\n- 次の項目\r\n';
    const start=source.indexOf('重要'),end=start+2;
    const p=planListIndent(source,start,end,'indent',bcm.scanDocument);
    assert.deepEqual(p.patch,{range:{start:source.indexOf('- **'),end:source.indexOf('- **')},expected:'',replacement:prefix});
    const next=bcm.applyPatches(source,[p.patch]);
    assert.equal(next,source.replace('- **',prefix+'- **'));
    assert.equal(next.slice(p.selection.start,p.selection.end),'重要');
    const compiled=prepareBrowserPreview({documentId:'list',revision:'1',source:next,startOn:'page'},'1','indent',{width:100000,height:70000},deps);
    assert.deepEqual(compiled.diagnostics,[]);
    assert.deepEqual(compiled.options.blocks.map(b=>b.listItem.depth),[0,1,1,0]);
    const out=planListIndent(next,p.selection.start,p.selection.end,'outdent',bcm.scanDocument);
    assert.equal(bcm.applyPatches(next,[out.patch]),source);
    assert.deepEqual(out.selection,{start,end});
  }
  for(const [source,word,dir] of [
    ['- one\n- two\n','one','indent'],
    ['- one\n\n- two\n','two','indent'],
    ['- one\n  - two\n','one','indent'],
    ['- one\n  - two\n  - three\n','two','outdent'],
    ['12. one\n- two\n','two','indent'],
    ['- one\n  - two\n','two','indent'],
    ['- one\n- two\n','two','outdent'],
    ['- one\n- two\ncontinuation\n','two','indent'],
    [':::callout{kind="tip"}\n- one\n- two\n:::\n','two','indent']
  ]){
    const start=source.indexOf(word);
    assert.throws(()=>planListIndent(source,start,start+word.length,dir,bcm.scanDocument),RangeError,source);
  }
});

test('batch list formatting converts a whole isolated run, keeps markup and mixed line endings',()=>{
  const source='# 見出し\r\n\r\n**第一項**\r\n第二項\n第三項。\r\n\r\n結び。';
  let raw=source,range={start:raw.indexOf('**第一項**'),end:raw.indexOf('第三項。')+'第三項。'.length};
  const expected=['- **第一項**\r\n- 第二項\n- 第三項。','1. **第一項**\r\n2. 第二項\n3. 第三項。','**第一項**\r\n第二項\n第三項。'];
  for(const [i,kind] of ['bullet','ordered','ordered'].entries()){
    const plan=planListBatch(raw,range.start,range.end,kind,bcm.scanDocument);
    raw=bcm.applyPatches(raw,[plan.patch]);range=plan.selection;
    assert.equal(raw,source.replace('**第一項**\r\n第二項\n第三項。',expected[i]));
    assert.equal(raw.slice(range.start,range.end),expected[i]);
    const p=prepareBrowserPreview({documentId:'batch',revision:'1',source:raw,startOn:'page'},'1','batch',{width:100000,height:70000},{scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds});
    assert.deepEqual(p.diagnostics,[]);
    assert.equal(p.options.blocks.filter(b=>b.listItem).length,i===2?0:3);
  }
  assert.equal(raw,source);
  for(const raw of ['- one\n  - two\n','- one\n+ two\n','one\n\n two\n','one\n- two\n','one\n\`\`\`\ncode\n\`\`\`','- one\n- two\n\n- three\n','one\n[link](url)\n']){
    const end=raw.includes('\n\n- three')?raw.indexOf('\n\n- three'):raw.length;
    assert.throws(()=>planListBatch(raw,0,end,'ordered',bcm.scanDocument),RangeError,raw);
  }
  assert.throws(()=>planListBatch('first\nsecond\nthird',0,12,'bullet',bcm.scanDocument),RangeError);
  assert.throws(()=>planListBatch('first\nsecond',1,12,'bullet',bcm.scanDocument),RangeError);
});


test('BCM display math -> strict engine block and exact formula offsets (LF and CRLF)',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds,validateDisplayMath:engine.parseDisplayMath};
  const size={width:100000,height:70000},formula='  \\frac{a_1^2}{\\sqrt{b}} ';
  for(const nl of ['\n','\r\n']){
    const source=['導入。','','$$ ',formula,'$$','','結び。'].join(nl);
    const doc={documentId:'math',revision:'1',source,startOn:'page'};
    const one=prepareBrowserPreview(doc,'1','math',size,deps);
    const book=prepareBookBrowserPreview([doc],'1','math',size,deps);
    for(const p of [one,book]){
      assert.deepEqual(p.diagnostics,[]);
      const blocks=p.options.blocks??p.options.sections[0].blocks;
      assert.equal(blocks.length,3);
      const math=blocks[1];assert.equal(math.displayMath,true);assert.equal(math.splitPolicy,'strict');
      assert.equal(math.request.text,formula);assert.equal(math.request.inlineStyles,undefined);
      assert.equal(math.component,undefined);assert.equal(math.sourceMap,undefined);
      assert.equal(math.sourceTextStart,source.indexOf(formula));
      assert.equal(source.slice(math.sourceTextStart,math.sourceTextStart+formula.length),formula);
      assert.equal(source.slice(math.origin.range.start,math.origin.range.end),['$$ ',formula,'$$',''].join(nl));
      assert.equal(engine.parsePreviewMath(math.request.text).children[0].kind,'frac');
    }
  }
});
test('display math rejects incomplete fences, unsupported formulas and absent validator',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds,validateDisplayMath:engine.parseDisplayMath};
  const run=(source,d=deps)=>prepareBrowserPreview({documentId:'math',revision:'1',source,startOn:'page'},'1','math',{width:100000,height:70000},d);
  for(const source of ['$$\n\n$$\n','$$\nx+y\n\\input{secret}\n$$\n','$$\nx^2\n','$$\n\\input{secret}\n$$\n','$$\nx^2^3\n$$\n','$$\n'+ 'x'.repeat(2049)+'\n$$\n','$$\rx+1\r$$\r',':::callout{kind="note"}\n$$\n\\input{secret}\n$$\n:::\n']){
    assert.equal(run(source).options,undefined,source);
  }
  assert.equal(run('$$\nx\n$$\n',{...deps,validateDisplayMath:undefined}).options,undefined);
  assert.ok(run('$$\nx\n$$').options);
  // Strict study callouts support display atoms, including when no inline math validator is supplied.
  const callout=run(':::callout{kind="note"}\n$$\nx\n$$\n:::\n');
  assert.deepEqual(callout.diagnostics,[]);
  assert.deepEqual(callout.options.blocks[0].request.inlineMath,[{start:0,formula:'x',display:true}]);
  assert.equal(run(':::callout{kind="note"}\n$$\nx\n$$\n:::\n',{...deps,validateDisplayMath:undefined}).options,undefined);
});


test('GUI math planner inserts at empty line or EOF and preserves surrounding raw source',()=>{
  const plan=(source,start,end,formula)=>planDisplayMath(source,start,end,formula,bcm.scanDocument,engine.parsePreviewMath);
  const formula='\\frac{x_1^2}{b}';
  for(const nl of ['\n','\r\n']){
    const source=['導入。','','結び。',''].join(nl),pos=source.indexOf(nl)+nl.length;
    const p=plan(source,pos,pos,formula),next=bcm.applyPatches(source,[p.patch]);
    assert.equal(p.patch.expected,'');assert.equal(next.slice(p.selection.start,p.selection.end),formula);
    assert.equal(next.slice(0,p.patch.range.start)+next.slice(p.patch.range.start+p.patch.replacement.length),source);
    assert.equal(bcm.scanDocument(next).blocks.filter(b=>b.kind==='math').length,1);
    assert.equal(next.replaceAll(nl,'' ).includes('\n'),false);
    const target=inspectDisplayMath(next,p.selection.start,p.selection.end,bcm.scanDocument);assert.equal(target.mode,'edit');
    const q=plan(next,p.selection.start,p.selection.end,'\\sqrt{x}');
    assert.equal(q.patch.expected,formula);assert.equal(bcm.applyPatches(next,[q.patch]),next.replace(formula,'\\sqrt{x}'));
  }
  for(const source of ['', '日本語。','日本語。\n','日本語。\r\n']){
    const p=plan(source,source.length,source.length,formula),next=bcm.applyPatches(source,[p.patch]);
    assert.ok(next.startsWith(source));assert.equal(next.slice(p.selection.start,p.selection.end),formula);
    assert.equal(bcm.scanDocument(next).blocks.filter(b=>b.kind==='math').length,1);
  }
});
test('GUI math planner refuses protected, ambiguous, unsafe and mixed-ending insertion',()=>{
  const plan=(source,start,end,formula='x^2')=>planDisplayMath(source,start,end,formula,bcm.scanDocument,engine.parsePreviewMath);
  for(const [source,start,end] of [['本文。',1,1],['本文。',0,2],['~~~\n\n~~~\n',4,4],['~~~\n',4,4],['$$\nx\n',5,5],['A\r\nB\n',5,5],[':::callout{kind="note"}\n\n:::\n',24,24]]){
    assert.throws(()=>plan(source,start,end),RangeError,source);
  }
  for(const formula of ['','x\nz','\\input{secret}','x^2^3','x'.repeat(2049)])assert.throws(()=>plan('',0,0,formula),RangeError);
  const source='$$\r\n  x^2 \r\n$$ \r\n';const p=plan(source,5,6,'y');
  assert.equal(bcm.applyPatches(source,[p.patch]),'$$\r\ny\r\n$$ \r\n');
});


test('BCM inline math maps each atom and escaped dollar to exact UTF-16 source envelopes',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds,validateDisplayMath:engine.parseDisplayMath,validateInlineMath:engine.parsePreviewMath};
  const size={width:100000,height:70000},first='$\\frac{a_1^2}{b}$',second='$\\sqrt{x}$',escaped='\\$';
  for(const nl of ['\n','\r\n']){
    const source=['# 見出し','','**係数** '+first+' を使う。','価格は '+escaped+'20。','','次は '+second+' です。',''].join(nl);
    const doc={documentId:'inline',revision:'1',source,startOn:'page'};
    const results=[prepareBrowserPreview(doc,'1','inline',size,deps),prepareBookBrowserPreview([doc],'1','inline',size,deps)];
    for(const p of results){
      assert.deepEqual(p.diagnostics,[]);
      const blocks=p.options.blocks??p.options.sections[0].blocks,body=blocks[1];
      assert.equal(body.request.text,['係数 \uFFFC を使う。','価格は $20。','','次は \uFFFC です。'].join(nl));
      assert.deepEqual(body.request.inlineMath,[{start:3,formula:first.slice(1,-1)},{start:body.request.text.lastIndexOf('\uFFFC'),formula:second.slice(1,-1)}]);
      assert.deepEqual(body.request.inlineStyles,[{start:0,end:2,fontWeight:700}]);
      assert.equal(body.sourceTextStart,undefined);
      for(const [i,atom] of body.request.inlineMath.entries()){
        const range=previewSourceRange(body,{textStart:atom.start,textEnd:atom.start+1});
        assert.equal(source.slice(range.start,range.end),[first,second][i]);
      }
      const dollar=body.request.text.indexOf('$'),range=previewSourceRange(body,{textStart:dollar,textEnd:dollar+1});
      assert.equal(source.slice(range.start,range.end),escaped);
      const full=previewSourceRange(body,{textStart:0,textEnd:body.request.text.length});
      assert.equal(source.slice(full.start,full.end),source.slice(source.indexOf('**係数**')).replace(/(?:\r\n|\n)$/,''));
      assert.equal(p.publicationReady,false);
    }
  }
});
test('BCM inline math refuses invalid delimiters, unsafe commands and unsupported contexts',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds,validateDisplayMath:engine.parseDisplayMath,validateInlineMath:engine.parsePreviewMath};
  const size={width:100000,height:70000};
  const run=(source,d=deps)=>prepareBrowserPreview({documentId:'bad',revision:'1',source,startOn:'page'},'1','inline',size,d);
  for(const source of ['本文 $ x$','本文 $x $','本文 $x$2','本文 $$x$$','本文 $x','本文 $x\n+y$','本文 $\\input{secret}$','本文 $x^2^3$','本文 **$x$**','# 見出し $x$','- 項目 $x$','価格は $20 です。','本文 $x$'+ '$y$']){
    assert.equal(run(source).options,undefined,source);
  }
  assert.equal(run('本文 $x$',{...deps,validateInlineMath:undefined}).options,undefined);
  assert.ok(run('本文 $x$ です。').options);
  assert.ok(run('価格は \\$20。').options);
  const doc={documentId:'frame',revision:'1',source:'本文 $x$ です。',startOn:'page'};
  assert.ok(prepareBookBrowserPreview([doc],'1','frame',size,deps,undefined,undefined,undefined,defaultParagraphDesign()).options);
});


test('GUI inline math inserts and updates exact formula bodies, retaining CRLF and adjacent styles',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds,validateDisplayMath:engine.parseDisplayMath,validateInlineMath:engine.parsePreviewMath};
  for(const nl of ['\n','\r\n']){
    const source=['# 章','','**係数** を使う。','別の式 $y^2$ です。',''].join(nl);
    const at=source.indexOf(' を使う。')+1,formula='\\frac{1}{2}';
    const target=inspectInlineMath(source,at,at,deps);assert.equal(target.mode,'insert');
    const p=planInlineMath(source,at,at,formula,deps),next=bcm.applyPatches(source,[p.patch]);
    assert.equal(next,source.slice(0,at)+'$'+formula+'$'+source.slice(at));
    assert.equal(next.slice(p.selection.start,p.selection.end),formula);
    const selection=inspectInlineMath(next,p.selection.start-1,p.selection.end+1,deps);
    assert.equal(selection.mode,'edit');assert.equal(selection.formula,formula);
    const edit=planInlineMath(next,p.selection.start-1,p.selection.end+1,'\\sqrt{x}',deps);
    assert.equal(edit.patch.expected,formula);
    assert.equal(bcm.applyPatches(next,[edit.patch]),next.replace(formula,'\\sqrt{x}'));
    assert.equal(inspectInlineMath(next,p.selection.start+2,p.selection.start+2,deps).mode,'edit');
  }
  const atEnd='本文。';
  assert.equal(bcm.applyPatches(atEnd,[planInlineMath(atEnd,atEnd.length,atEnd.length,'x^2',deps).patch]),'本文。$x^2$');
});
test('GUI inline math refuses protected ranges, text replacement, unsafe boundaries and invalid formulas',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds,validateDisplayMath:engine.parseDisplayMath,validateInlineMath:engine.parsePreviewMath};
  for(const [source,start,end] of [
    ['# 見出し',3,3],['- 項目',3,3],[':::callout{kind="note"}\n本文。\n:::\n',5,5],
    ['本文。',0,2],['**係数** を使う。',3,3],['A\u0301B',1,1],['本文 20。',3,3],
    ['本文 $x$ です。',5,10],['本文 $x$ です。',3,3],['本文。\n\n結び。',4,4],['$$\nx\n$$\n',3,3],
    ['本文。\n~~~\nx\n~~~\n',1,1],['本文 \\$20。',4,4]
  ])assert.throws(()=>planInlineMath(source,start,end,'x^2',deps),RangeError,source);
  for(const formula of ['',' x','x ','x\ny','x$y','\\input{secret}','x^2^3'])assert.throws(()=>planInlineMath('本文。',1,1,formula,deps),RangeError);
});


test('numbered equations resolve stable IDs and forward/cross-file references in chapter order',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds,validateDisplayMath:engine.parseDisplayMath,validateInlineMath:engine.parsePreviewMath,parseReference:bcm.parseReferenceToken};
  const size={width:100000,height:70000};
  const eq=(id,formula,flag='true')=>':::layout{#'+id+' numbered="'+flag+'"}\n$$\n'+formula+'\n$$\n:::\n';
  const ref=':ref{target="eq-b" format="label-number"}',bare=':ref{target="eq-a" format="number"}';
  const a='# 第一章\n\n後の '+ref+' を参照。\n\n'+eq('eq-a','x^2')+'\n'+eq('eq-skip','y','false')+'\n$$\nz\n$$\n';
  const b='前の '+bare+' を参照。\n\n'+eq('eq-b','\\frac{a}{b}')+'\n'+eq('eq-c','x+1');
  const docs=[{documentId:'a',revision:'1',source:a,startOn:'page'},{documentId:'b',revision:'1',source:b,startOn:'continuous'}];
  const run=(d=docs)=>prepareBookBrowserPreview(d,'1','equations',size,deps);
  const prepared=run();
  assert.deepEqual(prepared.diagnostics,[]);
  const blocks=prepared.options.sections.flatMap(s=>s.blocks).filter(b=>!('kind' in b));
  assert.deepEqual(blocks.filter(b=>b.displayMath).map(b=>b.equationNumber),['1.1',undefined,undefined,'2.1','2.2']);
  assert.equal(blocks.find(b=>b.origin.persistentId==='eq-a').request.text,'x^2');
  const target=blocks.find(b=>b.origin.persistentId==='eq-b');
  assert.equal(b.slice(target.sourceTextStart,target.sourceTextStart+target.request.text.length),'\\frac{a}{b}');
  const paragraph=blocks.find(b=>b.request.text.includes('式 (2.1)'));
  assert.ok(paragraph);assert.equal(paragraph.sourceTextStart,undefined);
  const logical=paragraph.request.text.indexOf('2.1'),range=previewSourceRange(paragraph,{textStart:logical+1,textEnd:logical+2});
  assert.equal(a.slice(range.start,range.end),ref);
  assert.ok(blocks.some(b=>b.request.text==='前の 1.1 を参照。'));
  const moved=run([{...docs[0]},{...docs[1],source:b.replace(eq('eq-b','\\frac{a}{b}')+'\n'+eq('eq-c','x+1'),()=>eq('eq-c','x+1')+'\n'+eq('eq-b','\\frac{a}{b}'))}]);
  assert.deepEqual(moved.diagnostics,[]);
  assert.ok(moved.options.sections[0].blocks.some(b=>b.request?.text.includes('式 (2.2)')));
  assert.equal(prepareBrowserPreview(docs[0],'1','single',size,deps).options,undefined,'cross-file references require book context');
});
test('equation references and wrapper attributes fail closed',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds,validateDisplayMath:engine.parseDisplayMath,validateInlineMath:engine.parsePreviewMath,parseReference:bcm.parseReferenceToken};
  const size={width:100000,height:70000};
  const eq=':::layout{#eq numbered="true"}\n$$\nx^2\n$$\n:::\n';
  const run=source=>prepareBrowserPreview({documentId:'eq',revision:'1',source,startOn:'page'},'1','eq',size,deps);
  for(const source of [
    eq+'\n参照 :ref{target="missing"}。',
    eq.replace('true','false')+'\n参照 :ref{target="eq"}。',
    eq+'\n参照 :ref{target="eq" format="page"}。',
    eq+'\n参照 :ref{target="eq" format="title"}。',
    eq+'\n'+eq,
    eq.replace('numbered="true"','numbered="maybe"'),
    eq.replace('numbered="true"','numbered="true" width="90%"'),
    eq.replace('$$\n:::', '$$\n本文。\n:::'),
    '# 見出し :ref{target="eq"}\n\n'+eq
  ])assert.equal(run(source).options,undefined,source);
  assert.ok(run(eq+'\n参照 :ref{target="eq"}。').options);
});


test('GUI numbered equation insertion and re-edit retain exact ID, fences, and references',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds,validateDisplayMath:engine.parseDisplayMath,validateInlineMath:engine.parsePreviewMath,parseReference:bcm.parseReferenceToken};
  const plan=(source,start,end,formula,id)=>planDisplayMath(source,start,end,formula,bcm.scanDocument,engine.parsePreviewMath,id);
  for(const nl of ['\n','\r\n']){
    const original=['# 章','','参照 :ref{target="eq-editor"}。','','結び。',''].join(nl),pos=original.indexOf(nl)+nl.length;
    const p=plan(original,pos,pos,'x^2','eq-editor'),next=bcm.applyPatches(original,[p.patch]);
    assert.equal(next.slice(0,pos)+next.slice(pos+p.patch.replacement.length),original);
    assert.equal(next.slice(p.selection.start,p.selection.end),'x^2');
    const t=inspectDisplayMath(next,p.selection.start,p.selection.end,bcm.scanDocument);
    assert.equal(t.numbered,true);assert.equal(t.equationId,'eq-editor');
    const q=plan(next,p.selection.start,p.selection.end,'\\frac{a}{b}'),updated=bcm.applyPatches(next,[q.patch]);
    assert.equal(updated,next.slice(0,p.selection.start)+'\\frac{a}{b}'+next.slice(p.selection.end));
    assert.equal(updated.slice(q.selection.start,q.selection.end),'\\frac{a}{b}');
    const prepared=prepareBrowserPreview({documentId:'chapter',revision:'1',source:updated,startOn:'page'},'1','numbered-editor',{width:100000,height:70000},deps);
    assert.deepEqual(prepared.diagnostics,[]);
    assert.equal(prepared.options.blocks.find(b=>b.displayMath).equationNumber,'1.1');
    assert.ok(prepared.options.blocks.some(b=>b.request.text.includes('式 (1.1)')));
    assert.throws(()=>plan(updated,updated.length,updated.length,'y','eq-editor'),RangeError);
    assert.throws(()=>plan(next,p.selection.start,p.selection.end,'y','eq-new'),RangeError);
  }
  const unnumbered=':::layout{#eq-keep numbered="false"}\n$$\nx\n$$\n:::\n';
  const q=plan(unnumbered,unnumbered.indexOf('\nx\n')+1,unnumbered.indexOf('\nx\n')+2,'y');
  assert.equal(bcm.applyPatches(unnumbered,[q.patch]),unnumbered.replace('\nx\n','\ny\n'));
  for(const id of ['','1bad','bad id','x} evil'])assert.throws(()=>plan('',0,0,'x',id),RangeError);
  for(const source of [':::layout{#eq numbered="true" width="90%"}\n$$\nx\n$$\n:::\n',':::layout{#eq numbered="true"}\n$$\nx\n$$\n本文。\n:::\n']){
    const p=source.indexOf('\nx\n')+1;
    assert.throws(()=>plan(source,p,p+1,'y'),RangeError);
  }
});


test('GUI equation reference insertion uses book order, exact patches and stable cross-file targets',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds,validateDisplayMath:engine.parseDisplayMath,validateInlineMath:engine.parsePreviewMath,parseReference:bcm.parseReferenceToken};
  for(const nl of ['\n','\r\n']){
    const source=['# 章','','**係数** と $x$ を参照。',''].join(nl),formula=[':::layout{#eq-next numbered="true"}','$$','x^2','$$',':::',''].join(nl);
    const docs=[{documentId:'a',revision:'1',source,startOn:'page'},{documentId:'b',revision:'1',source:formula,startOn:'page'}];
    assert.deepEqual(equationReferenceTargets(docs,deps),[{id:'eq-next',number:'2.1',documentId:'b',formula:'x^2'}]);
    const p=source.indexOf('を参照'),plan=planEquationReference(docs,'a',p,p,'eq-next','number',deps);
    const next=bcm.applyPatches(source,[plan.patch]),token=':ref{target="eq-next" format="number"}';
    assert.equal(next,source.slice(0,p)+token+source.slice(p));
    assert.equal(next.slice(plan.selection.start,plan.selection.end),token);
    const updated=[{...docs[0],source:next},docs[1]];
    const prepared=prepareBookBrowserPreview(updated,'1','reference-editor',{width:100000,height:70000},deps);
    assert.deepEqual(prepared.diagnostics,[]);
    assert.ok(prepared.options.sections[0].blocks.some(b=>b.request?.text.includes('2.1')));
    const q=planEquationReference(updated,'a',p+token.length,p+token.length,'eq-next','label-number',deps);
    assert.ok(q.patch.replacement.includes('label-number'));
    for(const [start,end,id] of [[source.indexOf('係数')+1,source.indexOf('係数')+1,'eq-next'],[p,p+1,'eq-next'],[p,p,'missing'],[1,1,'eq-next']])assert.throws(()=>planEquationReference(docs,'a',start,end,id,'number',deps),RangeError);
    assert.throws(()=>planEquationReference(updated,'a',p+5,p+5,'eq-next','number',deps),RangeError);
    assert.throws(()=>equationReferenceTargets([...docs,{...docs[1],documentId:'c'}],deps),RangeError);
    assert.deepEqual(equationReferenceTargets([docs[0],{...docs[1],source:formula.replace('true','false')}],deps),[]);
  }
});


test('GUI equation numbering toggles preserve identity and refuse referenced targets across files',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds,validateDisplayMath:engine.parseDisplayMath,validateInlineMath:engine.parsePreviewMath,parseReference:bcm.parseReferenceToken};
  for(const nl of ['\n','\r\n']){
    const source=['# 章','','$$','x^2','$$','','結び。',''].join(nl);
    const doc={documentId:'a',revision:'1',source,startOn:'page'},other={documentId:'b',revision:'1',source:'別の本文。',startOn:'page'};
    const p=source.indexOf('x^2'),plan=planEquationNumbering([doc,other],'a',p,p+3,true,'eq-toggle',deps);
    const numbered=bcm.applyPatches(source,[plan.patch]);
    assert.equal(numbered,source.slice(0,plan.patch.range.start)+[':::layout{#eq-toggle numbered="true"}','$$','x^2','$$',':::',''].join(nl)+source.slice(plan.patch.range.end));
    assert.equal(numbered.slice(plan.selection.start,plan.selection.end),'x^2');
    const updated={...doc,source:numbered};
    const pos=plan.selection.start;
    assert.deepEqual(equationReferenceTargets([updated,other],deps),[{id:'eq-toggle',number:'1.1',documentId:'a',formula:'x^2'}]);
    const ref={...other,source:'参照 :ref{target="eq-toggle"}。'};
    assert.throws(()=>planEquationNumbering([updated,ref],'a',pos,pos+3,false,undefined,deps),RangeError);
    assert.throws(()=>planEquationNumbering([updated,other],'a',pos,pos+3,false,'eq-new',deps),RangeError);
    const off=planEquationNumbering([updated,other],'a',pos,pos+3,false,undefined,deps),disabled=bcm.applyPatches(numbered,[off.patch]);
    assert.equal(disabled,numbered.replace('numbered="true"','numbered="false"'));
    assert.equal(disabled.slice(off.selection.start,off.selection.end),'x^2');
    const on=planEquationNumbering([{...doc,source:disabled},other],'a',off.selection.start,off.selection.end,true,undefined,deps);
    assert.equal(bcm.applyPatches(disabled,[on.patch]),numbered);
    assert.throws(()=>planEquationNumbering([doc,{...other,source:[':::layout{#eq-toggle numbered="true"}','$$','y','$$',':::',''].join(nl)}],'a',p,p+3,true,'eq-toggle',deps),RangeError);
  }
});


test('component inline math keeps independent source envelopes in primary and named text slots',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds,validateDisplayMath:engine.parseDisplayMath,validateInlineMath:engine.parsePreviewMath};
  const size={width:100000,height:70000},id='component-00000000-0000-4000-8000-000000000001';
  const design={...defaultHeadingDesign(),direction:'column',children:[{id:'content',type:'content'},{id:'hint',type:'slot',name:'hint',width:'fill',fontSize:3500,lineHeight:1.5,color:'#123456'}]};
  const library={schemaVersion:3,entries:[{id,name:'数式部品',usage:'study',design}]};
  for(const nl of ['\n','\r\n']){
    const source=['::::component{name="'+id+'"}',':::slot{name="hint"}','ヒント $\\sqrt{x}$ です。',':::','',':::slot{name="content"}','**係数** $\\frac{1}{2}$ です。',':::','::::',''].join(nl);
    const doc={documentId:'slots',revision:'1',source,startOn:'page'};
    for(const p of [prepareBrowserPreview(doc,'1','slots',size,deps,undefined,library),prepareBookBrowserPreview([doc],'1','slots',size,deps,undefined,undefined,undefined,defaultParagraphDesign(),undefined,library)]){
      assert.deepEqual(p.diagnostics,[]);
      const b=(p.options.blocks??p.options.sections[0].blocks)[0],slot=b.namedSlots[0];
      assert.equal(b.request.text,'係数 \uFFFC です。');assert.equal(slot.request.text,'ヒント \uFFFC です。');
      assert.deepEqual(b.request.inlineStyles,[{start:0,end:2,fontWeight:700}]);
      assert.equal(b.sourceTextStart,undefined);assert.equal(slot.sourceTextStart,undefined);
      for(const [req,name,formula] of [[b.request,undefined,'$\\frac{1}{2}$'],[slot.request,'hint','$\\sqrt{x}$']]){
        const atom=req.inlineMath[0],range=previewSourceRange(b,{textStart:atom.start,textEnd:atom.start+1},name);
        assert.equal(source.slice(range.start,range.end),formula);
      }
    }
    const at=source.indexOf('です。')+3,plan=planInlineMath(source,at,at,'x^2',deps);
    const next=bcm.applyPatches(source,[plan.patch]);
    assert.equal(next,source.slice(0,at)+'$x^2$'+source.slice(at));
    const old='$\\sqrt{x}$',start=next.indexOf(old);
    const edit=planInlineMath(next,start,start+old.length,'\\frac{a}{b}',deps);
    assert.equal(bcm.applyPatches(next,[edit.patch]),next.replace(old,()=>'$\\frac{a}{b}$'));
    assert.equal(inspectInlineMath(next,start,start+old.length,deps).paragraph.slot,'hint');
    assert.throws(()=>planInlineMath(source,source.indexOf('name="hint"'),source.indexOf('name="hint"'),'x',deps));
    assert.throws(()=>planInlineMath(source,source.indexOf('**係数**')+3,source.indexOf('**係数**')+3,'x',deps));
  }
});


test('Lab BCM sample conversion is opt-in, bounded, and excludes source mappings',()=>{
  const sample='**係数** $\\frac{1}{2}$ です。';
  assert.deepEqual(previewSampleInline(sample,false,engine.parsePreviewMath),{text:sample});
  assert.deepEqual(previewSampleInline(sample,true,engine.parsePreviewMath),{text:'係数 \uFFFC です。',inlineStyles:[{start:0,end:2,fontWeight:700}],inlineMath:[{start:3,formula:'\\frac{1}{2}'}]});
  assert.throws(()=>previewSampleInline('式 $\\input{secret}$',true,engine.parsePreviewMath),RangeError);
  assert.throws(()=>previewSampleInline('式 $x',true,engine.parsePreviewMath),RangeError);
});


test('component display formulas retain scanner fences, slot-local mapping and exact GUI patches',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds,validateDisplayMath:engine.parseDisplayMath,validateInlineMath:engine.parsePreviewMath};
  const size={width:100000,height:100000},id='component-00000000-0000-4000-8000-000000000001';
  const design={...defaultHeadingDesign(),direction:'column',children:[{id:'content',type:'content'},{id:'hint',type:'slot',name:'hint',width:'fill',fontSize:3500,lineHeight:1.5,color:'#123456'}]};
  const library={schemaVersion:3,entries:[{id,name:'数式部品',usage:'study',design}]};
  for(const nl of ['\n','\r\n']){
    const fence=['$$','\\frac{1}{2}','$$'].join(nl),hintFence=['$$','\\sqrt{x}','$$'].join(nl);
    const source=['::::component{name="'+id+'" #q-math}',':::slot{name="content"}','**問題**。','',fence,'','次の式 $x^2$ です。',':::','',':::slot{name="hint"}','ヒント。','',hintFence,'','結び。',':::','::::',''].join(nl);
    const doc={documentId:'slots',revision:'1',source,startOn:'page'};
    const run=raw=>prepareBookBrowserPreview([{...doc,source:raw}],'1','display-slot',size,deps,undefined,undefined,undefined,undefined,undefined,library);
    const p=run(source);assert.deepEqual(p.diagnostics,[]);
    const block=p.options.sections[0].blocks[0],hint=block.namedSlots[0];
    assert.equal(block.origin.persistentId,'q-math');
    assert.deepEqual(block.request.inlineMath.map(a=>[a.formula,a.display]),[['\\frac{1}{2}',true],['x^2',undefined]]);
    assert.deepEqual(hint.request.inlineMath.map(a=>[a.formula,a.display]),[['\\sqrt{x}',true]]);
    for(const [req,name,raw] of [[block.request,undefined,fence],[hint.request,'hint',hintFence]]){
      const atom=req.inlineMath[0],range=previewSourceRange(block,{textStart:atom.start,textEnd:atom.start+1},name);
      assert.equal(source.slice(range.start,range.end),raw);
    }
    const start=source.indexOf(hintFence),end=start+hintFence.length;
    assert.equal(inspectComponentDisplayMath(source,start,end,deps).slot,'hint');
    const edit=planComponentDisplayMath(source,start,end,'y^2',deps),next=bcm.applyPatches(source,[edit.patch]);
    assert.equal(next,source.replace(hintFence,()=>['$$','y^2','$$'].join(nl)));
    assert.ok(run(next).options);
    assert.throws(()=>planInlineMath(source,start,end,'x',deps),RangeError);
    const insert=source.indexOf('ヒント。')+'ヒント。'.length+nl.length;
    const plan=planComponentDisplayMath(source,insert,insert,'z^2',deps);
    const added=bcm.applyPatches(source,[plan.patch]);
    assert.ok(run(added).options);
    assert.equal(added.slice(plan.selection.start,plan.selection.end),'z^2');
    assert.equal(run(added).options.sections[0].blocks[0].namedSlots[0].request.inlineMath.length,2);
    assert.throws(()=>planComponentDisplayMath(source,source.indexOf('name="hint"'),source.indexOf('name="hint"'),'z',deps),RangeError);
    assert.equal(run(source.replace(hintFence,()=>['$$','x','\\input{secret}','$$'].join(nl))).options,undefined);
    const sample=previewSampleInline(['前。','',fence,'','後。'].join(nl),true,engine.parsePreviewMath,true);
    assert.equal(sample.inlineMath[0].display,true);
    assert.throws(()=>previewSampleInline(fence,true,engine.parsePreviewMath),RangeError);
  }
});


test('extended mathematical grammar integrates with manuscript, GUI patches and Lab samples',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds,validateDisplayMath:engine.parseDisplayMath,validateInlineMath:engine.parsePreviewMath};
  const formula='\\lim_{x\\to0}\\left(\\frac{\\sin x}{x}\\right)';
  const source=['本文 $\\vec{a}\\cdot\\vec{b}$ です。','','$$',formula,'$$',''].join('\n');
  const doc={documentId:'extended',revision:'1',source,startOn:'page'},size={width:100000,height:100000};
  const prepared=prepareBrowserPreview(doc,'1','extended',size,deps);
  assert.deepEqual(prepared.diagnostics,[]);
  assert.equal(prepared.options.blocks[0].request.inlineMath[0].formula,'\\vec{a}\\cdot\\vec{b}');
  assert.equal(prepared.options.blocks[1].request.text,formula);
  const start=source.indexOf(formula),replacement='\\sqrt[3]{x}+\\log_2 x';
  const plan=planDisplayMath(source,start,start+formula.length,replacement,bcm.scanDocument,engine.parsePreviewMath);
  const next=bcm.applyPatches(source,[plan.patch]);
  assert.equal(next,source.replace(formula,()=>replacement));
  assert.ok(prepareBrowserPreview({...doc,source:next},'1','extended',size,deps).options);
  for(const expression of ['\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}','\\begin{cases}x&x\\geq0\\\\-x&x<0\\end{cases}','\\begin{aligned}x&=1\\\\&=2-1\\end{aligned}']){
    const edited=planDisplayMath(source,start,start+formula.length,expression,bcm.scanDocument,engine.parsePreviewMath);
    const raw=bcm.applyPatches(source,[edited.patch]),result=prepareBrowserPreview({...doc,source:raw},'1','table',size,deps);
    assert.equal(raw,source.replace(formula,()=>expression));assert.deepEqual(result.diagnostics,[]);assert.equal(result.options.blocks[1].request.text,expression);
  }
  assert.equal(previewSampleInline('式 $\\sin x$ です。',true,engine.parsePreviewMath).inlineMath[0].formula,'\\sin x');
  assert.throws(()=>planDisplayMath(source,start,start+formula.length,'\\input{secret}',bcm.scanDocument,engine.parsePreviewMath),RangeError);
});


test('math font role propagates independently through single/book preview and named slots',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds,validateDisplayMath:engine.parseDisplayMath,validateInlineMath:engine.parsePreviewMath};
  const id='component-00000000-0000-4000-8000-000000000001',alias='BCFont_'+ 'a'.repeat(64);
  const library={schemaVersion:3,entries:[{id,name:'数式部品',usage:'study',design:{...defaultHeadingDesign(),direction:'column',children:[{id:'content',type:'content'},{id:'hint',type:'slot',name:'hint',width:'fill',fontSize:3500,lineHeight:1.5,color:'#123456',font:{id:'system-monospace',weight:400}}]}}]};
  const source=['# 見出し','','本文 $x^2$ です。','','$$','\\frac{a}{b}','$$','','::::component{name="'+id+'"}',':::slot{name="content"}','問題 $x$ です。',':::','',':::slot{name="hint"}','ヒント $\\sqrt{x}$ です。',':::','::::',''].join('\n');
  const doc={documentId:'font',revision:'1',source,startOn:'page'},size={width:100000,height:100000};
  const typography={body:{fontFamily:'serif',fontWeight:400},heading:{fontFamily:'sans-serif',fontWeight:700},mathFontFamily:alias};
  for(const p of [prepareBrowserPreview(doc,'1','font',size,deps,typography,library),prepareBookBrowserPreview([doc],'1','font',size,deps,typography,undefined,undefined,undefined,undefined,library)]){
    assert.deepEqual(p.diagnostics,[]);const blocks=p.options.blocks??p.options.sections[0].blocks;
    assert.equal(blocks[0].request.mathFontFamily,undefined);
    assert.equal(blocks[0].request.fontFamily,'sans-serif');
    for(const b of blocks.slice(1))assert.equal(b.request.mathFontFamily,alias);
    assert.equal(blocks[1].request.fontFamily,'serif');
    assert.equal(blocks[3].namedSlots[0].request.mathFontFamily,alias);
    assert.equal(blocks[3].namedSlots[0].request.fontFamily,'monospace');
  }
  assert.throws(()=>prepareBrowserPreview(doc,'1','font',size,deps,{...typography,mathFontFamily:'serif'},library),RangeError);
});


test('multiline display formulas retain exact LF/CRLF and numbered or component identities',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds,validateDisplayMath:engine.parseDisplayMath,validateInlineMath:engine.parsePreviewMath,parseReference:bcm.parseReferenceToken};
  const size={width:100000,height:100000};
  const id='component-00000000-0000-4000-8000-000000000001';
  const library={schemaVersion:3,entries:[{id,name:'数式部品',usage:'study',design:{...defaultHeadingDesign(),direction:'column',children:[{id:'content',type:'content'},{id:'hint',type:'slot',name:'hint',width:'fill',fontSize:3500,lineHeight:1.5,color:'#123456'}]}}]};
  const lines=['\\begin{aligned}','  x&=1 \\\\','  &=2-1','\\end{aligned}'],draft=lines.join('\n');
  for(const nl of ['\n','\r\n']){
    const formula=lines.join(nl),fence=['$$',formula,'$$'].join(nl);
    const raw=['# 見出し','',':::layout{#eq-multi numbered="true"}',fence,':::','','式 :ref{target="eq-multi" format="number"}。','','::::component{name="'+id+'"}',':::slot{name="content"}','本文。','',''+fence,'','結び。',':::','',':::slot{name="hint"}','ヒント。','',''+fence,'','後。',':::','::::',''].join(nl);
    const doc={documentId:'multi',revision:'1',source:raw,startOn:'page'};
    const run=source=>prepareBookBrowserPreview([{...doc,source}],'1','multi',size,deps,undefined,undefined,undefined,undefined,undefined,library);
    const p=run(raw);assert.deepEqual(p.diagnostics,[]);
    const blocks=p.options.sections[0].blocks,eq=blocks.find(b=>b.displayMath),study=blocks.find(b=>b.component);
    assert.equal(eq.request.text,formula);assert.equal(eq.equationNumber,'1.1');
    assert.equal(raw.slice(eq.sourceTextStart,eq.sourceTextStart+formula.length),formula);
    for(const [request,name] of [[study.request,undefined],[study.namedSlots[0].request,'hint']]){
      const atom=request.inlineMath[0],range=previewSourceRange(study,{textStart:atom.start,textEnd:atom.start+1},name);
      assert.equal(atom.formula,formula);assert.equal(raw.slice(range.start,range.end),fence);
    }
    const edit=planDisplayMath(raw,eq.sourceTextStart,eq.sourceTextStart+formula.length,draft.replace('x&=1','y&=1'),bcm.scanDocument,engine.parseDisplayMath);
    const changed=bcm.applyPatches(raw,[edit.patch]);assert.equal(changed,raw.replace(formula,()=>formula.replace('x&=1','y&=1')));
    assert.equal(run(changed).options.sections[0].blocks.find(b=>b.displayMath).origin.persistentId,'eq-multi');
    // A component edit uses a manuscript without cross-book references (the current planner scope).
    const componentRaw=raw.slice(raw.indexOf('::::component'));
    const at=componentRaw.lastIndexOf(fence),end=at+fence.length;
    const editSlot=planComponentDisplayMath(componentRaw,at,end,draft.replace('x&=1','z&=1'),deps);
    assert.equal(bcm.applyPatches(componentRaw,[editSlot.patch]),componentRaw.slice(0,at)+fence.replace('x&=1','z&=1')+componentRaw.slice(end));
    const inserted=planDisplayMath('前。'+nl,2+nl.length,2+nl.length,draft,bcm.scanDocument,engine.parseDisplayMath);
    assert.equal(inserted.patch.replacement.includes(formula),true);
    assert.equal(previewSampleInline(fence,true,engine.parsePreviewMath,true,engine.parseDisplayMath).inlineMath[0].formula,formula);
  }
  assert.throws(()=>planInlineMath('本文。',1,1,draft,deps),RangeError);
  assert.throws(()=>planDisplayMath('',0,0,'x\n$$\ny',bcm.scanDocument,engine.parseDisplayMath),RangeError);
});


test('numbered component equations share chapter order, source envelopes and reference targets',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds,validateDisplayMath:engine.parseDisplayMath,validateInlineMath:engine.parsePreviewMath,parseReference:bcm.parseReferenceToken};
  const id='component-00000000-0000-4000-8000-000000000001';
  const library={schemaVersion:3,entries:[{id,name:'数式部品',usage:'study',design:{...defaultHeadingDesign(),direction:'column',children:[{id:'content',type:'content'},{id:'hint',type:'slot',name:'hint',width:'fill',fontSize:3500,lineHeight:1.5,color:'#123456'}]}}]};
  for(const nl of ['\n','\r\n']){
    const wrap=(id,formula,depth=3,numbered=true)=>[':'.repeat(depth)+'layout{#'+id+' numbered="'+numbered+'"}','$$',formula,'$$',':'.repeat(depth)].join(nl);
    const first=wrap('eq-first','x^2'),hint=wrap('eq-hint','y^2'),body=wrap('eq-body','z^2'),off=wrap('eq-off','a',3,false),last=wrap('eq-last','b');
    // Source order, not component visual slot order.
    const source=['# 第一章','',first,'',':::::component{name="'+id+'"}','::::slot{name="hint"}',hint,'::::','','::::slot{name="content"}','本文。','',body,'',off,'::::',':::::','',last,'','式 :ref{target="eq-hint" format="label-number"}。',''].join(nl);
    const doc={documentId:'a',revision:'1',source,startOn:'page'},other={documentId:'b',revision:'1',source:'参照 :ref{target="eq-body" format="number"}。',startOn:'page'};
    const run=(docs)=>prepareBookBrowserPreview(docs,'1','numbered-slot',{width:100000,height:100000},deps,undefined,undefined,undefined,undefined,undefined,library);
    const p=run([doc,other]);assert.deepEqual(p.diagnostics,[]);
    const blocks=p.options.sections[0].blocks,study=blocks.find(b=>b.component);
    assert.equal(blocks.filter(b=>b.displayMath)[0].equationNumber,'1.1');
    assert.equal(blocks.filter(b=>b.displayMath)[1].equationNumber,'1.4');
    assert.deepEqual(study.request.inlineMath.map(a=>a.equationNumber),['1.3',undefined]);
    assert.deepEqual(study.namedSlots[0].request.inlineMath.map(a=>a.equationNumber),['1.2']);
    for(const [req,name,raw] of [[study.request,undefined,body],[study.namedSlots[0].request,'hint',hint]]){
      const a=req.inlineMath[0],range=previewSourceRange(study,{textStart:a.start,textEnd:a.start+1},name);
      assert.equal(source.slice(range.start,range.end),raw);
    }
    assert.equal(blocks.at(-1).request.text,'式 式 (1.2)。');
    assert.equal(p.options.sections[1].blocks[0].request.text,'参照 1.3。');
    assert.deepEqual(equationReferenceTargets([doc,other],deps).map(t=>[t.id,t.number]),[['eq-first','1.1'],['eq-hint','1.2'],['eq-body','1.3'],['eq-last','1.4']]);
    for(const bad of [source.replace('#eq-body','#eq-hint'),source.replace('target="eq-hint"','target="eq-off"'),source.replace('y^2','\\input{secret}'),source.replace('numbered="true"','numbered="maybe"')]){
      assert.equal(run([{...doc,source:bad},other]).options,undefined);
    }
  }
});


test('numbered component display editing preserves wrapper, ID and cross-document references',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds,validateDisplayMath:engine.parseDisplayMath,validateInlineMath:engine.parsePreviewMath,parseReference:bcm.parseReferenceToken};
  for(const nl of ['\n','\r\n']){
    const wrap=[':::layout{#eq-nested numbered="true"}','$$','x^2','$$',':::'].join(nl);
    const source=['# 第一章','','::::callout{kind="note"}','説明。','',wrap,'','結び。','::::','',':ref{target="eq-other" format="number"} を参照。',''].join(nl);
    const doc={documentId:'a',revision:'1',source,startOn:'page'};
    const other={documentId:'b',revision:'1',source:[':::layout{#eq-other numbered="true"}','$$','y^2','$$',':::','',':ref{target="eq-nested" format="label-number"} を参照。',''].join(nl),startOn:'page'};
    const context={documents:[doc,other],documentId:'a'},at=source.indexOf(wrap),end=at+wrap.length;
    assert.throws(()=>inspectComponentDisplayMath(source,at,end,deps),RangeError);
    const target=inspectComponentDisplayMath(source,at,end,deps,context);
    assert.equal(target.formula,'x^2');assert.equal(target.equationId,'eq-nested');assert.equal(target.numbered,true);
    const plan=planComponentDisplayMath(source,at,end,'z^2',deps,context);
    assert.equal(plan.patch.expected,'x^2');assert.equal(plan.patch.replacement,'z^2');
    const next=bcm.applyPatches(source,[plan.patch]);
    assert.equal(next,source.replace('x^2','z^2'));
    assert.equal(next.slice(plan.selection.start,plan.selection.end),'z^2');
    assert.deepEqual(equationReferenceTargets([{...doc,source:next},other],deps),[{id:'eq-nested',number:'1.1',documentId:'a',formula:'z^2'},{id:'eq-other',number:'2.1',documentId:'b',formula:'y^2'}]);
    assert.throws(()=>planComponentDisplayMath(source,at,end,'\\input{secret}',deps,context),RangeError);
    assert.throws(()=>planComponentDisplayMath(source,at,end,'z^2',deps,{...context,documents:[doc,{...other,source:other.source.replace('eq-other','eq-duplicate')}]}),RangeError);
  }
});


test('GUI component numbering widens only necessary fences and refuses referenced removal',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds,validateDisplayMath:engine.parseDisplayMath,validateInlineMath:engine.parsePreviewMath,parseReference:bcm.parseReferenceToken};
  for(const nl of ['\n','\r\n']){
    const bare=['$$','  x^2 ','$$'].join(nl);
    for(const named of [false,true]){
      const id='component-00000000-0000-4000-8000-000000000001';
      const source=(named?['::::component{name="'+id+'"}',':::slot{name="content"}','本文。',':::','',':::slot{name="hint"}',bare,':::','::::','']:[':::callout{kind="note"}','前。','',bare,'','後。',':::','']).join(nl);
      const doc={documentId:'a',revision:'1',source,startOn:'page'},at=source.indexOf(bare),end=at+bare.length;
      const on=planEquationNumbering([doc],'a',at,end,true,'eq-nested-toggle',deps);
      const next=bcm.applyPatches(source,[on.patch]);
      assert.equal(next.slice(on.selection.start,on.selection.end),'  x^2 ');
      assert.deepEqual(equationReferenceTargets([{...doc,source:next}],deps),[{id:'eq-nested-toggle',number:'1.1',documentId:'a',formula:'  x^2 '}]);
      const wrap=[':::layout{#eq-nested-toggle numbered="true"}',bare,':::'].join(nl);
      const expected=(named?[':::::component{name="'+id+'"}',':::slot{name="content"}','本文。',':::','','::::slot{name="hint"}',wrap,'::::',':::::','']:['::::callout{kind="note"}','前。','',wrap,'','後。','::::','']).join(nl);
      assert.equal(next,expected);
      const updated={...doc,source:next},ref={documentId:'b',revision:'1',source:':ref{target="eq-nested-toggle" format="number"} を参照。',startOn:'page'};
      assert.throws(()=>planEquationNumbering([updated,ref],'a',on.selection.start,on.selection.end,false,undefined,deps),/Book validation failed/);
      const off=planEquationNumbering([updated],'a',on.selection.start,on.selection.end,false,undefined,deps);
      const unnumbered=bcm.applyPatches(next,[off.patch]);
      assert.equal(unnumbered,next.replace('numbered="true"','numbered="false"'));
      assert.deepEqual(equationReferenceTargets([{...doc,source:unnumbered}],deps),[]);
      const again=planEquationNumbering([{...doc,source:unnumbered}],'a',off.selection.start,off.selection.end,true,undefined,deps);
      assert.equal(bcm.applyPatches(unnumbered,[again.patch]),next);
      assert.throws(()=>planEquationNumbering([{...doc,source:unnumbered}],'a',off.selection.start,off.selection.end,true,'different-id',deps),RangeError);
    }
  }
});


test('study slots resolve and insert equation references without changing sibling text or math identity',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds,validateDisplayMath:engine.parseDisplayMath,validateInlineMath:engine.parsePreviewMath,parseReference:bcm.parseReferenceToken};
  const id='component-00000000-0000-4000-8000-000000000001';
  const library={schemaVersion:3,entries:[{id,name:'数式部品',usage:'study',design:{...defaultHeadingDesign(),direction:'column',children:[{id:'content',type:'content'},{id:'hint',type:'slot',name:'hint',width:'fill',fontSize:3500,lineHeight:1.5,color:'#123456'}]}}]};
  const size={width:100000,height:100000};
  for(const nl of ['\n','\r\n']){
    const wrap=[':::layout{#eq-local numbered="true"}','$$','x^2','$$',':::'].join(nl);
    const source=['# 第一章','',':::::component{name="'+id+'"}','::::slot{name="hint"}','ヒント。','::::','','::::slot{name="content"}','**説明**。','',wrap,'','式 :ref{target="eq-other" format="number"} を参照。','::::',':::::',''].join(nl);
    const doc={documentId:'a',revision:'1',source,startOn:'page'},other={documentId:'b',revision:'1',source:[':::layout{#eq-other numbered="true"}','$$','y^2','$$',':::',''].join(nl),startOn:'page'};
    const run=raw=>prepareBookBrowserPreview([{...doc,source:raw},other],'1','slot-ref',size,deps,undefined,undefined,undefined,undefined,undefined,library);
    const p=run(source);assert.deepEqual(p.diagnostics,[]);
    const study=p.options.sections[0].blocks.find(b=>b.component);
    assert.ok(study.request.text.includes('式 2.1 を参照。'));
    const at=source.indexOf('ヒント。')+'ヒント'.length;
    const plan=planEquationReference([doc,other],'a',at,at,'eq-local','label-number',deps);
    const token=':ref{target="eq-local" format="label-number"}',next=bcm.applyPatches(source,[plan.patch]);
    assert.equal(next,source.slice(0,at)+token+source.slice(at));
    const q=run(next);assert.deepEqual(q.diagnostics,[]);
    const updated=q.options.sections[0].blocks.find(b=>b.component),hint=updated.namedSlots.find(s=>s.name==='hint');
    assert.equal(hint.request.text,'ヒント式 (1.1)。');
    const pos=hint.request.text.indexOf('式 (1.1)');
    const mapped=previewSourceRange(updated,{textStart:pos,textEnd:pos+'式 (1.1)'.length},'hint');
    assert.equal(next.slice(mapped.start,mapped.end),token);
    assert.deepEqual(updated.request,study.request);
    const primaryAt=next.indexOf('を参照。');
    const primary=planEquationReference([{...doc,source:next},other],'a',primaryAt,primaryAt,'eq-local','number',deps);
    assert.ok(run(bcm.applyPatches(next,[primary.patch])).options);
    for(const bad of [next.indexOf('説明')+1,next.indexOf('x^2')+1,next.indexOf('target="eq-local"')+2,next.indexOf('name="hint"')+2]){
      assert.throws(()=>planEquationReference([{...doc,source:next},other],'a',bad,bad,'eq-other','number',deps),RangeError);
    }
    assert.equal(run(next.replace('target="eq-local"','target="missing"')).options,undefined);
    const fAt=next.indexOf('x^2');
    assert.throws(()=>planEquationNumbering([{...doc,source:next},other],'a',fAt,fAt+3,false,undefined,deps),RangeError);
    const edit=planComponentDisplayMath(next,fAt,fAt+3,'z^2',deps,{documents:[{...doc,source:next},other],documentId:'a'});
    assert.equal(bcm.applyPatches(next,[edit.patch]),next.replace('x^2','z^2'));
  }
});


test('numbered component insertion is atomic and preserves unrelated manuscript source',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds,validateDisplayMath:engine.parseDisplayMath,validateInlineMath:engine.parsePreviewMath,parseReference:bcm.parseReferenceToken};
  for(const nl of ['\n','\r\n'])for(const named of [false,true]){
    const id='component-00000000-0000-4000-8000-000000000001';
    const source=(named?['前文。','','::::component{name="'+id+'"}',':::slot{name="content"}','本文。',':::','',':::slot{name="hint"}','ヒント前。','','ヒント後。',':::','::::','','後文。','']:['前文。','',':::callout{kind="note"}','ヒント前。','','ヒント後。',':::','','後文。','']).join(nl);
    const doc={documentId:'a',revision:'1',source,startOn:'page'};
    const other={documentId:'b',revision:'1',source:[':::layout{#eq-existing numbered="true"}','$$','y^2','$$',':::',''].join(nl),startOn:'page'};
    const at=source.indexOf('ヒント前。'+nl+nl)+'ヒント前。'.length+nl.length;
    const formula='x^2'+nl+'+ 1';
    const plan=planNumberedComponentDisplayMath([doc,other],'a',at,at,formula,'eq-new',deps);
    assert.equal(plan.action,'apply');
    const next=bcm.applyPatches(source,[plan.patch]);
    assert.equal(next.slice(plan.selection.start,plan.selection.end),formula);
    const originalPlain=planComponentDisplayMath(source,at,at,formula,deps,{documents:[doc,other],documentId:'a'});
    const plain=bcm.applyPatches(source,[originalPlain.patch]);
    const toggle=planEquationNumbering([{...doc,source:plain},other],'a',originalPlain.selection.start,originalPlain.selection.end,true,'eq-new',deps);
    assert.equal(next,bcm.applyPatches(plain,[toggle.patch]));
    assert.ok(next.startsWith('前文。'+nl+nl));
    assert.ok(next.endsWith(nl+nl+'後文。'+nl));
    assert.deepEqual(equationReferenceTargets([{...doc,source:next},other],deps),[{id:'eq-new',number:'1.1',documentId:'a',formula},{id:'eq-existing',number:'2.1',documentId:'b',formula:'y^2'}]);
    assert.throws(()=>planNumberedComponentDisplayMath([doc,other],'a',at,at,formula,'eq-existing',deps),RangeError);
    assert.throws(()=>planNumberedComponentDisplayMath([doc,other],'a',at,at,'\\input{secret}','eq-new',deps),RangeError);
    assert.throws(()=>planNumberedComponentDisplayMath([doc,other],'a',at,at,formula,'bad id',deps),RangeError);
    assert.throws(()=>planNumberedComponentDisplayMath([{...doc,source:next},other],'a',plan.selection.start,plan.selection.end,formula,'eq-second',deps),RangeError);
  }
});


test('whole-book inline math and style edits preserve cross-document references and numbered atoms',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds,validateDisplayMath:engine.parseDisplayMath,validateInlineMath:engine.parsePreviewMath,parseReference:bcm.parseReferenceToken};
  const id='component-00000000-0000-4000-8000-000000000001';
  for(const nl of ['\n','\r\n']){
    const token=':ref{target="eq-other" format="label-number"}';
    const source=['# 第一章','','通常文 '+token+' を参照。','',':::::component{name="'+id+'"}','::::slot{name="content"}','本文 '+token+' と $x^2$。','',':::layout{#eq-local numbered="true"}','$$','a^2','$$',':::','::::','','::::slot{name="hint"}','補足 '+token+' を使う。','::::',':::::',''].join(nl);
    const doc={documentId:'a',revision:'1',source,startOn:'page'},other={documentId:'b',revision:'1',source:[':::layout{#eq-other numbered="true"}','$$','y^2','$$',':::','',':ref{target="eq-local" format="number"} を参照。',''].join(nl),startOn:'page'};
    const context={documents:[doc,other],documentId:'a'},styleContext={...context,deps};
    const targets=equationReferenceTargets([doc,other],deps);
    const at=source.indexOf('$x^2$');
    assert.throws(()=>inspectInlineMath(source,at,at+5,deps),RangeError);
    const math=planInlineMath(source,at,at+5,'z^2',deps,context);
    assert.equal(bcm.applyPatches(source,[math.patch]),source.replace('$x^2$','$z^2$'));
    for(const word of ['通常文','本文','補足']){
      const p=source.indexOf(word),q=p+word.length;
      const plan=planInlineMath(source,q,q,'x',deps,context);
      const next=bcm.applyPatches(source,[plan.patch]);
      assert.equal(next,source.slice(0,q)+'$x$'+source.slice(q));
      assert.deepEqual(equationReferenceTargets([{...doc,source:next},other],deps),targets);
      const style=planInlineFormat(source,p,q,'bold',bcm.scanDocument,styleContext);
      const formatted=bcm.applyPatches(source,[style.patch]);
      assert.equal(formatted,source.slice(0,p)+'**'+word+'**'+source.slice(q));
      assert.deepEqual(equationReferenceTargets([{...doc,source:formatted},other],deps),targets);
    }
    const ref=source.indexOf(token);
    for(const [s,e] of [[ref+1,ref+4],[ref,ref+token.length],[at,at+5],[source.indexOf('a^2'),source.indexOf('a^2')+3]]){
      assert.throws(()=>planInlineFormat(source,s,e,'bold',bcm.scanDocument,styleContext),RangeError);
    }
    assert.throws(()=>planInlineMath(source,ref+3,ref+3,'x',deps,context),RangeError);
    const invalid={...context,documents:[doc,{...other,source:other.source.replace('#eq-other','#eq-missing')}]};
    assert.throws(()=>planInlineMath(source,at,at+5,'x',deps,invalid),RangeError);
    assert.throws(()=>planInlineFormat(source,source.indexOf('本文'),source.indexOf('本文')+2,'bold',bcm.scanDocument,{...invalid,deps}),RangeError);
  }
});


test('Component Lab numbered samples share an isolated chapter and local references',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds,validateDisplayMath:engine.parseDisplayMath,validateInlineMath:engine.parsePreviewMath,parseReference:bcm.parseReferenceToken};
  for(const nl of ['\n','\r\n']){
    const wrap=(id,formula,numbered=true)=>[':::layout{#'+id+' numbered="'+numbered+'"}','$$',formula,'$$',':::'].join(nl);
    const token=':ref{target="eq-sample-hint" format="label-number"}';
    const primary=['本文 '+token+'。','',wrap('eq-sample-main','x^2'),''].join(nl);
    const hint=['ヒント。','',wrap('eq-sample-hint','y^2'),'','参照 :ref{target="eq-sample-main" format="number"}。'].join(nl);
    const off=wrap('eq-sample-off','a',false);
    const samples=[{name:'hint',text:hint},{name:'extra',text:off}];
    const result=previewStudySamples(primary,samples,true,deps);
    assert.deepEqual(result.map(s=>s.name),['content','hint','extra']);
    assert.deepEqual(result.map(s=>s.request.inlineMath.map(a=>a.equationNumber)),[['1.1'],['1.2'],[undefined]]);
    assert.ok(result[0].request.text.includes('本文 式 (1.2)。'));
    assert.ok(result[1].request.text.includes('参照 1.1。'));
    assert.ok(result.every(s=>!('sourceMap' in s.request)));
    assert.deepEqual(previewStudySamples(primary,samples,false,deps),[{name:'content',request:{text:primary}},...samples.map(s=>({name:s.name,request:{text:s.text}}))]);
    assert.throws(()=>previewStudySamples(primary,[],true,deps),RangeError);
    assert.throws(()=>previewStudySamples(primary,[{name:'hint',text:hint.replace('#eq-sample-hint','#eq-sample-main')}],true,deps),RangeError);
    assert.throws(()=>previewStudySamples(primary,[{name:'hint',text:hint.replace('y^2','\\input{secret}')}],true,deps),RangeError);
    assert.throws(()=>previewStudySamples(primary,[{name:'hint',text:hint+nl+'::::'+nl+'::::slot{name="unexpected"}'+nl+'Injected'}],true,deps),RangeError);
  }
  const plain=previewStudySamples('本文 $x$。',[{name:'hint',text:'ヒント。'}],true,deps);
  assert.equal(plain[0].request.inlineMath[0].formula,'x');
});


test('three-manuscript textbook regression: numbering, reordering, font roles, source maps and editing',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds,validateDisplayMath:engine.parseDisplayMath,validateInlineMath:engine.parsePreviewMath,parseReference:bcm.parseReferenceToken};
  const library=makeMathLibrary(defaultHeadingDesign);
  const run=docs=>prepareBookBrowserPreview(docs,'1','math-textbook',mathSize,deps,mathTypography,undefined,undefined,undefined,undefined,library);
  for(const nl of ['\n','\r\n']){
    const docs=makeMathTextbook(nl);
    const before=run(docs);assert.deepEqual(before.diagnostics,[]);
    const targets=equationReferenceTargets(docs,deps);
    assert.deepEqual(targets.map(t=>[t.id,t.number]),expectedNumbers);
    const sections=before.options.sections;
    assert.equal(sections.length,3);
    const study=sections[0].blocks.find(b=>b.origin.persistentId==='example-quadratic');
    assert.equal(study.request.mathFontFamily,mathTypography.mathFontFamily);
    assert.equal(study.namedSlots[0].request.mathFontFamily,mathTypography.mathFontFamily);
    assert.deepEqual(study.request.inlineMath.filter(a=>a.display).map(a=>a.equationNumber),['1.3']);
    assert.deepEqual(study.namedSlots[0].request.inlineMath.map(a=>a.equationNumber),['1.2']);
    assert.ok(sections[0].blocks.some(b=>b.request.text.includes('次章の定義は 式 (2.1)')));
    assert.ok(sections[2].blocks.some(b=>b.request.text.includes('式 (2.2)')));
    for(const [request,name,id] of [[study.request,undefined,'eq-factor'],[study.namedSlots[0].request,'hint','eq-discriminant']]){
      const a=request.inlineMath.find(a=>a.display),range=previewSourceRange(study,{textStart:a.start,textEnd:a.start+1},name);
      assert.ok(docs[0].source.slice(range.start,range.end).startsWith(':::layout{#'+id));
    }
    const reordered=[docs[1],docs[0],docs[2]];
    assert.deepEqual(equationReferenceTargets(reordered,deps).map(t=>[t.id,t.number]),[['eq-derivative','1.1'],['eq-aligned','1.2'],['eq-quadratic','2.1'],['eq-discriminant','2.2'],['eq-factor','2.3'],['eq-matrix','3.1']]);
    const reorderedPreview=run(reordered);assert.deepEqual(reorderedPreview.diagnostics,[]);
    assert.ok(reorderedPreview.options.sections[1].blocks.some(b=>b.request.text.includes('次章の定義は 式 (1.1)')));
    const context={documents:docs,documentId:'quadratic'},source=docs[0].source,at=source.indexOf(mathFormulas.factor);
    const edited=planComponentDisplayMath(source,at,at+mathFormulas.factor.length,'(x-3)(x-2)=0',deps,context);
    const next=bcm.applyPatches(source,[edited.patch]);
    assert.equal(next,source.replace(mathFormulas.factor,'(x-3)(x-2)=0'));
    const revised=[{...docs[0],source:next},...docs.slice(1)];
    assert.deepEqual(run(revised).diagnostics,[]);
    assert.deepEqual(equationReferenceTargets(revised,deps).map(t=>[t.id,t.number]),expectedNumbers);
    assert.throws(()=>planEquationNumbering(revised,'quadratic',edited.selection.start,edited.selection.end,false,undefined,deps),RangeError);
    const missing=docs.map(d=>({...d,source:d.source.replace('#eq-derivative','#eq-missing')}));
    assert.equal(run(missing).options,undefined);
    const duplicate=docs.map(d=>({...d,source:d.source.replace('#eq-matrix','#eq-factor')}));
    assert.equal(run(duplicate).options,undefined);
  }
});

test('retained manuscript preparation connects real BCM checkpoints and preserves complete preview',()=>{
  const calls=[];
  const scan=bcm.scanDocument;
  const session=createManuscriptScanSession({scan,scanIncremental:(source,previous)=>{
    const next=bcm.scanDocumentIncremental(source,previous);
    calls.push({source,previous,scanned:next.scannedCharacters});
    return next;
  }});
  const deps={scan,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds,validateDisplayMath:engine.parseDisplayMath,validateInlineMath:engine.parsePreviewMath,parseReference:bcm.parseReferenceToken};
  const before=Array.from({length:100},(_,i)=>'段落'+i+'。本文です。\r\n\r\n').join('');
  const other='別の原稿。\n';
  const docs=(source,revision)=>[{documentId:'a',source,revision,startOn:'page'},{documentId:'b',source:other,revision,startOn:'page'}];
  const run=(source,revision,services)=>prepareBookBrowserPreview(docs(source,revision),revision,'fixture',{width:100000,height:150000},services);
  const retained={...deps,scanSession:session};
  assert.ok(run(before,'1',retained).options);
  const next=before.replace('段落40。','段落40の変更。');
  const actual=run(next,'2',retained);
  assert.ok(actual.options);assert.deepEqual(actual,run(next,'2',deps));
  assert.equal(calls.length,3);
  assert.ok(calls[2].previous);assert.ok(calls[2].scanned<50);
  assert.equal(session.stats().hits,1);
  const broken=next.replace('段落80。','$$\r\n段落80。');
  assert.deepEqual(run(broken,'3',retained),run(broken,'3',deps));
  assert.deepEqual(run(next,'4',retained),run(next,'4',deps));
  session.clear();run(next,'5',retained);
  assert.equal(calls.at(-2).previous,undefined);assert.equal(calls.at(-1).previous,undefined);
});

test('book inline parse session matches full preparation after changed source positions and equation numbering',()=>{
  const deps={scan:bcm.scanDocument,validate:bcm.validateScannedBlocks,index:bcm.indexBlockIds,validateDisplayMath:engine.parseDisplayMath,validateInlineMath:engine.parsePreviewMath,parseReference:bcm.parseReferenceToken};
  const inlineSession=createInlineParseSession(),cached={...deps,inlineSession};
  const size={width:100000,height:160000};
  const make=(prefix,revision)=>[{documentId:'inline-cache',revision,source:[prefix,'','# 見出し','','本文 **強調** と $x^2$。','',':::layout{#eq numbered="true"}','$$','x','$$',':::','','本文 :ref{target="eq" format="number"}。',''].join('\n'),startOn:'page'}];
  for(const [i,prefix] of ['最初。','新しい章。','## 新しい見出し'].entries()){
    const docs=make(prefix,String(i+1));
    const exact=prepareBookBrowserPreview(docs,String(i+1),'cache-parity-'+i,size,deps);
    const warm=prepareBookBrowserPreview(docs,String(i+1),'cache-parity-'+i,size,cached);
    assert.ok(exact.options,JSON.stringify(exact.diagnostics));
    assert.deepEqual(warm,exact);
  }
  assert.ok(inlineSession.stats().hits>0);
  assert.ok(inlineSession.stats().bypasses>0);
});
