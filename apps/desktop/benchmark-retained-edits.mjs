// Isolated paired real-input benchmark. Browser-side MutationObserver clocks
// exclude IPC/polling delay; they measure DOM availability, not actual paint.
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {summarizeCacheComparison,cacheComparisonPlan} from './benchmark-comparison.mjs';
import {installInputProbe} from './benchmark-input-probe.mjs';

export async function benchmarkRetainedEdits({raw,click,until,ready,paperSignature,large,root}){
  const checked=()=>raw("document.querySelector('#performance-retained-preview').checked");
  async function setRetained(enabled){
    await click('#performance-toggle');
    if(await checked()!==enabled)await click('#performance-retained-preview');
    if(await checked()!==enabled||!await raw("document.querySelector('#performance-paragraph-cache-enabled').checked&&['#performance-cache-enabled','#performance-math-cache-enabled','#performance-page-cache-enabled','#performance-reuse-paper-pages','#performance-sparse-paper-pages'].every(s=>!document.querySelector(s).checked)"))throw Error('Retained comparison requires default incremental paragraph cache only');
    await click('#performance-close');
  }
  const original=await paperSignature();
  const cases=[
    {id:'text',from:'実測組版を確認します。',to:'増分組版を確認します。'},
    {id:'math',from:'x^2+2x+1',to:'x^2+3x+1'},
    {id:'burst',from:'x^2+2x+1',to:'x^2+7x+1',steps:[3,4,5,6,7].map(n=>'x^2+'+n+'x+1')}
  ];
  // Install observers and send the actual input event in one browser task.
  // The provisional marker is read at the task boundary before final commit.
  async function edit(value,values=[value]){
    await raw("("+installInputProbe.toString()+")("+JSON.stringify({values,intervalMs:35})+")");
    try{
      await until('retained benchmark input committed',ready('manuscript')+"&&window.__bcRetainedEditBenchmark.probe.finalMs!==null&&document.querySelector('#source').value==="+JSON.stringify(value));
      return await raw("(()=>{const h=document.querySelector('#preview > div'),p=window.__bcRetainedEditBenchmark.probe;return {...p,pages:h.shadowRoot.children.length,work:h.dataset.retainedWork?JSON.parse(h.dataset.retainedWork):null,focus:document.activeElement.id==='source',clean:!h.dataset.provisionalPages&&!h.shadowRoot.querySelector('[data-provisional-layer]')};})()");
    }finally{await raw("(()=>{const p=window.__bcRetainedEditBenchmark;if(p){p.observer.disconnect();p.timers.forEach(t=>clearTimeout(t));}delete window.__bcRetainedEditBenchmark;})()");}
  }
  const samples=[];
  for(const item of cases){
    const edited=large.source.replace(item.from,item.to);
    if(edited===large.source||edited.length!==large.source.length)throw Error('Invalid retained edit fixture '+item.id);
    const values=item.steps?.map(to=>large.source.replace(item.from,to))??[edited];
    if(values.at(-1)!==edited||new Set(values).size!==values.length||values.some(v=>v.length!==large.source.length||v===large.source))throw Error('Invalid input sequence '+item.id);
    let oracle;
    for(const {pair,order} of cacheComparisonPlan()){
      for(const arm of order){
        const retained=arm==='warm';
        await setRetained(false);await setRetained(retained);
        // Both modes receive an equivalent warm prime on the same source.
        await raw("document.querySelector('#preview > div').dataset.paperProbe='old'");
        await click('#preview-button');
        await until('retained benchmark prime',ready('manuscript')+"&&document.querySelector('#preview > div').dataset.paperProbe!=='old'"+(retained?"&&!!document.querySelector('#preview > div').dataset.retainedWork":""));
        if(await paperSignature()!==original)throw Error('Retained prime mismatch');
        const sample=await edit(edited,values),signature=await paperSignature();
        if(signature===original||oracle!==undefined&&signature!==oracle)throw Error('Retained benchmark paper parity failed '+item.id);
        oracle=signature;
        if(!sample.focus||!sample.clean||!Number.isFinite(sample.finalMs)||sample.finalMs<0||sample.provisionalMs!==null&&(!Number.isFinite(sample.provisionalMs)||sample.provisionalMs<0||sample.provisionalMs>sample.finalMs))throw Error('Invalid retained benchmark sample');
        if(retained&&(!sample.work||sample.work.measurement.reusedBlocks<1||sample.work.pagination.reusedBlocks<1))throw Error('Retained benchmark did not reuse measured/placed blocks');
        if(retained){
          if(!Number.isSafeInteger(sample.work.measurement.sharedSnapshotEntries)||sample.work.measurement.sharedSnapshotEntries<1||sample.work.measurement.sharedSnapshotEntries>sample.work.measurement.reusedBlocks)throw Error('Retained benchmark did not share measurement snapshots');
          if(!['preparationMs','publicationMs'].every(key=>Number.isFinite(sample.work.hostTiming?.[key])&&sample.work.hostTiming[key]>=0))throw Error('Missing host timing diagnostics');
          const publicationStages=sample.work.hostTiming.publicationStages;
          if(!['assemblyMs','describeMs','commitMs','scrollRestoreMs','otherCommitMs'].every(key=>Number.isFinite(publicationStages?.[key])&&publicationStages[key]>=0)||Math.abs(publicationStages.commitMs-publicationStages.scrollRestoreMs-publicationStages.otherCommitMs)>0.001)throw Error('Missing or inconsistent sparse publication stage timing');
          if(!Number.isSafeInteger(sample.work.pagination.sharedSnapshotFragments)||sample.work.pagination.sharedSnapshotFragments<1)throw Error('Retained benchmark did not share placement snapshots');
          if(!Number.isFinite(sample.work.hostTiming?.preparationYieldMs)||sample.work.hostTiming.preparationYieldMs<0)throw Error('Missing preparation task boundary timing');
          const cancelled=sample.work.cancelledJobs;
          if(!cancelled||!Number.isSafeInteger(cancelled.dropped)||cancelled.dropped<0||!Array.isArray(cancelled.jobs)||cancelled.jobs.length>8||cancelled.jobs.some(j=>!['read','prepare','prepare-yield','lane','engine','publish','fallback'].includes(j.phase)||!Number.isFinite(j.elapsedMs)||j.elapsedMs<0||j.preparationMs!==null&&(!Number.isFinite(j.preparationMs)||j.preparationMs<0)))throw Error('Missing cancelled preview diagnostics');
          const stages=sample.work?.checkpoint?.byStage;
          if(!stages||!['paginate-validate','paginate-key','paginate-place','paginate-match','paginate-reuse','paginate-snapshot'].every(stage=>Number.isSafeInteger(stages[stage]?.count)&&stages[stage].count>0&&Number.isFinite(stages[stage].maxGapMs)&&stages[stage].maxGapMs>=0))throw Error('Missing pagination checkpoint diagnostics');
          if(!stages||!['measure-graphemes','measure-hard-line','measure-frozen-line','measure-variable-graphemes','measure-variable-line'].every(stage=>Number.isSafeInteger(stages[stage]?.count)&&stages[stage].count>=0&&Number.isFinite(stages[stage].maxGapMs)&&stages[stage].maxGapMs>=0))throw Error('Missing measurement checkpoint diagnostics');
          if(!stages||!['render-key-page','render-fragment','render-line'].every(stage=>Number.isSafeInteger(stages[stage]?.count)&&stages[stage].count>0&&Number.isFinite(stages[stage].maxGapMs)&&stages[stage].maxGapMs>=0))throw Error('Retained benchmark missing fine render checkpoints');
        }
        if(!retained&&(sample.work||sample.provisionalMs!==null))throw Error('Baseline used retained work');
        const {finalMs,provisionalMs,pages,work}=sample;
        const burst=item.id==='burst'?{dispatchOffsetsMs:sample.dispatchOffsetsMs,timerLagMs:sample.timerLagMs,dispatchWorkMs:sample.dispatchWorkMs,intermediatePublications:sample.intermediatePublications,totalMs:sample.totalMs}:undefined;
        samples.push({case:item.id,pair,arm,finalMs,provisionalMs,pages,work,...(burst?{burst}:{})});
        await edit(large.source);
        if(await paperSignature()!==original||await readFile(join(root,'manuscript',large.id+'.md'),'utf8')!==large.source)throw Error('Retained benchmark restore failed');
      }
    }
  }
  await setRetained(false);
  const summaries=cases.map(({id})=>summarizeRetainedEditSamples(id,samples.filter(s=>s.case===id)));
  const burst=summarizeBurstInputSamples(samples.filter(s=>s.case==='burst'));
  console.log('BENCH retained '+JSON.stringify({version:2,summaries,samples,burst}));
  return {summaries,samples,burst};
}

