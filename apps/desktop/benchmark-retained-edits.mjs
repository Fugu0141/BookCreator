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
      return await raw("(()=>{const h=document.querySelector('#preview > div'),{probe:p,initialHost,initialPages}=window.__bcRetainedEditBenchmark,nodes=Array.from(h.shadowRoot.children);return {...p,pages:nodes.length,identity:{sameHost:h===initialHost,reusedFromInitial:nodes.filter((n,i)=>n===initialPages[i]).length,reported:Number(h.dataset.reusedPages),generated:h.dataset.generatedPages===undefined?null:Number(h.dataset.generatedPages)},listPages:nodes.flatMap((node,index)=>node.querySelector('[data-list-item]')?[{index,markers:Array.from(node.querySelectorAll('[data-list-marker]'),e=>e.textContent),retained:node===initialPages[index]}]:[]),embeddedEquationPages:nodes.flatMap((node,index)=>node.querySelector('[data-component] [data-slot-display-math]')?[{index,labels:Array.from(node.querySelectorAll('[data-slot-display-math] [data-equation-number]'),e=>e.textContent),retained:node===initialPages[index]}]:[]),componentPages:nodes.flatMap((node,index)=>node.querySelector('[data-component]')?[{index,retained:node===initialPages[index]}]:[]),equationPages:nodes.flatMap((node,index)=>node.querySelector('[data-display-math]')?[{index,labels:Array.from(node.querySelectorAll('[data-equation-number]'),e=>e.textContent),retained:node===initialPages[index]}]:[]),work:h.dataset.retainedWork?JSON.parse(h.dataset.retainedWork):null,focus:document.activeElement.id==='source',scrollTop:h.parentNode.scrollTop,scrollLeft:h.parentNode.scrollLeft,clean:!h.dataset.provisionalPages&&!h.shadowRoot.querySelector('[data-provisional-layer]')};})()");
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
          const identity=sample.identity;
          const inline=sample.work.inline;
          if(!inline||!Number.isSafeInteger(inline.hits)||inline.hits<1||!Number.isSafeInteger(inline.misses)||!Number.isSafeInteger(inline.bypasses))throw Error('Missing inline parse reuse diagnostics');
          const images=sample.work.images;
          if(!images||images.resources!==0||images.decodedImages!==0||images.skippedDecodes!==0)throw Error('Unexpected image work for resource-free retained fixture: '+JSON.stringify(images));
          if(identity.reusedFromInitial!==sample.pages-1||sample.componentPages.filter(p=>p.retained).length!==sample.componentPages.length-1)throw Error('Mixed fixture did not retain unchanged component pages: '+JSON.stringify({case:item.id,pair,identity,componentPages:sample.componentPages}));
          if(!identity.sameHost||!Number.isSafeInteger(identity.reported)||identity.reported<1||!Number.isSafeInteger(identity.generated)||identity.generated<0||identity.reported+identity.generated!==sample.pages||identity.reusedFromInitial<1||sample.intermediatePublications===0&&identity.reported!==identity.reusedFromInitial)throw Error('Retained inline-math page DOM reuse missing or inconsistent: '+JSON.stringify({case:item.id,pair,identity,pages:sample.pages,intermediatePublications:sample.intermediatePublications}));
          if(!Number.isSafeInteger(sample.work.measurement.sharedSnapshotEntries)||sample.work.measurement.sharedSnapshotEntries<1||sample.work.measurement.sharedSnapshotEntries>sample.work.measurement.reusedBlocks)throw Error('Retained benchmark did not share measurement snapshots');
          if(!['preparationMs','publicationMs'].every(key=>Number.isFinite(sample.work.hostTiming?.[key])&&sample.work.hostTiming[key]>=0))throw Error('Missing host timing diagnostics');
          const publicationStages=sample.work.hostTiming.publicationStages;
          if(!['assemblyMs','describeMs','commitMs','scrollRestoreMs','otherCommitMs'].every(key=>Number.isFinite(publicationStages?.[key])&&publicationStages[key]>=0)||Math.abs(publicationStages.commitMs-publicationStages.scrollRestoreMs-publicationStages.otherCommitMs)>0.001)throw Error('Missing or inconsistent sparse publication stage timing');
          const {scrollRestoreReason:reason,scrollBeforeTop:top,scrollBeforeLeft:left,previousPageCount:previous,currentPageCount:current,scrollRestoreSkipped:skipped}=publicationStages;
          if(!['origin','full-host','page-count-changed','nonzero-offset'].includes(reason)||!Number.isFinite(top)||!Number.isFinite(left)||!Number.isSafeInteger(previous)||previous<0||!Number.isSafeInteger(current)||current!==sample.pages||typeof skipped!=='boolean'||skipped!==(reason==='origin'))throw Error('Invalid scroll restoration diagnostics');
          if(reason==='origin'&&(previous!==current||top!==0||left!==0||publicationStages.scrollRestoreMs!==0||sample.scrollTop!==0||sample.scrollLeft!==0)||reason==='page-count-changed'&&previous===current||reason==='nonzero-offset'&&(previous!==current||top===0&&left===0))throw Error('Inconsistent retained scroll restoration decision');
          if(!Number.isSafeInteger(sample.work.pagination.sharedSnapshotFragments)||sample.work.pagination.sharedSnapshotFragments<1)throw Error('Retained benchmark did not share placement snapshots');
          if(!Number.isFinite(sample.work.hostTiming?.preparationYieldMs)||sample.work.hostTiming.preparationYieldMs<0)throw Error('Missing preparation task boundary timing');
          const cancelled=sample.work.cancelledJobs;
          if(!cancelled||!Number.isSafeInteger(cancelled.dropped)||cancelled.dropped<0||!Array.isArray(cancelled.jobs)||cancelled.jobs.length>8||cancelled.jobs.some(j=>!['read','prepare','prepare-worker','prepare-yield','lane','engine','publish','fallback'].includes(j.phase)||!Number.isFinite(j.elapsedMs)||j.elapsedMs<0||j.preparationMs!==null&&(!Number.isFinite(j.preparationMs)||j.preparationMs<0)))throw Error('Missing cancelled preview diagnostics');
          const stages=sample.work?.checkpoint?.byStage;
          if(!stages||!['paginate-validate','paginate-key','paginate-place','paginate-match','paginate-reuse','paginate-snapshot'].every(stage=>Number.isSafeInteger(stages[stage]?.count)&&stages[stage].count>0&&Number.isFinite(stages[stage].maxGapMs)&&stages[stage].maxGapMs>=0))throw Error('Missing pagination checkpoint diagnostics');
          if(!stages||!['measure-graphemes','measure-hard-line','measure-frozen-line','measure-variable-graphemes','measure-variable-line'].every(stage=>Number.isSafeInteger(stages[stage]?.count)&&stages[stage].count>=0&&Number.isFinite(stages[stage].maxGapMs)&&stages[stage].maxGapMs>=0))throw Error('Missing measurement checkpoint diagnostics');
          if(!stages||!['render-key-page','render-fragment','render-line'].every(stage=>Number.isSafeInteger(stages[stage]?.count)&&stages[stage].count>0&&Number.isFinite(stages[stage].maxGapMs)&&stages[stage].maxGapMs>=0))throw Error('Retained benchmark missing fine render checkpoints');
        }
        if(!retained&&(sample.work||sample.provisionalMs!==null||sample.identity.sameHost||sample.identity.reusedFromInitial!==0))throw Error('Baseline used retained work');
        const {finalMs,provisionalMs,pages,work}=sample;
        const burst=item.id==='burst'?{dispatchOffsetsMs:sample.dispatchOffsetsMs,timerLagMs:sample.timerLagMs,dispatchWorkMs:sample.dispatchWorkMs,intermediatePublications:sample.intermediatePublications,totalMs:sample.totalMs}:undefined;
        samples.push({case:item.id,pair,arm,finalMs,provisionalMs,pages,work,identity:sample.identity,componentPages:sample.componentPages,scrollAfter:{top:sample.scrollTop,left:sample.scrollLeft},...(burst?{burst}:{})});
        await edit(large.source);
        if(await paperSignature()!==original||await readFile(join(root,'manuscript',large.id+'.md'),'utf8')!==large.source)throw Error('Retained benchmark restore failed');
      }
    }
  }
  // A separate numbered-equation workload leaves the historical latency
  // fixture untouched. Compare the actual retained DOM with full composition.
  await setRetained(false);
  const eq=(id,formula,numbered='true')=>'\n::pagebreak{side="any"}\n\n:::layout{#'+id+' numbered="'+numbered+'"}\n$$\n'+formula+'\n$$\n:::\n';
  const equationSource=(formula='x^2',numbered='true')=>large.source+eq('retained-eq-a',formula,numbered)+eq('retained-eq-b','y^2');
  const equationBase=equationSource(),equationEdit=equationSource('x^3'),equationRenumber=equationSource('x^2','false');
  const baseSample=await edit(equationBase),baseSignature=await paperSignature();
  if(baseSample.equationPages.length!==2||baseSample.equationPages.some(p=>p.labels.length!==1)||baseSample.equationPages[0].labels[0]===baseSample.equationPages[1].labels[0])throw Error('Numbered equation fixture did not produce two independently numbered pages: '+JSON.stringify(baseSample.equationPages));
  const fullEdit=await edit(equationEdit),editSignature=await paperSignature();
  if(JSON.stringify(fullEdit.equationPages.map(p=>p.labels))!==JSON.stringify(baseSample.equationPages.map(p=>p.labels))||editSignature===baseSignature)throw Error('Standalone equation fixture edit invalid');
  await edit(equationBase);
  const fullRenumber=await edit(equationRenumber),renumberSignature=await paperSignature();
  if(fullRenumber.equationPages.length!==2||fullRenumber.equationPages[0].labels.length!==0||fullRenumber.equationPages[1].labels[0]!==baseSample.equationPages[0].labels[0])throw Error('Standalone equation renumber fixture invalid: '+JSON.stringify(fullRenumber.equationPages));
  await edit(equationBase);
  await setRetained(true);
  await raw("document.querySelector('#preview > div').dataset.paperProbe='old'");
  await click('#preview-button');
  await until('numbered equation retained prime',ready('manuscript')+"&&document.querySelector('#preview > div').dataset.paperProbe!=='old'&&!!document.querySelector('#preview > div').dataset.retainedWork");
  if(await paperSignature()!==baseSignature)throw Error('Numbered retained prime mismatch');
  const retainedEdit=await edit(equationEdit);
  if(await paperSignature()!==editSignature||!retainedEdit.identity.sameHost||retainedEdit.equationPages.length!==2||retainedEdit.equationPages[0].retained||!retainedEdit.equationPages[1].retained)throw Error('Standalone equation edit did not retain only the unaffected equation page: '+JSON.stringify(retainedEdit.equationPages));
  await edit(equationBase);
  const retainedRenumber=await edit(equationRenumber);
  if(await paperSignature()!==renumberSignature||!retainedRenumber.identity.sameHost||retainedRenumber.equationPages.length!==2||retainedRenumber.equationPages.some(p=>p.retained))throw Error('Renumbered equation pages were not regenerated: '+JSON.stringify(retainedRenumber.equationPages));
  await edit(large.source);
  if(await paperSignature()!==original||await readFile(join(root,'manuscript',large.id+'.md'),'utf8')!==large.source)throw Error('Standalone equation benchmark restore failed');
  console.log('BENCH numbered retained '+JSON.stringify({edit:{identity:retainedEdit.identity,pages:retainedEdit.equationPages},renumber:{identity:retainedRenumber.identity,pages:retainedRenumber.equationPages}}));
  await setRetained(false);
  // Two independently paginated lists. The change is a marker-only edit.
  const listSource=(number=3)=>large.source+'\n::pagebreak{side="any"}\n\n'+number+'. 最初の項目。\n\n::pagebreak{side="any"}\n\n- 変更しない項目。\n';
  const listBase=listSource(),listEdit=listSource(4);
  const listBefore=await edit(listBase),listBaseSignature=await paperSignature();
  const listFull=await edit(listEdit),listEditSignature=await paperSignature();
  if(listBefore.listPages.length!==2||listFull.listPages.length!==2||listBefore.listPages[0].markers.join('')!=='3.'||listFull.listPages[0].markers.join('')!=='4.'||listEditSignature===listBaseSignature)throw Error('Invalid retained list fixture '+JSON.stringify({before:listBefore.listPages,after:listFull.listPages}));
  await edit(listBase);
  await setRetained(true);
  await raw("document.querySelector('#preview > div').dataset.paperProbe='old'");
  await click('#preview-button');
  await until('list retained prime',ready('manuscript')+"&&document.querySelector('#preview > div').dataset.paperProbe!=='old'&&!!document.querySelector('#preview > div').dataset.retainedWork");
  if(await paperSignature()!==listBaseSignature)throw Error('List retained prime mismatch');
  const listRetained=await edit(listEdit);
  if(await paperSignature()!==listEditSignature||!listRetained.identity.sameHost||listRetained.listPages.length!==2||listRetained.listPages[0].retained||!listRetained.listPages[1].retained)throw Error('List marker edit did not preserve unaffected list page: '+JSON.stringify(listRetained.listPages));
  await edit(large.source);
  if(await paperSignature()!==original||await readFile(join(root,'manuscript',large.id+'.md'),'utf8')!==large.source)throw Error('List benchmark restore failed');
  console.log('BENCH list retained '+JSON.stringify({identity:listRetained.identity,pages:listRetained.listPages}));
  await setRetained(false);
  // Dedicated component workload: do not change the historical latency fixture.
  const component=(id,formula)=>['','::pagebreak{side="any"}','','::::component{#'+id+' name="example"}','例題。','',':::layout{#'+id+'-eq numbered="true"}','$$',formula,'$$',':::','::::',''].join('\n');
  const componentSource=(formula='x^2')=>large.source+component('retained-component-a',formula)+component('retained-component-b','y^2');
  const componentBase=componentSource(),componentEdit=componentSource('x^3');
  const componentBefore=await edit(componentBase),componentBaseSignature=await paperSignature();
  const componentFull=await edit(componentEdit),componentEditSignature=await paperSignature();
  if(componentBefore.embeddedEquationPages.length!==2||componentFull.embeddedEquationPages.length!==2||componentBefore.embeddedEquationPages.some(p=>p.labels.length!==1)||JSON.stringify(componentBefore.embeddedEquationPages.map(p=>p.labels))!==JSON.stringify(componentFull.embeddedEquationPages.map(p=>p.labels))||componentBaseSignature===componentEditSignature)throw Error('Invalid component display math fixture '+JSON.stringify({before:componentBefore.embeddedEquationPages,after:componentFull.embeddedEquationPages}));
  await edit(componentBase);
  await setRetained(true);
  await raw("document.querySelector('#preview > div').dataset.paperProbe='old'");
  await click('#preview-button');
  await until('embedded equation retained prime',ready('manuscript')+"&&document.querySelector('#preview > div').dataset.paperProbe!=='old'&&!!document.querySelector('#preview > div').dataset.retainedWork");
  if(await paperSignature()!==componentBaseSignature)throw Error('Embedded equation prime mismatch');
  const componentRetained=await edit(componentEdit);
  if(await paperSignature()!==componentEditSignature||!componentRetained.identity.sameHost||componentRetained.embeddedEquationPages.length!==2||componentRetained.embeddedEquationPages[0].retained||!componentRetained.embeddedEquationPages[1].retained)throw Error('Embedded equation edit did not preserve unaffected component page: '+JSON.stringify(componentRetained.embeddedEquationPages));
  await edit(large.source);
  if(await paperSignature()!==original||await readFile(join(root,'manuscript',large.id+'.md'),'utf8')!==large.source)throw Error('Embedded equation benchmark restore failed');
  console.log('BENCH embedded equation retained '+JSON.stringify({identity:componentRetained.identity,pages:componentRetained.embeddedEquationPages}));
  await setRetained(false);
  // Compare two retained arms on the same input sequence. Keep the historical
  // full/retained benchmark and provisional smoke path unchanged.
  const directRows=[];
  const burstCase=cases.find(c=>c.id==='burst'),burstEdit=large.source.replace(burstCase.from,burstCase.to);
  const burstValues=burstCase.steps.map(to=>large.source.replace(burstCase.from,to));
  async function setDirect(enabled){
    await click('#performance-toggle');
    const query="document.querySelector('#performance-direct-single-page').checked";
    if(await raw(query)!==enabled)await click('#performance-direct-single-page');
    if(await raw(query)!==enabled)throw Error('Direct single-page comparison setting mismatch');
    await click('#performance-close');
  }
  const expectedBurstSignature=await (async()=>{
    await edit(burstEdit);
    const signature=await paperSignature();
    await edit(large.source);
    if(await paperSignature()!==original)throw Error('Direct comparison baseline restore failed');
    return signature;
  })();
  for(const {pair,order} of cacheComparisonPlan()){
    for(const arm of order){
      const direct=arm==='warm';
      await setRetained(false);await setRetained(true);await setDirect(direct);
      await raw("document.querySelector('#preview > div').dataset.paperProbe='old'");
      await click('#preview-button');
      await until('direct comparison prime',ready('manuscript')+"&&document.querySelector('#preview > div').dataset.paperProbe!=='old'&&!!document.querySelector('#preview > div').dataset.retainedWork");
      if(await paperSignature()!==original)throw Error('Direct comparison prime mismatch');
      const s=await edit(burstEdit,burstValues);
      if(await paperSignature()!==expectedBurstSignature||!s.focus||!s.clean||!s.identity.sameHost||s.identity.reusedFromInitial!==s.pages-1||s.work?.directSinglePage!==direct)throw Error('Direct comparison paper parity or retained identity failed');
      if(direct&&(s.provisionalMs!==null||s.work.provisionalCount!==0))throw Error('Single-page direct mode produced provisional copy');
      if(!direct&&(s.provisionalMs===null||s.work.provisionalCount<1))throw Error('Streaming comparison did not deliver provisional copy');
      directRows.push({pair,arm,finalMs:s.finalMs,provisionalMs:s.provisionalMs,identity:s.identity,burst:{dispatchOffsetsMs:s.dispatchOffsetsMs,timerLagMs:s.timerLagMs,dispatchWorkMs:s.dispatchWorkMs,intermediatePublications:s.intermediatePublications,totalMs:s.totalMs}});
      await edit(large.source);
      if(await paperSignature()!==original||await readFile(join(root,'manuscript',large.id+'.md'),'utf8')!==large.source)throw Error('Direct comparison restore failed');
    }
  }
  await setDirect(false);await setRetained(false);
  const directComparison=summarizeBurstInputSamples(directRows);
  console.log('BENCH direct single page '+JSON.stringify({version:1,arms:{uncached:'streaming',warm:'direct'},comparison:directComparison,samples:directRows}));
  // Compare the preparation boundary alone: both arms keep retained layout
  // and streaming publication enabled; only the preparation worker changes.
  const workerRows=[];
  async function setWorker(enabled){
    await click('#performance-toggle');
    const query="document.querySelector('#performance-worker-preparation').checked";
    if(await raw(query)!==enabled)await click('#performance-worker-preparation');
    if(await raw(query)!==enabled)throw Error('Worker preparation comparison setting mismatch');
    await click('#performance-close');
  }
  function checkPreparation(work,worker){
    const timing=work?.hostTiming;
    if(!timing||timing.preparationMode!==(worker?'worker':'main')||
      !Number.isFinite(timing.preparationMs)||timing.preparationMs<0||
      (worker?(!Number.isFinite(timing.workerComputeMs)||timing.workerComputeMs<0):timing.workerComputeMs!==null))throw Error('Worker comparison preparation path or timing invalid: '+JSON.stringify(timing));
    return preparationTiming(timing,worker);
  }
  for(const {pair,order} of cacheComparisonPlan()){
    for(const arm of order){
      const worker=arm==='warm';
      await setRetained(false);await setRetained(true);await setWorker(worker);
      await raw("document.querySelector('#preview > div').dataset.paperProbe='old'");
      await click('#preview-button');
      await until('worker comparison prime',ready('manuscript')+"&&document.querySelector('#preview > div').dataset.paperProbe!=='old'&&!!document.querySelector('#preview > div').dataset.retainedWork");
      if(await paperSignature()!==original)throw Error('Worker comparison prime mismatch');
      const prime=checkPreparation(await raw("JSON.parse(document.querySelector('#preview > div').dataset.retainedWork)"),worker);
      const s=await edit(burstEdit,burstValues);
      const preparation=checkPreparation(s.work,worker);
      if(await paperSignature()!==expectedBurstSignature||!s.focus||!s.clean||!s.identity.sameHost||s.identity.reusedFromInitial!==s.pages-1||
        s.work.directSinglePage||!Number.isSafeInteger(s.work.inline?.hits)||s.work.inline.hits<1)throw Error('Worker comparison paper parity or retained reuse failed');
      workerRows.push({pair,arm,finalMs:s.finalMs,provisionalMs:s.provisionalMs,identity:s.identity,preparation,prime,cancelled:workerCancelledTiming(s.work.cancelledJobs),
        burst:{dispatchOffsetsMs:s.dispatchOffsetsMs,timerLagMs:s.timerLagMs,dispatchWorkMs:s.dispatchWorkMs,intermediatePublications:s.intermediatePublications,totalMs:s.totalMs}});
      await edit(large.source);
      if(await paperSignature()!==original||await readFile(join(root,'manuscript',large.id+'.md'),'utf8')!==large.source)throw Error('Worker comparison restore failed');
    }
  }
  await setWorker(false);await setRetained(false);
  const workerComparison={...summarizeBurstInputSamples(workerRows),preparation:summarizePreparationTiming(workerRows)};
  console.log('BENCH preparation worker '+JSON.stringify({version:1,arms:{uncached:'main',warm:'worker'},comparison:workerComparison,samples:workerRows}));
  const summaries=cases.map(({id})=>summarizeRetainedEditSamples(id,samples.filter(s=>s.case===id)));
  const burst=summarizeBurstInputSamples(samples.filter(s=>s.case==='burst'));
  console.log('BENCH retained '+JSON.stringify({version:2,summaries,samples,burst}));
  return {summaries,samples,burst,directComparison,workerComparison,workerRows};
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

 // Request duration includes payload projection, structured clone, queueing,
 // computation and delivery. The difference is not pure transport CPU time.
