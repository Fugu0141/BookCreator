import {prepareLayoutOptions} from './layout-input.mjs';
// Only the preparation fields cross the worker boundary. File paths, saved
// settings, renderer font handles, recovery tokens, DOM and IPC stay outside.
export function preparationPayload(input,documents){
  const {whole,needsContext,file,theme,rev,fingerprint,geometry,typography}=input;
  return {input:{whole,needsContext,file:file?{id:file.id}:undefined,theme:theme?{
    studyResourceErrors:theme.studyResourceErrors,headingDesign:theme.headingDesign,
    headingLevels:theme.headingLevels,paragraphDesign:theme.paragraphDesign,
    studyDesigns:theme.studyDesigns,library:theme.library
  }:undefined,rev,fingerprint,geometry:{content:geometry.content},typography},
    documents:documents.map(({documentId,revision,source,startOn})=>({documentId,revision,source,startOn}))};
}
// The caller owns the worker/session lifetime. Each request uses current source
// and numbering, with optional bounded caches only for deterministic subwork.
export function createPreparationService({prepare,deps,createScanSession,createInlineSession,now=()=>performance.now()}){
  let scanSession,inlineSession;
  function reset(){scanSession?.clear();inlineSession?.clear();scanSession=undefined;inlineSession=undefined;}
  function delta(before,after,keys){return Object.fromEntries(keys.map(k=>[k,after[k]-before[k]]));}
  function handle(message){
    if(!message||!Number.isSafeInteger(message.id)||message.id<1)return {type:'error',id:null,error:{message:'Invalid preparation request'}};
    const {id}=message;
    try{
      if(message.type==='reset'){reset();return {type:'reset',id};}
      if(message.type!=='prepare'||typeof message.retained!=='boolean'||!message.input||!Array.isArray(message.documents))throw Error('Invalid preparation request');
      const start=now();
      if(message.retained){scanSession??=createScanSession();inlineSession??=createInlineSession();}
      const scan=message.retained?scanSession:undefined,inline=message.retained?inlineSession:undefined;
      const sb=scan?.stats(),ib=inline?.stats();
      const prepared=prepareLayoutOptions(message.input,message.documents,prepare,scan?{...deps,scanSession:scan,inlineSession:inline}:deps);
      return {type:'prepared',id,prepared,preparationMs:now()-start,
        work:scan?{scan:delta(sb,scan.stats(),['hits','misses']),inline:delta(ib,inline.stats(),['hits','misses','bypasses'])}:null};
    }catch(e){return {type:'error',id,error:{message:String(e?.message??e),...(typeof e?.code==='string'?{code:e.code}:{})}};}
  }
  return {handle,reset};
}
