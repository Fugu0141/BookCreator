import {parsePreviewInline,inlineSourceRange,type InlineSourceMap} from './inline-preview.js';
import {compileStudyBlock,compileCustomStudyBlock,createStudyNumbering,studyKindName,type StudyNumber,type StudyAnswer} from './study-blocks.js';
import {compileHeadingDesign,compileParagraphDesign,validateHeadingLevels,compileNamedSlotRequests,resolveNamedSlotPresence,multilineTextOptions,type HeadingDesign,type HeadingLevel,type HeadingLevels,type HeadingContext,type StudyDesigns,type ComponentLibrary,validateComponentLibrary} from './preview-component.js';
import {resolvePreviewTypography,type PreviewTypography} from './preview-typography.js';
import {prepareManuscript,type Manuscript,type PreparationDependencies,type Scan,type SemanticItem} from './manuscript-poc.js';
function resolveStudy(item:SemanticItem,body:ReturnType<typeof resolvePreviewTypography>['body'],designs?:StudyDesigns,library?:ComponentLibrary,number?:StudyNumber,answer?:StudyAnswer){
  if(item.componentId){
    const entry=library?.entries.find(e=>e.id===item.componentId);
    if(!entry)throw RangeError('Missing custom study component: '+item.componentId);
    return compileCustomStudyBlock(entry,item.attributes?.title,body,number,answer);
  }
  return compileStudyBlock(item.studyKind!,item.attributes?.title,body,designs?.[item.studyKind!],number,answer);
}
function slotRequests(item:SemanticItem,compiled:ReturnType<typeof compileHeadingDesign>,source:string){
  const slots=item.namedSlots??[];
  for(const s of slots)if(s.sourceTextStart===undefined||source.slice(s.sourceTextStart,s.sourceTextStart+s.text.length)!==s.text)throw RangeError('Cannot establish exact named slot source mapping');
  const resolved=resolveNamedSlotPresence(compiled,slots);
  return {...resolved,namedSlots:resolved.namedSlots.map(slot=>{
    const inline=parsePreviewInline(slot.request.text,slot.sourceTextStart!);
    if(!inline.inlineStyles.length)return {...slot,sourceMap:undefined as InlineSourceMap|undefined};
    return {...slot,sourceTextStart:undefined,sourceMap:inline.sourceMap,request:{...slot.request,text:inline.text,inlineStyles:inline.inlineStyles}};
  })};
}
function primaryInline(text:string,sourceStart:number){
  const inline=parsePreviewInline(text,sourceStart);
  return inline.inlineStyles.length?{requestText:inline.text,inlineStyles:inline.inlineStyles,sourceTextStart:undefined,sourceMap:inline.sourceMap}:{requestText:text,inlineStyles:undefined,sourceTextStart:sourceStart,sourceMap:undefined};
}
/** Host-owned source map; Engine's contiguous sourceSlice is never fabricated for markup. */
export function previewSourceRange(block:{sourceMap?:InlineSourceMap;namedSlots?:readonly {name:string;sourceMap?:InlineSourceMap}[]}|undefined,slice:{textStart:number;textEnd:number;sourceSlice?:{start:number;end:number}},name?:string){
  const map=name===undefined?block?.sourceMap:block?.namedSlots?.find(s=>s.name===name)?.sourceMap;
  return map?inlineSourceRange(map,slice.textStart,slice.textEnd):slice.sourceSlice;
}
// Resolve all occurrence numbers before rendering so forward and cross-file links work.
function indexAnswers(sections:readonly {blocks:readonly ({kind:'block';item:SemanticItem}|{kind:'pagebreak'})[]}[],library?:ComponentLibrary){
  const numbering=createStudyNumbering(),targets=new Map<string,StudyAnswer>();
  for(const section of sections){
    numbering.beginSection();
    for(const block of section.blocks){
      if(block.kind==='pagebreak')continue;
      const item=block.item;
      if(item.kind==='heading')numbering.heading(item.level!);
      if(item.kind!=='study')continue;
      const number=numbering.next(item.componentId??item.studyKind!);
      if(item.origin.persistentId&&!item.attributes?.['answer-to']){
        const entry=item.componentId?library?.entries.find(e=>e.id===item.componentId&&e.usage==='study'):undefined;
        if(item.componentId&&!entry)continue;
        targets.set(item.origin.persistentId,{number,kind:entry?.name??studyKindName(item.studyKind!),title:item.attributes?.title});
      }
    }
  }
  return (item:SemanticItem):StudyAnswer|undefined=>{
    const id=item.attributes?.['answer-to'];
    if(!id)return;
    const target=targets.get(id);
    if(!target)throw RangeError('Cannot resolve answer target: '+id);
    return target;
  };
}
export function prepareBrowserPreview<S extends Scan>(document:Manuscript,revision:string,fingerprint:string,content:{width:number;height:number},deps:PreparationDependencies<S>,typography?:PreviewTypography,library?:ComponentLibrary){
  const fonts=resolvePreviewTypography(typography);
  const catalog=library===undefined?undefined:validateComponentLibrary(library);
  const result=prepareManuscript([document],revision,fingerprint,content,deps);
  const diagnostics=[...result.diagnostics];
  const blocks=[];
  const reject=(origin:{documentId:string;range:{start:number;end:number}},message:string)=>diagnostics.push({code:'BC_PREVIEW_UNSUPPORTED',message,documentId:origin.documentId,range:origin.range});
  if(!result.input)return {diagnostics,publicationReady:false as const};
  const answerFor=indexAnswers(result.input.sections,catalog);
  const numbering=createStudyNumbering();numbering.beginSection();
  for(const block of result.input.sections[0].blocks){
    if(block.kind==='pagebreak'){reject(block.origin,'Manual pagebreak not yet supported by the browser preview');continue;}
    const {item}=block;
    if(item.kind==='figure'||(item.kind==='heading'&&/[\r\n]/.test(item.text))){reject(item.origin,'Only contiguous plain source paragraphs and ATX headings are supported');continue;}
    const raw=document.source.slice(item.origin.range.start,item.origin.range.end);
    const offset=(item.kind==='study'||item.kind==='list'||item.kind==='math')?item.sourceTextStart!-item.origin.range.start:item.kind==='heading'?raw.indexOf(item.text):0;
    if(offset<0||raw.slice(offset,offset+item.text.length)!==item.text){reject(item.origin,'Cannot establish exact source mapping');continue;}
    if(item.kind==='heading')numbering.heading(item.level!);
    let study:ReturnType<typeof compileStudyBlock>|undefined,namedSlots:ReturnType<typeof slotRequests>['namedSlots']=[];
    if(item.kind==='study')try{study=resolveStudy(item,fonts.body,undefined,catalog,numbering.next(item.componentId??item.studyKind!),answerFor(item));const resolved=slotRequests(item,study,document.source);study={...study,component:resolved.component};namedSlots=resolved.namedSlots;}catch(e){reject(item.origin,String(e instanceof Error?e.message:e));continue;}
    const inline=item.kind==='math'?{requestText:item.text,inlineStyles:undefined,sourceTextStart:item.sourceTextStart,sourceMap:undefined}:primaryInline(item.text,item.origin.range.start+offset);
    blocks.push({origin:item.origin,request:{text:inline.requestText,...(inline.inlineStyles?{inlineStyles:inline.inlineStyles}:{}),width:block.width,fontSize:study?.fontSize??(item.kind==='heading'?6500:4200),...(study?.textStyle??(item.kind==='heading'?fonts.heading:fonts.body)),lineHeight:study?.lineHeight??1.8,...(item.kind==='math'?{}:multilineTextOptions(item.text,study?.paragraphGap))},splitPolicy:block.splitPolicy,...(item.kind==='math'?{displayMath:true as const}:{}),...(item.listItem?{listItem:{...item.listItem,indentStep:5000,markerWidth:14000,gap:2000}}:{}),...(study?{component:study.component}:{}),...(namedSlots.length?{namedSlots}:{}),
      sourceTextStart:inline.sourceTextStart,sourceMap:inline.sourceMap,...(block.startPosition?{startPosition:block.startPosition,startPositionSource:block.startPositionSource}:{})});
  }
  if(!blocks.length&&!diagnostics.length)diagnostics.push({code:'BC_PREVIEW_EMPTY',message:'No supported content to preview',documentId:document.documentId,range:{start:0,end:0}});
  if(diagnostics.length)return {diagnostics,publicationReady:false as const};
  return {options:{revision,fingerprint,width:content.width,height:content.height,blocks},diagnostics,publicationReady:false as const};
}