export function preparationTiming(timing,worker){
  const valid=v=>Number.isFinite(v)&&v>=0;
  const {preparationMs:hostMs,workerRequestMs:requestMs,workerComputeMs:computeMs}=timing;
  if(!valid(hostMs)||(worker?(!valid(requestMs)||!valid(computeMs)):requestMs!==null||computeMs!==null))throw Error('Invalid preparation timing');
  return {hostMs,requestMs,computeMs,nonComputeMs:worker?Math.max(0,requestMs-computeMs):null};
}
export function workerCancelledTiming(log){
  const valid=v=>v===null||Number.isFinite(v)&&v>=0;
  if(!log||!Number.isSafeInteger(log.dropped)||log.dropped<0||!Array.isArray(log.jobs)||log.jobs.length>8)throw Error('Invalid cancelled preparation log');
  for(const j of log.jobs)if(!valid(j.workerRequestMs)||!valid(j.workerComputeMs)||j.workerRequestMs===null&&j.workerComputeMs!==null)throw Error('Invalid cancelled preparation timing');
  return {dropped:log.dropped,observed:log.jobs.length,
    workerRequests:log.jobs.filter(j=>j.workerRequestMs!==null).length,
    workerRequestMs:log.jobs.reduce((n,j)=>n+(j.workerRequestMs??0),0)};
}
export function summarizePreparationTiming(rows){
  const median=values=>{const v=[...values].sort((a,b)=>a-b);return v.length%2?v[(v.length-1)/2]:(v[v.length/2-1]+v[v.length/2])/2;};
  return Object.fromEntries(['uncached','warm'].map(arm=>{
    const selected=rows.filter(r=>r.arm===arm),worker=arm==='warm';
    if(selected.length!==4||new Set(selected.map(r=>r.pair)).size!==4)throw Error('Incomplete preparation timing pairs');
    const summarize=key=>({hostMs:median(selected.map(r=>r[key].hostMs)),requestMs:worker?median(selected.map(r=>r[key].requestMs)):null,computeMs:worker?median(selected.map(r=>r[key].computeMs)):null,nonComputeMs:worker?median(selected.map(r=>r[key].nonComputeMs)):null});
    return [arm,{prime:summarize('prime'),edit:summarize('preparation'),
      cancelled:selected.reduce((n,r)=>({dropped:n.dropped+r.cancelled.dropped,observed:n.observed+r.cancelled.observed,workerRequests:n.workerRequests+r.cancelled.workerRequests,workerRequestMs:n.workerRequestMs+r.cancelled.workerRequestMs}),{dropped:0,observed:0,workerRequests:0,workerRequestMs:0})}];
  }));
}
