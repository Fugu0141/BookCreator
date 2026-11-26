import type {Scan,PreparationDependencies} from './manuscript-poc.js';
type Scanner<S extends Scan>=PreparationDependencies<S>['scan'];
type Validator<S extends Scan>=PreparationDependencies<S>['validate'];
type Diagnostics=ReturnType<Validator<Scan>>['diagnostics'];
type Cached<S extends Scan>={parsed:S;diagnostics:Diagnostics};
type Entry<S extends Scan,H>={source:string;value:Cached<S>;snapshot?:H};
/** Trusted deterministic scanner adapter. Snapshots are opaque, book-owned and
 * never cloned, exposed, or transferred across scanner identities. */
export interface IncrementalManuscriptScanner<S extends Scan,H>{
  scan:Scanner<S>;
  scanIncremental:(source:string,previous?:H)=>{result:S;snapshot?:H};
}
export interface ManuscriptScanSession<S extends Scan>{
  read(documentId:string,source:string,scan:Scanner<S>,validate:Validator<S>):Cached<S>;
  clear():void;
  stats():{entries:number;characters:number;hits:number;misses:number};
}
// Host owns one session per book and supplies deterministic scanner/validator
// services. Exact source equality, not the revision number, authorizes reuse.
// Indexing and semantic/reference interpretation remain current on every call.
export function createManuscriptScanSession<S extends Scan,H=unknown>(incremental?:IncrementalManuscriptScanner<S,H>):ManuscriptScanSession<S>{
  const entries=new Map<string,Entry<S,H>>();
  const fullScan=incremental?.scan,scanIncremental=incremental?.scanIncremental;
  const MAX_ENTRIES=64,MAX_CHARACTERS=250000;
  let characters=0,hits=0,misses=0;
  let scanner:Scanner<S>|undefined,validator:Validator<S>|undefined;
  function drop(id:string){const old=entries.get(id);if(old){entries.delete(id);characters-=old.source.length;}}
  function clear(){entries.clear();characters=0;hits=0;misses=0;scanner=undefined;validator=undefined;}
  return {
    read(id,source,scan,validate){
      if(scanner!==scan||validator!==validate){clear();scanner=scan;validator=validate;}
      const old=entries.get(id);
      if(old?.source===source){
        const value=structuredClone(old.value);
        hits++;entries.delete(id);entries.set(id,old);
        return value;
      }
      misses++;drop(id);
      let result:{result:S;snapshot?:H}|undefined;
      if(scan===fullScan&&scanIncremental&&source.length<=MAX_CHARACTERS){
        // A failed accelerator must not disable the existing full scanner.
        try{const next=scanIncremental(source,old?.snapshot);if(next.result.source===source)result=next;}catch{/* full scan below */}
      }
      const parsed=result?result.result:scan(source),{diagnostics}=validate(parsed);
      if(parsed.source===source&&source.length<=MAX_CHARACTERS){
        // Do not expose or retain caller-owned mutable results. The opaque
        // snapshot is held separately from the structured-cloned scan result.
        try{
          const value=structuredClone({parsed,diagnostics});
          entries.set(id,{source,value,snapshot:result?.snapshot});
          characters+=source.length;
          while(entries.size>MAX_ENTRIES||characters>MAX_CHARACTERS)drop(entries.keys().next().value!);
        }catch{/* non-cloneable extension values use the ordinary scan path */}
      }
      return {parsed,diagnostics};
    },
    clear,
    stats(){return {entries:entries.size,characters,hits,misses};}
  };
}
