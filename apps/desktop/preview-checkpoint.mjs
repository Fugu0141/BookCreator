// Keep the physical measurement lane exclusive, but let the renderer handle
// input and other browser tasks between completed Engine work units.
const stages=['validated','image','measure-block','paginate','render-page','complete','other'];
export function createPreviewCheckpoint({
  current,
  budgetMs=8,
  now=()=>performance.now(),
  yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0))
}){
  if(typeof current!=='function'||!Number.isFinite(budgetMs)||budgetMs<=0)throw new TypeError('Invalid preview checkpoint options');
  let sliceStart=now(),lastBoundary=sliceStart,yields=0,cancelled=0,maxSliceMs=0;
  const byStage=Object.fromEntries(stages.map(s=>[s,{count:0,maxGapMs:0}]));
  const check=()=>{if(!current()){cancelled++;throw new Error('Preview superseded');}};
  function checkpoint(stage){
    const time=now(),gap=Math.max(0,time-lastBoundary),slice=Math.max(0,time-sliceStart);
    const row=byStage[stages.includes(stage)?stage:'other'];
    row.count++;row.maxGapMs=Math.max(row.maxGapMs,gap);maxSliceMs=Math.max(maxSliceMs,slice);
    lastBoundary=time;
    check();
    if(slice<budgetMs)return;
    return (async()=>{
      yields++;
      await yieldTask();
      check();
      sliceStart=lastBoundary=now();
    })();
  }
  // The provisional-page receiver also explicitly yields. Reset the budget
  // after it returns, rather than charging idle timer time to the next slice.
  checkpoint.resumeAfterTask=()=>{sliceStart=lastBoundary=now();};
  checkpoint.snapshot=()=>({budgetMs,yields,cancelled,maxSliceMs,byStage:Object.fromEntries(stages.map(s=>[s,{...byStage[s]}]))});
  return checkpoint;
}
