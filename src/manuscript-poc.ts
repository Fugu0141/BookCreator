import {parsePreviewInline} from './inline-preview.js';
import {validNamedSlot,type NamedSlotSource} from './preview-component.js';
import {studyKind,customStudyId,type StudyKind} from './study-blocks.js';
// Experimental adapter for a deliberately limited scanner subset, not a full BCM compiler.
type Range={start:number;end:number};
type Directive={kind:'leaf'|'container';name:string;id?:string;attributes:readonly {key:string;value:string}[];range:Range};
type ScanBlock={kind:'raw'|'code'|'math'|'heading'|'blank';range:Range;level?:number}|{kind:'directive';header:Directive;range:Range;children:readonly ScanBlock[];closed:boolean};
export interface Scan {source:string;blocks:readonly ScanBlock[];diagnostics:readonly {code:string;range:Range;message:string}[]}
export interface Manuscript {documentId:string;revision:string;source:string;startOn:'page'|'continuous'}
export interface Origin {documentId:string;revision:string;blockKey:string;range:Range;persistentId?:string}
export type SemanticListItem=({kind:'bullet'}|{kind:'ordered';number:number})&{depth:number};
export interface SemanticItem {kind:'heading'|'paragraph'|'figure'|'study'|'list';listItem?:SemanticListItem;studyKind?:StudyKind;componentId?:string;sourceTextStart?:number;namedSlots?:NamedSlotSource[];origin:Origin;text:string;level?:number;attributes?:Readonly<Record<string,string>>}
type MeasuredBlock={kind:'block';origin:Origin;width:number;unitHeights:readonly number[];splitPolicy:'allow'|'strict';startPosition?:'page-top';startPositionSource?:'component'};
type Break={kind:'pagebreak';origin:Origin};
interface Input {schemaVersion:1;revision:string;fingerprint:string;content:{width:number;height:number};sections:{id:string;startOn:'page'|'continuous';blocks:(MeasuredBlock|Break)[]}[]}
export interface Issue {code:string;message:string;documentId:string;range:Range}
export interface PreparationDependencies<S extends Scan> {
  scan:(source:string)=>S;
  validate:(parsed:S)=>{diagnostics:readonly {code:string;range:Range;message:string}[]};
  index:(docs:readonly {documentId:string;revision:string;parsed:S}[])=>{diagnostics:readonly {code:string;occurrence:{documentId:string;range:Range}}[]};
}
interface Dependencies<S extends Scan> extends PreparationDependencies<S> {
  // Called with resolved width. Explicit test measurement only.
  measure:(item:SemanticItem,width:number)=>readonly number[];
}
type PreparedBlock=Omit<MeasuredBlock,'unitHeights'>&{item:SemanticItem};
type PreparedInput=Omit<Input,'sections'>&{sections:{id:string;startOn:'page'|'continuous';blocks:(PreparedBlock|Break)[]}[]};
const plain=(s:string)=>/^[\p{L}\p{M}\p{N} .,!?、。・「」『』（）！？　]+$/u.test(s)&&!/^\s|^\d+\.\s/.test(s);
const stripEnd=(s:string)=>s.replace(/(?:\r\n|\r|\n)$/,'');
// Keep raw UTF-16 offsets and reject unsupported line content, not just its normalized copy.
const plainBody=(s:string)=>{try{parsePreviewInline(s);return true;}catch{return false;}};
export function prepareManuscript<S extends Scan>(documents:readonly Manuscript[],revision:string,fingerprint:string,content:Input['content'],deps:PreparationDependencies<S>):{input?:PreparedInput;items:SemanticItem[];diagnostics:Issue[];publicationReady:false} {
  const diagnostics:Issue[]=[],items:SemanticItem[]=[];
  const failed=()=>({items:[],diagnostics,publicationReady:false as const});
  const seen=new Set<string>();
  for(const doc of documents){
    if(!doc.documentId||!doc.revision||seen.has(doc.documentId)||!['page','continuous'].includes(doc.startOn))throw new Error('Invalid document identity');
    seen.add(doc.documentId);
  }
  if(!revision||!fingerprint||!Number.isSafeInteger(content.width)||content.width<=0||!Number.isSafeInteger(content.height)||content.height<=0)throw new Error('Invalid fixture input');
  const parsed=documents.map(doc=>({documentId:doc.documentId,revision:doc.revision,parsed:deps.scan(doc.source)}));
  for(const doc of parsed)for(const d of deps.validate(doc.parsed).diagnostics)diagnostics.push({...d,documentId:doc.documentId});
  if(diagnostics.length)return failed();
  for(const d of deps.index(parsed).diagnostics)diagnostics.push({code:d.code,message:'Duplicate block ID',...d.occurrence});
  if(diagnostics.length)return failed();
  const input:PreparedInput={schemaVersion:1,revision,fingerprint,content:{...content},sections:[]};
  for(let i=0;i<documents.length;i++){
    const doc=documents[i],scan=parsed[i].parsed;
    if(scan.source!==doc.source)throw new Error('Scanner source mismatch');
    const section:PreparedInput['sections'][number]={id:doc.documentId,startOn:doc.startOn,blocks:[]};
    const origin=(range:Range,persistentId?:string):Origin=>({documentId:doc.documentId,revision:doc.revision,blockKey:String(range.start),range:{...range},...(persistentId?{persistentId}:{})});
    const unsupported=(range:Range,message:string)=>diagnostics.push({code:'BC_POC_UNSUPPORTED',message,documentId:doc.documentId,range});
    // Check complete top-level source coverage before interpreting any ranges.
    let covered=0;
    for(const b of scan.blocks){
      if(!Number.isSafeInteger(b.range.start)||!Number.isSafeInteger(b.range.end)||b.range.start!==covered||b.range.end<=covered||b.range.end>doc.source.length)throw new Error('Invalid scanner coverage');
      covered=b.range.end;
    }
    if(covered!==doc.source.length)throw new Error('Incomplete scanner coverage');
    const emit=(item:SemanticItem,width:number)=>{
      items.push(item);
      section.blocks.push({kind:'block',origin:item.origin,width,item,splitPolicy:item.kind==='paragraph'||item.kind==='list'?'allow':'strict',...(item.kind==='heading'&&item.level===1?{startPosition:'page-top' as const,startPositionSource:'component' as const}:{})});
    };
    // Restricted scanner-owned list subset: one raw line per item.
    const listLine=(b:ScanBlock|undefined)=>{
      if(b?.kind!=='raw')return;
      const line=stripEnd(doc.source.slice(b.range.start,b.range.end));
      const m=/^( {2})?([-+*]|[1-9][0-9]{0,2}\.) (\S.*)$/.exec(line);
      if(!m)return;
      return {depth:m[1]?1:0,marker:m[2],body:m[3],start:b.range.start+(m[1]?.length??0)+m[2].length+1};
    };
    for(let n=0;n<scan.blocks.length;n++){
      const b=scan.blocks[n],text=stripEnd(doc.source.slice(b.range.start,b.range.end));
      if(b.kind==='blank')continue;
      if(b.kind==='heading'){
        const match=/^ {0,3}(#{1,6})[ \t]+(.+)$/.exec(text);
        if(!match||!plainBody(match[2])){unsupported(b.range,'Only supported inline text in ATX headings');continue;}
        emit({kind:'heading',origin:origin(b.range),level:match[1].length,text:match[2]},content.width);
      }else if(b.kind==='raw'&&listLine(b)){
        const counters:({kind:'bullet'}|{kind:'ordered';number:number}|undefined)[]=[];
        let previousDepth=-1;
        do{
          const entry=scan.blocks[n],line=listLine(entry)!;
          const {depth,marker,body,start}=line;
          if(depth>previousDepth+1||!plainBody(body)){
            unsupported(entry.range,'Unsupported list indentation or inline body');break;
          }
          counters.length=depth+1;
          const prev=counters[depth];
          const kind=marker.endsWith('.')?'ordered':'bullet';
          const number=kind==='ordered'?(prev?.kind==='ordered'?prev.number+1:Number(marker.slice(0,-1))):0;
          if(number>999){unsupported(entry.range,'List numbering exceeds supported range');break;}
          const descriptor=kind==='ordered'?{kind,number} as const:{kind} as const;
          counters[depth]=descriptor;previousDepth=depth;
          emit({kind:'list',origin:origin(entry.range),text:body,sourceTextStart:start,listItem:{...descriptor,depth}},content.width);
          if(!listLine(scan.blocks[n+1]))break;
          n++;
        }while(n<scan.blocks.length);
        if(scan.blocks[n+1]?.kind==='raw'&&!listLine(scan.blocks[n+1]))unsupported(scan.blocks[n+1].range,'List continuation requires an explicit blank line');
      }else if(b.kind==='raw'){
        const start=b.range.start;let end=b.range.end;
        // Blank lines between raw paragraphs belong to this contiguous source run.
        // Do not absorb leading/trailing blank lines at headings or directives.
        while(n+1<scan.blocks.length){
          let j=n+1;while(scan.blocks[j]?.kind==='blank')j++;
          if(scan.blocks[j]?.kind!=='raw')break;
          if(listLine(scan.blocks[j])){
            if(j===n+1)unsupported(scan.blocks[j].range,'List after a paragraph requires a blank line');
            break;
          }
          n=j;end=scan.blocks[n].range.end;
        }
        const body=stripEnd(doc.source.slice(start,end));
        if(!plainBody(body)){unsupported({start,end},'Unsupported Markdown; restricted inline preview subset only');continue;}
        emit({kind:'paragraph',origin:origin({start,end}),text:body},content.width);
      }else if(b.kind==='directive'&&b.closed&&b.header.kind==='container'){
        const h=b.header,attrs=Object.fromEntries(h.attributes.map(a=>[a.key,a.value])),kind=studyKind(h.name,attrs),componentId=customStudyId(h.name,attrs);
        const children=b.children.filter(child=>child.kind!=='blank');
        const readBody=(blocks:readonly ScanBlock[],parent:Range,headerEnd:number)=>{
          const visible=blocks.filter(c=>c.kind!=='blank');
          if(!visible.length||visible.some(c=>c.kind!=='raw'))return;
          const first=visible[0],last=visible.at(-1)!;
          if(first.range.start<headerEnd||last.range.end>parent.end)return;
          const text=stripEnd(doc.source.slice(first.range.start,last.range.end));
          if(!plainBody(text))return;
          return {text,sourceTextStart:first.range.start};
        };
        if(!kind&&!componentId){unsupported(b.range,'Unsupported study container');continue;}
        let primary:{text:string;sourceTextStart:number}|undefined;
        const namedSlots:NamedSlotSource[]=[];
        if(children.length&&children.every(c=>c.kind==='raw'))primary=readBody(b.children,b.range,h.range.end);
        else if(h.name==='component'&&children.length>=1&&children.length<=9){
          const names=new Set<string>();let invalid=false;
          for(const slot of children){
            if(slot.kind!=='directive'||!slot.closed||slot.header.kind!=='container'||slot.header.name!=='slot'||slot.header.id||slot.header.attributes.length!==1||slot.header.attributes[0].key!=='name'||slot.range.start<h.range.end||slot.range.end>b.range.end){invalid=true;break;}
            const name=slot.header.attributes[0].value,source=readBody(slot.children,slot.range,slot.header.range.end);
            if((name!=='content'&&!validNamedSlot(name))||names.has(name)||!source){invalid=true;break;}
            names.add(name);
            if(name==='content')primary=source;else namedSlots.push({name,...source});
          }
          if(invalid)primary=undefined;
        }
        if(!primary){unsupported(b.range,'Expected plain paragraphs or explicit content and named slots containing plain paragraphs');continue;}
        emit({kind:'study',...(kind?{studyKind:kind}:{componentId}),origin:origin(b.range,h.id),...primary,...(namedSlots.length?{namedSlots}:{}),attributes:attrs},content.width);
      }else if(b.kind==='directive'&&b.closed&&b.header.kind==='leaf'){
        const h=b.header, attrs=Object.fromEntries(h.attributes.map(a=>[a.key,a.value]));
        if(h.name==='pagebreak'&&!h.id&&Object.keys(attrs).every(k=>k==='side')&&(attrs.side===undefined||attrs.side==='any')){
          section.blocks.push({kind:'pagebreak',origin:origin(b.range)});
        }else if(h.name==='figure'&&attrs.src?.trim()&&Object.keys(attrs).every(k=>['src','alt','caption','width'].includes(k))&&(!attrs.caption||plain(attrs.caption))){
          const percent=attrs.width===undefined?100:/^\d+(?:\.\d+)?%$/.test(attrs.width)?Number(attrs.width.slice(0,-1)):NaN;
          const width=Math.round(content.width*percent/100);
          if(!(percent>0&&percent<=100&&Number.isSafeInteger(width)&&width>0)){unsupported(b.range,'Unsupported figure width');continue;}
          emit({kind:'figure',origin:origin(b.range,h.id),text:attrs.caption??'',attributes:attrs},width);
        }else unsupported(b.range,'Unsupported directive or attributes');
      }else unsupported(b.range,'Unsupported block type');
    }
    input.sections.push(section);
  }
  // Links refer to persistent instance IDs, never positions or displayed numbers.
  const byId=new Map(items.filter(i=>i.origin.persistentId).map(i=>[i.origin.persistentId!,i]));
  for(const item of items){
    if(item.kind!=='study'||!item.attributes?.['answer-to'])continue;
    const id=item.attributes['answer-to'],target=byId.get(id);
    if(!target||target.kind!=='study'||target.attributes?.['answer-to']||!(target.studyKind==='example'||target.studyKind==='exercise'||target.componentId)){
      diagnostics.push({code:'BC_STUDY_ANSWER_TARGET',message:'Answer target must be an unlinked example, exercise or custom study instance: '+id,documentId:item.origin.documentId,range:item.origin.range});
    }
  }
  if(diagnostics.length)return failed();
  return {input,items,diagnostics,publicationReady:false};
}

export function compileMeasuredManuscript<S extends Scan>(documents:readonly Manuscript[],revision:string,fingerprint:string,content:Input['content'],deps:Dependencies<S>):{input?:Input;items:SemanticItem[];diagnostics:Issue[];publicationReady:false} {
  const prepared=prepareManuscript(documents,revision,fingerprint,content,deps);
  if(!prepared.input)return {items:prepared.items,diagnostics:prepared.diagnostics,publicationReady:false};
  const input:Input={...prepared.input,sections:prepared.input.sections.map(section=>({...section,blocks:section.blocks.map(block=>{
    if(block.kind==='pagebreak')return block;
    const {item,...geometry}=block;
    const heights=[...deps.measure(item,geometry.width)];
    if(!heights.length||heights.some(h=>!Number.isSafeInteger(h)||h<=0))throw Error('Invalid fixture measurement');
    return {...geometry,unitHeights:heights};
  })}))};
  return {...prepared,input};
}
