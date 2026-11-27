// Keep the physical measurement lane exclusive, but let the renderer handle
// input and other browser tasks between completed Engine work units.
export function createPreviewCheckpoint({
  current,
  budgetMs=8,
  now=()=>performance.now(),
  yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0))
}){
  if(typeof current!=='function'||!Number.isFinite(budgetMs)||budgetMs<=0)throw new TypeError('Invalid preview checkpoint options');
  let sliceStart=now();
  const check=()=>{if(!current())throw new Error('Preview superseded');};
  return function checkpoint(){
    check();
    if(now()-sliceStart<budgetMs)return;
    return (async()=>{
      await yieldTask();
      check();
      sliceStart=now();
    })();
  };
}
