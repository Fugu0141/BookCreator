import {parsePreviewInline} from './inline-preview.js';
type Parse=typeof parsePreviewInline;
type Result=ReturnType<Parse>;
type Entry={value:Result;cost:number};
export interface InlineParseSession{
  parse:Parse;
  clear():void;
  stats():{entries:number;cost:number;hits:number;misses:number;bypasses:number};
}
/** Book-owned, bounded value cache. Only successful context-independent parses
 * are retained. Reference resolution and scanner-owned equations stay current.
 * Validators must be deterministic; function identity separates their results. */
export function createInlineParseSession():InlineParseSession{
  const entries=new Map<string,Entry>();
  let ids=new WeakMap<Function,number>(),nextId=0,cost=0,hits=0,misses=0,bypasses=0;
  const MAX_ENTRIES=256,MAX_COST=250000;
  function id(fn:Function|undefined){if(!fn)return 0;let value=ids.get(fn);if(value===undefined){value=++nextId;ids.set(fn,value);}return value;}
  function copy(value:Result,offset:number):Result{
    return {text:value.text,inlineStyles:value.inlineStyles.map(s=>({...s})),inlineMath:value.inlineMath.map(m=>({...m})),sourceMap:{length:value.sourceMap.length,segments:value.sourceMap.segments.map(s=>({...s,rawStart:s.rawStart+offset,outerStart:s.outerStart+offset,outerEnd:s.outerEnd+offset}))}};
  }
  const parse:Parse=(raw,offset=0,validateMath,resolveReference,allowDisplay=false,validateDisplayMath=validateMath,componentEquations=[])=>{
    if(typeof raw!=='string'||!raw.length||raw.length>10000||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(offset+raw.length)||raw.includes(':ref{')||componentEquations.length){
      bypasses++;return parsePreviewInline(raw,offset,validateMath,resolveReference,allowDisplay,validateDisplayMath,componentEquations);
    }
    // Validators and display policy are irrelevant when no dollar marker exists.
    const math=raw.includes('$');
    const key=JSON.stringify([raw,math?allowDisplay:false,math?id(validateMath):0,math?id(validateDisplayMath):0]);
    const hit=entries.get(key);
    if(hit){hits++;entries.delete(key);entries.set(key,hit);return copy(hit.value,offset);}
    misses++;
    const value=parsePreviewInline(raw,0,validateMath,undefined,allowDisplay,validateDisplayMath);
    const weight=key.length+value.text.length+value.inlineMath.reduce((n,m)=>n+m.formula.length+32,0)+value.inlineStyles.length*64+value.sourceMap.segments.length*48;
    if(weight<=MAX_COST){
      entries.set(key,{value,cost:weight});cost+=weight;
      while(entries.size>MAX_ENTRIES||cost>MAX_COST){const first=entries.keys().next().value!;cost-=entries.get(first)!.cost;entries.delete(first);}
    }
    return copy(value,offset);
  };
  return {parse,clear(){entries.clear();ids=new WeakMap();nextId=cost=hits=misses=bypasses=0;},stats:()=>({entries:entries.size,cost,hits,misses,bypasses})};
}
