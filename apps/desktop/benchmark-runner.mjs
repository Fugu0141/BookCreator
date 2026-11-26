import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {benchmarkFixture} from './benchmark-fixture.mjs';
import {cacheComparisonPlan,summarizeCacheComparison} from './benchmark-comparison.mjs';
import {phaseKeys} from './preview-phase-metrics.mjs';
export async function prepareBenchmark(root){
  const fixture=benchmarkFixture();
  await mkdir(join(root,'manuscript'),{recursive:true});
  await mkdir(join(root,'themes','default'),{recursive:true});
  await writeFile(join(root,'themes','default','theme.yaml'),'schemaVersion: 1\nid: default\nname: Default\n');
  await writeFile(join(root,'book.yaml'),fixture.manifest);
  for(const c of fixture.chapters)await writeFile(join(root,'manuscript',c.id+'.md'),c.source);
  return fixture;
}
export async function runBookBenchmark(win,app,root,fixture){
  const raw=js=>win.webContents.executeJavaScript(js),sleep=ms=>new Promise(r=>setTimeout(r,ms));
  async function until(label,js){
    const deadline=performance.now()+60000;
    while(performance.now()<deadline){
      const state=await raw("({matched:!!("+js+"),failed:document.querySelector('#workspace-layout-state')?.dataset.phase==='failed'})");
      if(state.matched)return;
      if(state.failed&&label!=='oversized blocks rejected')throw Error('Benchmark failed: '+label+'; '+await raw("document.querySelector('#workspace-diagnostic-list')?.textContent||document.querySelector('#status')?.textContent"));
      await sleep(25);
    }
    throw Error('Benchmark timeout: '+label+'; '+await raw("JSON.stringify({phase:document.querySelector('#workspace-layout-state')?.dataset.phase,scope:document.querySelector('#workspace-layout-state')?.dataset.scope,sourceLength:document.querySelector('#source')?.value.length,freshness:document.querySelector('#preview > div')?.dataset.paperFreshness,inert:document.querySelector('#preview > div')?.inert,diagnostics:document.querySelector('#workspace-diagnostic-list')?.textContent,status:document.querySelector('#status')?.textContent})"));
  }
  const click=async selector=>{
    const q=JSON.stringify(selector);
    await until('enabled '+selector,"!!document.querySelector("+q+")&&!document.querySelector("+q+").disabled");
    await raw("document.querySelector("+q+").click()");
  };
  const ready=scope=>"document.querySelector('#workspace-layout-state').dataset.phase==='ready'&&document.querySelector('#workspace-layout-state').dataset.scope==="+JSON.stringify(scope)+"&&document.querySelector('#preview > div')?.dataset.paperFreshness==='current'";
  const paperText=value=>"document.querySelector('#preview > div')?.shadowRoot?.textContent.includes("+JSON.stringify(value)+")";
  const setSource=value=>raw("(()=>{const e=document.querySelector('#source');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  const memory=()=>app.getAppMetrics().reduce((acc,p)=>{
    const size=p.memory?.workingSetSize;if(!Number.isFinite(size)||size<0)return acc;
    acc.totalKiB+=size;if(p.type==='Tab')acc.rendererKiB+=size;return acc;
  },{totalKiB:0,rendererKiB:0});
  const samples=[];
  async function measure(label,scope,action,extra='true'){
    const start=performance.now();
    await action();
    await until(label,ready(scope)+"&&("+extra+")");
    const row={label,scope,elapsedMs:Math.round((performance.now()-start)*10)/10,pages:await raw("document.querySelector('#preview > div').shadowRoot.querySelectorAll('[data-page]').length"),memory:memory()};
    samples.push(row);console.log('BENCH sample '+JSON.stringify(row));
  }
  const initialMemory=memory();
  const paperSignature=()=>raw("JSON.stringify(Array.from(document.querySelector('#preview > div').shadowRoot.querySelectorAll('[data-page]')).map(p=>p.outerHTML))");
  const cacheStats=()=>raw("(()=>{const e=document.querySelector('#performance-cache');return {hits:Number(e.dataset.hits),misses:Number(e.dataset.misses),entries:Number(e.dataset.entries)};})()");
  const mathStats=()=>raw("JSON.parse(document.querySelector('#performance-math-cache').dataset.stats)");
  const mathEmpty=s=>Object.values(s).every(v=>v.entries===0&&v.hits===0&&v.misses===0);
  await click('#open');
  await until('open',"document.querySelector('.workspace-shell').dataset.workspaceMode==='writing'&&!document.querySelector('#open').disabled");
  for(const c of fixture.chapters){
    await measure(c.id+'-open','manuscript',()=>click('[data-section='+c.id+']'),"document.querySelector('#source').value==="+JSON.stringify(c.source));
    const original=await raw("document.querySelector('#preview > div').dataset.paperProbe='old';true");
    await measure(c.id+'-repeat','manuscript',()=>click('#preview-button'),"document.querySelector('#preview > div').dataset.paperProbe!=='old'");
  }
  const large=fixture.chapters.at(-1);
  await raw("document.querySelector('#source').focus()");
  await measure('large-edit-burst','manuscript',async()=>{
    for(let i=1;i<=5;i++){await setSource(large.source+'\n連続編集確認 '+i+'\n');if(i<5)await sleep(35);}
  },paperText('連続編集確認 5')+"&&!"+paperText('連続編集確認 4')+"&&document.activeElement.id==='source'");
  await measure('large-revert','manuscript',()=>setSource(large.source),"!"+paperText('連続編集確認 5')+"&&document.querySelector('#workspace-save-state').textContent==='保存済み'");
  // Exercise the existing hard boundary separately from the successful workloads.
  await setSource(fixture.oversizedSource);
  await until('oversized input committed',"document.querySelector('#source').value==="+JSON.stringify(fixture.oversizedSource));
  await until('oversized blocks rejected',"document.querySelector('#workspace-layout-state')?.dataset.phase==='failed'&&document.querySelector('#workspace-diagnostic-list')?.textContent.includes('128')&&document.querySelector('#preview > div')?.dataset.paperFreshness==='previous'&&document.querySelector('#preview > div').inert");
  await measure('large-limit-recovery','manuscript',()=>setSource(large.source),"document.querySelector('#workspace-save-state').textContent==='保存済み'");
  await measure('whole-book-open','book',()=>click('#mode-layout'));
  await raw("document.querySelector('#preview > div').dataset.paperProbe='old'");
  await measure('whole-book-repeat','book',()=>click('#preview-book'),"document.querySelector('#preview > div').dataset.paperProbe!=='old'");
  for(const c of fixture.chapters)if(await readFile(join(root,'manuscript',c.id+'.md'),'utf8')!==c.source)throw Error('Benchmark changed a saved manuscript');
  if(await readFile(join(root,'book.yaml'),'utf8')!==fixture.manifest)throw Error('Benchmark changed manifest');
  await click('#performance-toggle');
  await until('metrics',"document.querySelector('#performance-summary tbody tr[data-stage=layout][data-category=book]')?.dataset.success>0&&document.querySelector('#performance-memory')?.dataset.phase==='ready'");
  async function readPhaseSample(scope,enabled,mathEnabled=false){
    const selector='#performance-phase-summary tr[data-scope='+scope+'][data-cache-enabled='+String(enabled)+'][data-math-cache-enabled='+String(mathEnabled)+']';
    const sample=await raw("(()=>{const e=document.querySelector("+JSON.stringify(selector)+");return e?{count:Number(e.dataset.count),timings:JSON.parse(e.dataset.latest)}:null;})()");
    if(!sample||!Number.isSafeInteger(sample.count)||sample.count<1||
      Object.keys(sample.timings).length!==phaseKeys.length||!phaseKeys.every(k=>Number.isFinite(sample.timings[k])&&sample.timings[k]>=0))
      throw Error('Missing or invalid phase metrics: '+scope+' '+enabled);
    return sample;
  }
  await readPhaseSample('manuscript',false,false);
  await readPhaseSample('book',false,false);
  const baselineCache=await cacheStats(),baselineMath=await mathStats();
  if(await raw("document.querySelector('#performance-cache-enabled').checked||document.querySelector('#performance-math-cache-enabled').checked")||Object.values(baselineCache).some(n=>n!==0)||!mathEmpty(baselineMath))throw Error('Both experimental caches must start disabled and empty');
  const cachedPaper=await paperSignature();
  await click('#performance-close');
  // Reset the cache before each warm arm; prime both arms symmetrically.
  // A warm-up run is recorded separately, never included in the paired summary.
  async function setComparisonCache(enabled){
    await click('#performance-toggle');
    const checked=()=>raw("document.querySelector('#performance-cache-enabled').checked");
    if(await checked())await click('#performance-cache-enabled');
    if(enabled)await click('#performance-cache-enabled');
    if(await checked()!==enabled)throw Error('Cache toggle did not take effect');
    const reset=await cacheStats();
    if(reset.entries!==0||reset.hits!==0||reset.misses!==0)throw Error('Cache reset must release entries and counters');
    await click('#performance-close');
  }
  async function repeat(label){
    await raw("document.querySelector('#preview > div').dataset.paperProbe='old'");
    await measure(label,'book',()=>click('#preview-book'),"document.querySelector('#preview > div').dataset.paperProbe!=='old'");
    if(await paperSignature()!==cachedPaper)throw Error('Cache comparison page DOM differs: '+label);
  }
  async function readComparisonStats(enabled,mathEnabled=false){
    await click('#performance-toggle');
    const stats=await cacheStats(),phase=await readPhaseSample('book',enabled,mathEnabled);
    await click('#performance-close');
    return {stats,phase};
  }
  let finalCache;
  const phaseComparisons=[];
  for(const {pair,order} of cacheComparisonPlan()){
    for(const arm of order){
      const enabled=arm==='warm';
      await setComparisonCache(enabled);
      await repeat('cache-prime-'+pair+'-'+arm);
      const prime=await readComparisonStats(enabled);
      await repeat('cache-pair-'+pair+'-'+arm);
      const repeatResult=await readComparisonStats(enabled);
      if(repeatResult.phase.count!==prime.phase.count+1)throw Error('Expected exactly one new phase sample in pair '+pair+' '+arm);
      phaseComparisons.push({pair,arm,timings:repeatResult.phase.timings});
      const primed=prime.stats,repeated=repeatResult.stats;
      if(enabled){
        if(primed.entries<=0||repeated.entries<=0||repeated.hits<=primed.hits)
          throw Error('Expected additional warm cache hits in pair '+pair);
        finalCache=repeated;
      }else if([primed,repeated].some(s=>s.entries!==0||s.hits!==0||s.misses!==0))
        throw Error('Disabled cache accumulated data in pair '+pair);
    }
  }
  const cacheComparison=summarizeCacheComparison(samples);
  // Hold text caching off to isolate the math cache contribution.
  await setComparisonCache(false);
  async function setMathComparison(enabled){
    await click('#performance-toggle');
    const checked=()=>raw("document.querySelector('#performance-math-cache-enabled').checked");
    if(await checked())await click('#performance-math-cache-enabled');
    if(enabled)await click('#performance-math-cache-enabled');
    if(await checked()!==enabled||!mathEmpty(await mathStats()))throw Error('Math cache toggle/reset failed');
    await click('#performance-close');
  }
  async function readMathComparison(enabled){
    await click('#performance-toggle');
    const stats=await mathStats(),phase=await readPhaseSample('book',false,enabled);
    await click('#performance-close');return {stats,phase};
  }
  const mathComparisons=[];
  for(const {pair,order} of cacheComparisonPlan()){
    for(const arm of order){
      const enabled=arm==='warm';
      await setMathComparison(enabled);
      await repeat('math-prime-'+pair+'-'+arm);
      const prime=await readMathComparison(enabled);
      const label='math-pair-'+pair+'-'+arm;
      await repeat(label);
      const after=await readMathComparison(enabled);
      if(after.phase.count!==prime.phase.count+1)throw Error('Expected one math phase sample');
      if(enabled){
        if(prime.stats.inlineMathCache.entries<=0||after.stats.inlineMathCache.hits<=prime.stats.inlineMathCache.hits||after.stats.mathCache.hits<=prime.stats.mathCache.hits)
          throw Error('Expected warm math cache reuse');
      }else if(!mathEmpty(prime.stats)||!mathEmpty(after.stats))throw Error('Disabled math cache accumulated data');
      mathComparisons.push({pair,arm,elapsedMs:samples.find(s=>s.label===label).elapsedMs,timings:after.phase.timings,prime:prime.stats,after:after.stats});
    }
  }
  const mathComparison=summarizeCacheComparison(mathComparisons.map(s=>({label:'cache-pair-'+s.pair+'-'+s.arm,scope:'book',elapsedMs:s.elapsedMs})));
  await setMathComparison(true);
  // Restore and populate the cache so the session-release assertion is not vacuous.
  await setComparisonCache(true);
  await repeat('cache-session-release-prime');
  const releasePrime=await readComparisonStats(true,true);
  if(releasePrime.stats.entries<=0)throw Error('Expected populated cache before book session release');
  await click('#performance-toggle');
  const releaseMath=await mathStats();
  if(releaseMath.inlineMathCache.entries<=0||releaseMath.mathCache.entries<=0)throw Error('Expected populated math cache before session release');
  const summary=await raw("Array.from(document.querySelectorAll('#performance-summary tbody tr')).map(tr=>({stage:tr.dataset.stage,category:tr.dataset.category,values:Array.from(tr.querySelectorAll('td')).map(td=>td.textContent)}))");
  await click('#performance-close');await click('#mode-home');await click('#open');
  await until('cache session reopened',"document.querySelector('.workspace-shell').dataset.workspaceMode==='writing'&&!document.querySelector('#open').disabled&&!document.querySelector('#source').value");
  await click('#performance-toggle');
  if((await cacheStats()).entries!==0||!mathEmpty(await mathStats()))throw Error('Cache entries survived book reopen');
  await click('#performance-close');
  await setComparisonCache(false);await setMathComparison(false);
  console.log('BENCH report '+JSON.stringify({version:6,fixtureVersion:2,cacheComparison,phaseComparisons,mathComparison,mathComparisons,chapters:fixture.chapters.map(c=>({id:c.id,characters:c.source.length,sections:c.sections,blocks:c.blocks})),initialMemory,finalMemory:memory(),samples,summary,baselineCache,baselineMath,finalCache}));
}