export function summarizeRetainedEditSamples(id,rows){
  for(const r of rows){
    if(!Number.isFinite(r.finalMs)||r.finalMs<=0||r.provisionalMs!==null&&(!Number.isFinite(r.provisionalMs)||r.provisionalMs<=0||r.provisionalMs>r.finalMs||r.arm!=='warm'))throw Error('Invalid retained edit latency');
  }
  const compare=select=>summarizeCacheComparison(rows.map(s=>({label:'cache-pair-'+s.pair+'-'+s.arm,scope:'manuscript',elapsedMs:select(s)})),'manuscript');
  const provisional=rows.filter(s=>s.arm==='warm'&&s.provisionalMs!==null);
  const percentile=(values,q)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*q)-1];
  const p95=select=>Object.fromEntries(['uncached','warm'].map(arm=>[arm,percentile(rows.filter(s=>s.arm===arm).map(select),.95)]));
  const first=s=>s.provisionalMs??s.finalMs;
  return {case:id,final:compare(s=>s.finalMs),first:compare(first),finalP95:p95(s=>s.finalMs),firstP95:p95(first),
    provisionalCount:provisional.length,retainedCount:rows.filter(s=>s.arm==='warm').length,
    provisionalSamples:provisional.map(s=>({pair:s.pair,firstDomMs:s.provisionalMs,finalDomMs:s.finalMs,leadMs:s.finalMs-s.provisionalMs}))};
}

