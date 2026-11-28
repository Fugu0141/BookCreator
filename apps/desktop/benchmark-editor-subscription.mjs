import {summarizeEditorInput} from './editor-commit-metrics.mjs';
export const editorBurstSize=20;
export function editorSubscriptionPlan(){
  return [{pair:1,order:['full','metadata']},{pair:2,order:['metadata','full']}];
}
export function summarizeEditorSubscription(rows){
  const result={};
  for(const mode of ['full','metadata']){
    const arm=rows.filter(row=>row.mode===mode);
    result[mode]={
      runs:arm.length,
      edits:arm.reduce((sum,row)=>sum+row.edits,0),
      workspaceCommits:arm.reduce((sum,row)=>sum+row.counts.workspace,0),
      sourceCommits:arm.reduce((sum,row)=>sum+row.counts.source,0),
      input:summarizeEditorInput(arm.flatMap(row=>row.inputMs))
    };
  }
  return result;
}
export async function benchmarkEditorSubscription({raw,click,until,ready,setSource,sleep,large}){
  const probe='window.__bcEditorBenchmark';
  const snapshot=()=>raw(probe+'.snapshot()');
  const committed=value=>'document.querySelector("#source").value==='+JSON.stringify(value);
  const select=async mode=>{
    await raw(probe+'.select('+JSON.stringify(mode)+')');
    await until('editor subscription '+mode,probe+'.mode==='+JSON.stringify(mode));
  };
  await until('editor benchmark hook','!!'+probe);
  if(!await raw('document.querySelector("#live-preview").checked'))throw Error('Editor benchmark requires initially enabled live preview');
  await click('#live-preview');
  await until('editor benchmark preview disabled','!document.querySelector("#live-preview").checked');
  const rows=[];
  try{
    for(const {pair,order} of editorSubscriptionPlan())for(const mode of order){
      await select(mode);
      const prime=large.source+'\n入力比較準備\n';
      await setSource(prime);
      await until('editor benchmark dirty prime',committed(prime)+'&&document.querySelector("#workspace-save-state").dataset.dirty==="true"');
      // Let the recovery checkpoint and initial dirty/layout state settle.
      await sleep(1000);
      await raw(probe+'.clear()');
      for(let i=1;i<=editorBurstSize;i++){
        const value=prime+'連続入力 '+i+'\n';
        await setSource(value);
        await until('editor benchmark input '+i,committed(value)+'&&'+probe+'.snapshot().inputMs.length==='+i);
        if(i<editorBurstSize)await sleep(15);
      }
      const {counts,inputMs}=await snapshot();
      if(inputMs.length!==editorBurstSize||counts.source<editorBurstSize||mode==='full'&&counts.workspace<editorBurstSize||
        inputMs.some(ms=>!Number.isFinite(ms)||ms<0))throw Error('Incomplete editor benchmark measurements: '+mode);
      const row={pair,mode,edits:editorBurstSize,counts,inputMs};
      rows.push(row);
      console.log('BENCH editor subscription '+JSON.stringify(row));
      await setSource(large.source);
      await until('editor benchmark restore',committed(large.source)+'&&document.querySelector("#workspace-save-state").dataset.dirty==="false"');
      await sleep(1000);
    }
  }finally{
    await select('metadata');
    await setSource(large.source);
    await click('#live-preview');
  }
  await until('editor benchmark paper restored',ready('manuscript')+'&&'+committed(large.source));
  return {version:1,autoPreview:false,comparison:'notification-boundary-control',rows,summary:summarizeEditorSubscription(rows)};
}
