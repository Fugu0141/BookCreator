import type {Scan,PreparationDependencies} from './manuscript-poc.js';
type Scanner<S extends Scan>=PreparationDependencies<S>['scan'];
type Validator<S extends Scan>=PreparationDependencies<S>['validate'];
type Diagnostics=ReturnType<Validator<Scan>>['diagnostics'];
type Entry<S extends Scan>={source:string;parsed:S;diagnostics:Diagnostics};
export interface ManuscriptScanSession<S extends Scan>{
  read(documentId:string,source:string,scan:Scanner<S>,validate:Validator<S>):{parsed:S;diagnostics:Diagnostics};
  clear():void;
  stats():{entries:number;characters:number;hits:number;misses:number};
}
// Host owns one session per book and supplies deterministic scanner/validator
// services. Exact source equality, not the revision number, authorizes reuse.
// Indexing and semantic/reference interpretation remain current on every call.
export function createManuscriptScanSession<S extends Scan>():ManuscriptScanSession<S>{
  const entries=new Map<string,Entry<S>>();
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
        const {parsed,diagnostics}=structuredClone(old);
        hits++;entries.delete(id);entries.set(id,old);
        return {parsed,diagnostics};
      }
      misses++;drop(id);
      const parsed=scan(source),{diagnostics}=validate(parsed);
      if(parsed.source===source&&source.length<=MAX_CHARACTERS){
        // Do not expose or retain caller-owned mutable objects.
        try{
          entries.set(id,structuredClone({source,parsed,diagnostics}));
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