export function summarizeBurstInputSamples(rows){
  const compare=select=>summarizeCacheComparison(rows.map(s=>({label:'cache-pair-'+s.pair+'-'+s.arm,scope:'manuscript',elapsedMs:select(s)})),'manuscript');
  if(rows.length!==8)throw Error('Expected four burst pairs');
  for(const r of rows){
    const b=r.burst;
    if(!b||!['uncached','warm'].includes(r.arm)||!Number.isInteger(r.pair)||r.pair<1||r.pair>4||
      !Array.isArray(b.dispatchOffsetsMs)||b.dispatchOffsetsMs.length!==5||
      !Array.isArray(b.timerLagMs)||b.timerLagMs.length!==5||
      !Array.isArray(b.dispatchWorkMs)||b.dispatchWorkMs.length!==5||b.dispatchWorkMs.some(n=>!Number.isFinite(n)||n<0)||
      b.dispatchOffsetsMs.some((n,i)=>!Number.isFinite(n)||n<0||(i>0&&n<b.dispatchOffsetsMs[i-1]))||
      b.timerLagMs.some((n,i)=>!Number.isFinite(n)||n<0||Math.abs(n-Math.max(0,b.dispatchOffsetsMs[i]-35*i))>0.001)||
      !Number.isInteger(b.intermediatePublications)||b.intermediatePublications<0||b.intermediatePublications>4||
      !Number.isFinite(r.finalMs)||r.finalMs<=0||!Number.isFinite(b.totalMs)||
      Math.abs(b.totalMs-b.dispatchOffsetsMs[4]-r.finalMs)>0.001)throw Error('Invalid burst timing sample');
  }
  const arms=Object.fromEntries(['uncached','warm'].map(arm=>{
    const selected=rows.filter(r=>r.arm===arm);
    const lag=selected.flatMap(r=>r.burst.timerLagMs.slice(1)).sort((a,b)=>a-b);
    const dispatch=selected.flatMap(r=>r.burst.dispatchWorkMs).sort((a,b)=>a-b);
    return [arm,{dispatchWorkP95Ms:dispatch[Math.ceil(dispatch.length*.95)-1],dispatchWorkMaxMs:dispatch.at(-1),timerLagP95Ms:lag[Math.ceil(lag.length*.95)-1],timerLagMaxMs:lag.at(-1),intermediatePublications:selected.reduce((n,r)=>n+r.burst.intermediatePublications,0),scheduledInputs:lag.length}];
  }));
  return {intervalMs:35,inputsPerSample:5,lastInputToFinal:compare(r=>r.finalMs),firstInputTaskToFinal:compare(r=>r.burst.totalMs),arms};
}
