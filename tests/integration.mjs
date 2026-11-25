import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {editDocument,compileMeasuredManuscript,canReviewLayout,prepareBrowserPreview,prepareBookBrowserPreview,defaultHeadingDesign,previewSourceRange,planInlineFormat} from '../dist/index.js';
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
  const source='導入。\r\n\r\n3. **第一項**\r\n  - 子項目\r\n  1. 子番号\r\n  1. 子続き\r\n1. 第二項\r\n  1. 新しい子\r\n\r\n- 別リスト\r\n+ 次の項目\r\n\r\n結び。\r\n';
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
  for(const source of ['  - orphan\n','- Parent\n    - deep\n','- Parent\ncontinuation\n','Paragraph\n- item\n','999. last\n1. overflow\n','- [link](url)\n','- \n']){
    const result=prepareBrowserPreview({...doc,source},'1','bad-list',{width:100000,height:70000},deps);
    assert.equal(result.options,undefined,source);assert.ok(result.diagnostics.length,source);
  }
});
