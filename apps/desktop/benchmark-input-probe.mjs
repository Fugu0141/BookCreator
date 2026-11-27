// Browser-side input timing probe for the hidden Electron benchmark.
// Serialized with toString(): no imports or captured variables.
// These are task dispatch/DOM availability measurements, not physical input or paint.
export function installInputProbe({values,intervalMs}){
  const viewport=document.querySelector('#preview'),state=document.querySelector('#workspace-layout-state'),input=document.querySelector('#source');
  viewport.scrollTop=0;input.focus();
  const origin=performance.now(),timers=[];
  const probe={started:null,provisionalMs:null,finalMs:null,dispatchOffsetsMs:[],timerLagMs:[],dispatchWorkMs:[],intermediatePublications:0,totalMs:null};
  let index=-1,seenCurrent=false;
  const observer=new MutationObserver(()=>{
    const host=viewport.firstElementChild;
    if(index<0||probe.finalMs!==null)return;
    const last=index===values.length-1;
    if(last&&probe.provisionalMs===null&&Number(host?.dataset.provisionalPages)>0)
      probe.provisionalMs=performance.now()-probe.started;
    if(!seenCurrent&&host?.dataset.paperFreshness==='current'&&state.dataset.phase==='ready'&&!host.inert){
      seenCurrent=true;
      if(last){
        const now=performance.now();
        probe.finalMs=now-probe.started;probe.totalMs=now-origin;observer.disconnect();
      }else probe.intermediatePublications++;
    }
  });
  // A baseline publish replaces the host; retained publish mutates it in place.
  observer.observe(viewport,{childList:true,subtree:true,attributes:true,attributeFilter:['data-paper-freshness','data-provisional-pages','inert']});
  observer.observe(state,{attributes:true,attributeFilter:['data-phase']});
  window.__bcRetainedEditBenchmark={probe,observer,timers};
  const dispatch=i=>{
    index=i;seenCurrent=false;
    const now=performance.now(),offset=now-origin;
    probe.dispatchOffsetsMs.push(offset);
    probe.timerLagMs.push(Math.max(0,offset-i*intervalMs));
    if(i===values.length-1)probe.started=now;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,values[i]);
    input.dispatchEvent(new Event('input',{bubbles:true}));
    probe.dispatchWorkMs.push(performance.now()-now);
  };
  // Queue all deadlines against the same clock. Late callbacks expose event-loop
  // contention instead of silently shifting the requested input cadence.
  for(let i=1;i<values.length;i++)timers.push(setTimeout(()=>dispatch(i),Math.max(0,origin+i*intervalMs-performance.now())));
  dispatch(0);
}