/** Whole-book PoC; preserve section ordering, explicit breaks and exact source ranges. */
export function prepareBookBrowserPreview<S extends Scan>(documents:readonly Manuscript[],revision:string,fingerprint:string,content:{width:number;height:number},deps:PreparationDependencies<S>,typography?:PreviewTypography,headingDesign?:HeadingDesign|null,headingLevels?:HeadingLevels,paragraphDesign?:HeadingDesign|null,studyDesigns?:StudyDesigns,library?:ComponentLibrary){
  const fonts=resolvePreviewTypography(typography);
  const catalog=library===undefined?undefined:validateComponentLibrary(library);
  const levels=validateHeadingLevels(headingLevels??{});
  const paragraph=paragraphDesign?compileParagraphDesign(paragraphDesign,fonts.body):undefined;
  const prepared=prepareManuscript(documents,revision,fingerprint,content,deps),diagnostics=[...prepared.diagnostics];
  if(!prepared.input)return {diagnostics,publicationReady:false as const};
  const answerFor=indexAnswers(prepared.input.sections,catalog);
  const byId=new Map(documents.map(d=>[d.documentId,d]));
  let chapter=0;
  const numbering=createStudyNumbering();
  const sections=prepared.input.sections.map(section=>{
    numbering.beginSection();
    let active=false,chapterTitle:string|undefined;
    const counters=[0,0,0,0,0,0];
    const blocks:(NonNullable<ReturnType<typeof prepareBrowserPreview<S>>['options']>['blocks'][number] & {component?:ReturnType<typeof compileHeadingDesign>['component']} | Extract<typeof section.blocks[number],{kind:'pagebreak'}>)[]=[];
    for(const block of section.blocks){
      if(block.kind==='pagebreak'){blocks.push(block);continue;}
      const {item}=block;
      const raw=byId.get(item.origin.documentId)!.source.slice(item.origin.range.start,item.origin.range.end);
      const offset=(item.kind==='study'||item.kind==='list'||item.kind==='math')?item.sourceTextStart!-item.origin.range.start:item.kind==='heading'?raw.indexOf(item.text):0;
      if(item.kind==='figure'||(item.kind==='heading'&&/[\r\n]/.test(item.text))||offset<0||raw.slice(offset,offset+item.text.length)!==item.text){
        diagnostics.push({code:'BC_PREVIEW_UNSUPPORTED',message:'Only contiguous plain paragraphs and headings are supported',documentId:item.origin.documentId,range:item.origin.range});continue;
      }
      let design:ReturnType<typeof compileHeadingDesign>|undefined=item.kind==='paragraph'?paragraph:undefined;
      let namedSlots:ReturnType<typeof slotRequests>['namedSlots']=[];
      if(item.kind==='study')try{
        const number=numbering.next(item.componentId??item.studyKind!);
        if(!active){chapter=number.chapter;active=true;chapterTitle=undefined;counters.fill(0);counters[0]=chapter;}
        design=resolveStudy(item,fonts.body,studyDesigns,catalog,number,answerFor(item));
        const resolved=slotRequests(item,design,byId.get(item.origin.documentId)!.source);design={...design,component:resolved.component};namedSlots=resolved.namedSlots;
      }catch(e){diagnostics.push({code:'BC_PREVIEW_COMPONENT',message:String(e instanceof Error?e.message:e),documentId:item.origin.documentId,range:item.origin.range});continue;}
      const inline=item.kind==='math'?{requestText:item.text,inlineStyles:undefined,sourceTextStart:item.sourceTextStart,sourceMap:undefined}:primaryInline(item.text,item.origin.range.start+offset);
      if(item.kind==='heading'){
        const level=item.level!;
        const numberedChapter=numbering.heading(level);
        if(level===1||!active){chapter=numberedChapter;active=true;chapterTitle=level===1?inline.requestText:undefined;counters.fill(0);counters[0]=chapter;}
        if(level>1){counters[level-1]++;counters.fill(0,level);}
        const context:HeadingContext={'chapter-number':String(chapter),'chapter-title':chapterTitle,'heading-number':counters.slice(0,level).join('.'),'heading-title':inline.requestText,'heading-level':String(level)};
        const definition=levels[String(level) as HeadingLevel]??headingDesign;
        if(definition)try{design=compileHeadingDesign(definition,fonts.heading,context);}catch(e){
          diagnostics.push({code:'BC_PREVIEW_COMPONENT',message:String(e instanceof Error?e.message:e),documentId:item.origin.documentId,range:item.origin.range});continue;
        }
      }
      blocks.push({origin:item.origin,request:{text:inline.requestText,...(inline.inlineStyles?{inlineStyles:inline.inlineStyles}:{}),width:block.width,fontSize:design?.fontSize??(item.kind==='heading'?6500:4200),...(design?.textStyle??(item.kind==='heading'?fonts.heading:fonts.body)),lineHeight:design?.lineHeight??1.8,...(item.kind==='math'?{}:multilineTextOptions(item.text,design?.paragraphGap))},splitPolicy:block.splitPolicy,...(item.kind==='math'?{displayMath:true as const}:{}),...(item.listItem?{listItem:{...item.listItem,indentStep:5000,markerWidth:14000,gap:2000}}:{}),...(design?{component:design.component}:{}),...(namedSlots.length?{namedSlots}:{}),sourceTextStart:inline.sourceTextStart,sourceMap:inline.sourceMap,...(block.startPosition?{startPosition:block.startPosition,startPositionSource:block.startPositionSource}:{})});
    }
    return {id:section.id,startOn:section.startOn,blocks};
  });
  if(!sections.some(s=>s.blocks.some(b=>!('kind' in b))))diagnostics.push({code:'BC_PREVIEW_EMPTY',message:'No supported content to preview',documentId:documents[0]?.documentId??'',range:{start:0,end:0}});
  if(diagnostics.length)return {diagnostics,publicationReady:false as const};
  return {options:{revision,fingerprint,width:content.width,height:content.height,sections},diagnostics,publicationReady:false as const};
}
