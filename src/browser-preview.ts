import {prepareManuscript,type Manuscript,type PreparationDependencies,type Scan} from './manuscript-poc.js';
export function prepareBrowserPreview<S extends Scan>(document:Manuscript,revision:string,fingerprint:string,content:{width:number;height:number},deps:PreparationDependencies<S>){
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
    const offset=item.kind==='heading'?raw.indexOf(item.text):0;
    if(offset<0||raw.slice(offset,offset+item.text.length)!==item.text){reject(item.origin,'Cannot establish exact source mapping');continue;}
    blocks.push({origin:item.origin,request:{text:item.text,width:block.width,fontSize:item.kind==='heading'?6500:4200,fontFamily:'sans-serif' as const,lineHeight:1.8},splitPolicy:block.splitPolicy,
      sourceTextStart:item.origin.range.start+offset,...(block.startPosition?{startPosition:block.startPosition,startPositionSource:block.startPositionSource}:{})});
  }
  if(!blocks.length&&!diagnostics.length)diagnostics.push({code:'BC_PREVIEW_EMPTY',message:'No supported content to preview',documentId:document.documentId,range:{start:0,end:0}});
  if(diagnostics.length)return {diagnostics,publicationReady:false as const};
  return {options:{revision,fingerprint,width:content.width,height:content.height,blocks},diagnostics,publicationReady:false as const};
}
