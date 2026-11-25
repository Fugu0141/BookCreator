import {compileStudyBlock} from './study-blocks.js';
import {compileHeadingDesign,compileParagraphDesign,validateHeadingLevels,type HeadingDesign,type HeadingLevel,type HeadingLevels,type HeadingContext} from './preview-component.js';
import {resolvePreviewTypography,type PreviewTypography} from './preview-typography.js';
import {prepareManuscript,type Manuscript,type PreparationDependencies,type Scan} from './manuscript-poc.js';
export function prepareBrowserPreview<S extends Scan>(document:Manuscript,revision:string,fingerprint:string,content:{width:number;height:number},deps:PreparationDependencies<S>,typography?:PreviewTypography){
  const fonts=resolvePreviewTypography(typography);
  const result=prepareManuscript([document],revision,fingerprint,content,deps);
  const diagnostics=[...result.diagnostics];
  const blocks=[];
  const reject=(origin:{documentId:string;range:{start:number;end:number}},message:string)=>diagnostics.push({code:'BC_PREVIEW_UNSUPPORTED',message,documentId:origin.documentId,range:origin.range});
  if(!result.input)return {diagnostics,publicationReady:false as const};
  for(const block of result.input.sections[0].blocks){
    if(block.kind==='pagebreak'){reject(block.origin,'Manual pagebreak not yet supported by the browser preview');continue;}
    const {item}=block;
    if(item.kind==='figure'||/[\r\n]/.test(item.text)){reject(item.origin,'Only contiguous single-line source paragraphs and ATX headings are supported');continue;}
    const raw=document.source.slice(item.origin.range.start,item.origin.range.end);
    const offset=item.kind==='study'?item.sourceTextStart!-item.origin.range.start:item.kind==='heading'?raw.indexOf(item.text):0;
    if(offset<0||raw.slice(offset,offset+item.text.length)!==item.text){reject(item.origin,'Cannot establish exact source mapping');continue;}
    const study=item.kind==='study'?compileStudyBlock(item.studyKind!,item.attributes?.title,fonts.body):undefined;
    blocks.push({origin:item.origin,request:{text:item.text,width:block.width,fontSize:study?.fontSize??(item.kind==='heading'?6500:4200),...(study?.textStyle??(item.kind==='heading'?fonts.heading:fonts.body)),lineHeight:study?.lineHeight??1.8},splitPolicy:block.splitPolicy,...(study?{component:study.component}:{}),
      sourceTextStart:item.origin.range.start+offset,...(block.startPosition?{startPosition:block.startPosition,startPositionSource:block.startPositionSource}:{})});
  }
  if(!blocks.length&&!diagnostics.length)diagnostics.push({code:'BC_PREVIEW_EMPTY',message:'No supported content to preview',documentId:document.documentId,range:{start:0,end:0}});
  if(diagnostics.length)return {diagnostics,publicationReady:false as const};
  return {options:{revision,fingerprint,width:content.width,height:content.height,blocks},diagnostics,publicationReady:false as const};
}

/** Whole-book PoC; preserve section ordering, explicit breaks and exact source ranges. */
export function prepareBookBrowserPreview<S extends Scan>(documents:readonly Manuscript[],revision:string,fingerprint:string,content:{width:number;height:number},deps:PreparationDependencies<S>,typography?:PreviewTypography,headingDesign?:HeadingDesign|null,headingLevels?:HeadingLevels,paragraphDesign?:HeadingDesign|null){
  const fonts=resolvePreviewTypography(typography);
  const levels=validateHeadingLevels(headingLevels??{});
  const paragraph=paragraphDesign?compileParagraphDesign(paragraphDesign,fonts.body):undefined;
  const prepared=prepareManuscript(documents,revision,fingerprint,content,deps),diagnostics=[...prepared.diagnostics];
  if(!prepared.input)return {diagnostics,publicationReady:false as const};
  const byId=new Map(documents.map(d=>[d.documentId,d]));
  let chapter=0; // Global ordered H1 sequence; a file's headings preceding its first H1 get an implicit chapter.
  const sections=prepared.input.sections.map(section=>{
    let active=false,chapterTitle:string|undefined;
    const counters=[0,0,0,0,0,0];
    const blocks:(NonNullable<ReturnType<typeof prepareBrowserPreview<S>>['options']>['blocks'][number] & {component?:ReturnType<typeof compileHeadingDesign>['component']} | Extract<typeof section.blocks[number],{kind:'pagebreak'}>)[]=[];
    for(const block of section.blocks){
      if(block.kind==='pagebreak'){blocks.push(block);continue;}
      const {item}=block;
      const raw=byId.get(item.origin.documentId)!.source.slice(item.origin.range.start,item.origin.range.end);
      const offset=item.kind==='study'?item.sourceTextStart!-item.origin.range.start:item.kind==='heading'?raw.indexOf(item.text):0;
      if(item.kind==='figure'||/[\r\n]/.test(item.text)||offset<0||raw.slice(offset,offset+item.text.length)!==item.text){
        diagnostics.push({code:'BC_PREVIEW_UNSUPPORTED',message:'Only contiguous plain paragraphs and headings are supported',documentId:item.origin.documentId,range:item.origin.range});continue;
      }
      let design:ReturnType<typeof compileHeadingDesign>|undefined=item.kind==='paragraph'?paragraph:undefined;
      if(item.kind==='study')design=compileStudyBlock(item.studyKind!,item.attributes?.title,fonts.body);
      if(item.kind==='heading'){
        const level=item.level!;
        if(level===1||!active){chapter++;active=true;chapterTitle=level===1?item.text:undefined;counters.fill(0);counters[0]=chapter;}
        if(level>1){counters[level-1]++;counters.fill(0,level);}
        const context:HeadingContext={'chapter-number':String(chapter),'chapter-title':chapterTitle,'heading-number':counters.slice(0,level).join('.'),'heading-title':item.text,'heading-level':String(level)};
        const definition=levels[String(level) as HeadingLevel]??headingDesign;
        if(definition)try{design=compileHeadingDesign(definition,fonts.heading,context);}catch(e){
          diagnostics.push({code:'BC_PREVIEW_COMPONENT',message:String(e instanceof Error?e.message:e),documentId:item.origin.documentId,range:item.origin.range});continue;
        }
      }
      blocks.push({origin:item.origin,request:{text:item.text,width:block.width,fontSize:design?.fontSize??(item.kind==='heading'?6500:4200),...(design?.textStyle??(item.kind==='heading'?fonts.heading:fonts.body)),lineHeight:design?.lineHeight??1.8},splitPolicy:block.splitPolicy,...(design?{component:design.component}:{}),sourceTextStart:item.origin.range.start+offset,...(block.startPosition?{startPosition:block.startPosition,startPositionSource:block.startPositionSource}:{})});
    }
    return {id:section.id,startOn:section.startOn,blocks};
  });
  if(!sections.some(s=>s.blocks.some(b=>!('kind' in b))))diagnostics.push({code:'BC_PREVIEW_EMPTY',message:'No supported content to preview',documentId:documents[0]?.documentId??'',range:{start:0,end:0}});
  if(diagnostics.length)return {diagnostics,publicationReady:false as const};
  return {options:{revision,fingerprint,width:content.width,height:content.height,sections},diagnostics,publicationReady:false as const};
}
