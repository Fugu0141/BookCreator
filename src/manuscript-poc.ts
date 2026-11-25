// Experimental adapter for a deliberately limited scanner subset, not a full BCM compiler.
type Range={start:number;end:number};
type Directive={kind:'leaf'|'container';name:string;id?:string;attributes:readonly {key:string;value:string}[];range:Range};
type ScanBlock={kind:'raw'|'code'|'math'|'heading'|'blank';range:Range;level?:number}|{kind:'directive';header:Directive;range:Range;children:readonly ScanBlock[];closed:boolean};
interface Scan {source:string;blocks:readonly ScanBlock[];diagnostics:readonly {code:string;range:Range;message:string}[]}
export interface Manuscript {documentId:string;revision:string;source:string;startOn:'page'|'continuous'}
interface Origin {documentId:string;revision:string;blockKey:string;range:Range;persistentId?:string}
export interface SemanticItem {kind:'heading'|'paragraph'|'figure';origin:Origin;text:string;level?:number;attributes?:Readonly<Record<string,string>>}
type MeasuredBlock={kind:'block';origin:Origin;width:number;unitHeights:readonly number[];splitPolicy:'allow'|'strict';startPosition?:'page-top';startPositionSource?:'component'};
type Break={kind:'pagebreak';origin:Origin};
interface Input {schemaVersion:1;revision:string;fingerprint:string;content:{width:number;height:number};sections:{id:string;startOn:'page'|'continuous';blocks:(MeasuredBlock|Break)[]}[]}
interface Issue {code:string;message:string;documentId:string;range:Range}
interface Dependencies<S extends Scan> {
  scan:(source:string)=>S;
  validate:(parsed:S)=>{diagnostics:readonly {code:string;range:Range;message:string}[]};
  index:(docs:readonly {documentId:string;revision:string;parsed:S}[])=>{diagnostics:readonly {code:string;occurrence:{documentId:string;range:Range}}[]};
  // Called with resolved width. Explicit test measurement only.
  measure:(item:SemanticItem,width:number)=>readonly number[];
}
const plain=(s:string)=>/^[\p{L}\p{M}\p{N} .,!?、。・「」『』（）！？　]+$/u.test(s)&&!/^\s|^\d+\.\s/.test(s);
const stripEnd=(s:string)=>s.replace(/(?:\r\n|\r|\n)$/,'');
export function compileMeasuredManuscript<S extends Scan>(documents:readonly Manuscript[],revision:string,fingerprint:string,content:Input['content'],deps:Dependencies<S>):{input?:Input;items:SemanticItem[];diagnostics:Issue[];publicationReady:false} {
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
  const input:Input={schemaVersion:1,revision,fingerprint,content:{...content},sections:[]};
  for(let i=0;i<documents.length;i++){
    const doc=documents[i],scan=parsed[i].parsed;
    if(scan.source!==doc.source)throw new Error('Scanner source mismatch');
    const section:Input['sections'][number]={id:doc.documentId,startOn:doc.startOn,blocks:[]};
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
      const heights=[...deps.measure(item,width)];
      if(!heights.length||heights.some(h=>!Number.isSafeInteger(h)||h<=0))throw new Error('Invalid fixture measurement');
      items.push(item);
      section.blocks.push({kind:'block',origin:item.origin,width,unitHeights:heights,splitPolicy:item.kind==='paragraph'?'allow':'strict',...(item.kind==='heading'&&item.level===1?{startPosition:'page-top' as const,startPositionSource:'component' as const}:{})});
    };
    for(let n=0;n<scan.blocks.length;n++){
      const b=scan.blocks[n],text=stripEnd(doc.source.slice(b.range.start,b.range.end));
      if(b.kind==='blank')continue;
      if(b.kind==='heading'){
        const match=/^ {0,3}(#{1,6})[ \t]+(.+)$/.exec(text);
        if(!match||!plain(match[2])){unsupported(b.range,'Only plain ATX headings supported');continue;}
        emit({kind:'heading',origin:origin(b.range),level:match[1].length,text:match[2]},content.width);
      }else if(b.kind==='raw'){
        const start=b.range.start;let end=b.range.end,lines=[text];
        while(scan.blocks[n+1]?.kind==='raw'){
          const next=scan.blocks[++n];end=next.range.end;lines.push(stripEnd(doc.source.slice(next.range.start,end)));
        }
        if(!lines.every(plain)){unsupported({start,end},'Unsupported Markdown; plain paragraphs only');continue;}
        emit({kind:'paragraph',origin:origin({start,end}),text:lines.join('\n')},content.width);
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
  if(diagnostics.length)return failed();
  return {input,items,diagnostics,publicationReady:false};
}
