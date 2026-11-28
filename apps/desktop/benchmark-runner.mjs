import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {benchmarkFixture} from './benchmark-fixture.mjs';
import {benchmarkEditorSubscription} from './benchmark-editor-subscription.mjs';
import {benchmarkRetainedEdits} from './benchmark-retained-edits.mjs';
import {cacheComparisonPlan,summarizeCacheComparison} from './benchmark-comparison.mjs';
import {benchmarkPaperSignature} from './benchmark-paper-signature.mjs';
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
      if(state.failed&&label!=='oversized blocks rejected'&&label!=='enabled #toggle-diagnostics'){
        await raw("(()=>{const b=document.querySelector('#toggle-diagnostics');if(b&&!b.disabled&&b.getAttribute('aria-expanded')==='false')b.click();})()");
        await sleep(25);
        throw Error('Benchmark failed: '+label+'; '+await raw("document.querySelector('#workspace-diagnostic-list')?.textContent||document.querySelector('#status')?.textContent"));
      }
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
  const paperSignature=()=>raw('('+benchmarkPaperSignature.toString()+")(document.querySelector('#preview > div').shadowRoot)");
  const cacheStats=()=>raw("(()=>{const e=document.querySelector('#performance-cache');return {hits:Number(e.dataset.hits),misses:Number(e.dataset.misses),entries:Number(e.dataset.entries)};})()");
  const mathStats=()=>raw("JSON.parse(document.querySelector('#performance-math-cache').dataset.stats)");
  const paragraphStats=()=>raw("JSON.parse(document.querySelector('#performance-paragraph-cache').dataset.stats)");
  const paragraphEmpty=s=>Object.values(s).every(n=>n===0);
  const pageStats=()=>raw("JSON.parse(document.querySelector('#performance-page-cache').dataset.stats)");
  const pageEmpty=s=>Object.values(s).every(n=>n===0);
  const mathEmpty=s=>Object.values(s).every(v=>v.entries===0&&v.hits===0&&v.misses===0);
  await click('#open');
  await until('open',"document.querySelector('.workspace-shell').dataset.workspaceMode==='writing'&&!document.querySelector('#open').disabled");
  // Preserve the historical full baseline; the retained comparison primes each arm explicitly.
  await click('#performance-toggle');
  if(!await raw("document.querySelector('#performance-retained-preview').checked"))throw Error('Retained preview must start enabled');
  if(!await raw("document.querySelector('#performance-short-warm-window').checked"))throw Error('Short warm window must start enabled');
  // Keep historical comparison arms at 16ms until the dedicated window trial.
  await click('#performance-short-warm-window');
  if(await raw("document.querySelector('#performance-short-warm-window').checked"))throw Error('Historical 16ms control was not selected');
  await click('#performance-retained-preview');await click('#performance-close');
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
  const editorSubscription=await benchmarkEditorSubscription({raw,click,until,ready,setSource,sleep,large});
  // Exercise the existing hard boundary separately from the successful workloads.
  await setSource(fixture.oversizedSource);
  await until('oversized input committed',"document.querySelector('#source').value==="+JSON.stringify(fixture.oversizedSource));
  await until('oversized blocks rejected',"document.querySelector('#workspace-layout-state')?.dataset.phase==='failed'");
  if(await raw("!!document.querySelector('#workspace-diagnostic-list')"))throw Error('Hidden diagnostics unexpectedly mounted');
  await click('#toggle-diagnostics');
  await until('oversized blocks rejected',"document.querySelector('#workspace-layout-state')?.dataset.phase==='failed'&&document.querySelector('#workspace-diagnostic-list')?.textContent.includes('128')&&document.querySelector('#preview > div')?.dataset.paperFreshness==='previous'&&document.querySelector('#preview > div').inert");
  await measure('large-limit-recovery','manuscript',()=>setSource(large.source),"document.querySelector('#workspace-save-state').textContent==='保存済み'");
  await measure('whole-book-open','book',()=>click('#mode-layout'));
  await raw("document.querySelector('#preview > div').dataset.paperProbe='old'");
  await measure('whole-book-repeat','book',()=>click('#preview-book'),"document.querySelector('#preview > div').dataset.paperProbe!=='old'");
  for(const c of fixture.chapters)if(await readFile(join(root,'manuscript',c.id+'.md'),'utf8')!==c.source)throw Error('Benchmark changed a saved manuscript');
  if(await readFile(join(root,'book.yaml'),'utf8')!==fixture.manifest)throw Error('Benchmark changed manifest');
  await click('#performance-toggle');
  await until('metrics',"document.querySelector('#performance-summary tbody tr[data-stage=layout][data-category=book]')?.dataset.success>0&&document.querySelector('#performance-memory')?.dataset.phase==='ready'");
  function phaseSelector(scope,enabled,mathEnabled=false,paragraphEnabled=false,pageEnabled=false,reuseEnabled=false){
    return '#performance-phase-summary tr[data-scope='+scope+'][data-cache-enabled='+String(enabled)+'][data-math-cache-enabled='+String(mathEnabled)+'][data-paragraph-cache-enabled='+String(paragraphEnabled)+'][data-page-cache-enabled='+String(pageEnabled)+'][data-reuse-paper-pages='+String(reuseEnabled)+'][data-sparse-paper-pages=false][data-retained-preview=false]';
  }
  function validatePhaseSample(sample,scope,enabled){
    if(!sample||!Number.isSafeInteger(sample.count)||sample.count<1||
      Object.keys(sample.timings).length!==phaseKeys.length||!phaseKeys.every(k=>Number.isFinite(sample.timings[k])&&sample.timings[k]>=0))
      throw Error('Missing or invalid phase metrics: '+scope+' '+enabled);
    return sample;
  }
  async function readPhaseSample(scope,enabled,mathEnabled=false,paragraphEnabled=false,pageEnabled=false,reuseEnabled=false){
    const selector=phaseSelector(scope,enabled,mathEnabled,paragraphEnabled,pageEnabled,reuseEnabled);
    const sample=await raw("(()=>{const e=document.querySelector("+JSON.stringify(selector)+");return e?{count:Number(e.dataset.count),timings:JSON.parse(e.dataset.latest)}:null;})()");
    return validatePhaseSample(sample,scope,enabled);
  }
  await readPhaseSample('manuscript',false,false,true);
  await readPhaseSample('book',false,false,true);
  const baselineCache=await cacheStats(),baselineMath=await mathStats(),baselineParagraph=await paragraphStats(),baselinePage=await pageStats();
  if(await raw("document.querySelector('#performance-page-cache-enabled').checked")||!pageEmpty(baselinePage))throw Error('Experimental page cache must start disabled and empty');
  if(await raw("document.querySelector('#performance-cache-enabled').checked||document.querySelector('#performance-math-cache-enabled').checked||!document.querySelector('#performance-paragraph-cache-enabled').checked")||Object.values(baselineCache).some(n=>n!==0)||!mathEmpty(baselineMath)||baselineParagraph.entries<=0||baselineParagraph.hits<=0||baselineParagraph.misses<=0)throw Error('Expected default incremental cache reuse and disabled legacy caches');
  // Keep each paired comparison isolated from the default incremental mode.
  await click('#performance-paragraph-cache-enabled');
  if(await raw("document.querySelector('#performance-paragraph-cache-enabled').checked")||!paragraphEmpty(await paragraphStats()))throw Error('Default paragraph cache was not disabled and released');
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
    const actual=await paperSignature();
    if(actual!==cachedPaper){
      // This runner uses only the deterministic synthetic book, never user text.
      const expectedPages=JSON.parse(cachedPaper),actualPages=JSON.parse(actual);
      const index=expectedPages.findIndex((page,i)=>page!==actualPages[i]);
      const expected=expectedPages[index]??'',received=actualPages[index]??'';
      let offset=0;while(offset<Math.min(expected.length,received.length)&&expected[offset]===received[offset])offset++;
      const details=await raw("(()=>{const p=document.querySelector('#preview > div')?.shadowRoot?.querySelectorAll('[data-page]')["+index+"];return {page:p?.dataset.page,blocks:p?.querySelectorAll('[data-block]').length,math:p?.querySelectorAll('math').length,guide:p?.querySelector('[data-content-guide]')?.getAttribute('style')};})()");
      await click('#performance-toggle');
      const counters={page:await pageStats(),paragraph:await paragraphStats(),cache:await cacheStats(),math:await mathStats()};
      await click('#performance-close');
      console.error('BENCH paper mismatch '+JSON.stringify({label,index,offset,expectedCount:expectedPages.length,actualCount:actualPages.length,expectedLength:expected.length,actualLength:received.length,expectedContext:expected.slice(Math.max(0,offset-120),offset+240),actualContext:received.slice(Math.max(0,offset-120),offset+240),details,counters}));
      throw Error('Cache comparison page DOM differs: '+label);
    }
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
  // Compare incremental paragraph plans without either legacy cache.
  await setMathComparison(false);
  async function setParagraphComparison(enabled){
    await click('#performance-toggle');
    const checked=()=>raw("document.querySelector('#performance-paragraph-cache-enabled').checked");
    if(await checked())await click('#performance-paragraph-cache-enabled');
    if(enabled)await click('#performance-paragraph-cache-enabled');
    if(await checked()!==enabled||!paragraphEmpty(await paragraphStats()))throw Error('Paragraph cache toggle/reset failed');
    if(await raw("document.querySelector('#performance-cache-enabled').checked||document.querySelector('#performance-math-cache-enabled').checked"))throw Error('Paragraph comparison requires both legacy caches disabled');
    await click('#performance-close');
  }
  async function readParagraphComparison(scope,enabled){
    await click('#performance-toggle');
    const stats=await paragraphStats(),phase=await readPhaseSample(scope,false,false,enabled);
    await click('#performance-close');return {stats,phase};
  }
  const paragraphComparisons=[];
  for(const {pair,order} of cacheComparisonPlan()){
    for(const arm of order){
      const enabled=arm==='warm';
      await setParagraphComparison(enabled);
      await repeat('paragraph-prime-'+pair+'-'+arm);
      const prime=await readParagraphComparison('book',enabled);
      const label='paragraph-pair-'+pair+'-'+arm;
      await repeat(label);
      const after=await readParagraphComparison('book',enabled);
      if(after.phase.count!==prime.phase.count+1)throw Error('Expected one paragraph phase sample');
      if(enabled){
        if(prime.stats.entries<=0||after.stats.hits<=prime.stats.hits||after.stats.misses!==prime.stats.misses)
          throw Error('Expected unchanged full-book paragraph plans to be reused');
      }else if(!paragraphEmpty(prime.stats)||!paragraphEmpty(after.stats))throw Error('Disabled paragraph cache accumulated data');
      paragraphComparisons.push({pair,arm,elapsedMs:samples.find(s=>s.label===label).elapsedMs,timings:after.phase.timings,prime:prime.stats,after:after.stats});
    }
  }
  const paragraphComparison=summarizeCacheComparison(paragraphComparisons.map(s=>({label:'cache-pair-'+s.pair+'-'+s.arm,scope:'book',elapsedMs:s.elapsedMs})));
  await setParagraphComparison(false);
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
  await setParagraphComparison(true);
  await measure('paragraph-session-release-prime','manuscript',()=>click('[data-section=small]'),"document.querySelector('#source').value==="+JSON.stringify(fixture.chapters[0].source));
  await click('#performance-toggle');
  if((await paragraphStats()).entries<=0)throw Error('Expected populated paragraph cache before book session release');
  await click('#performance-close');await click('#mode-home');await click('#open');
  await until('paragraph session reopened',"document.querySelector('.workspace-shell').dataset.workspaceMode==='writing'&&!document.querySelector('#open').disabled&&!document.querySelector('#source').value");
  await click('#performance-toggle');
  if(!paragraphEmpty(await paragraphStats()))throw Error('Paragraph cache survived book reopen');
  await click('#performance-close');await setParagraphComparison(false);
  // The previous session-release check leaves us in writing mode with no file
  // selected and all experimental caches off. Measure actual source input, not
  // another explicit refresh. Change exactly one existing paragraph, not a
  // new block, and restore the synthetic manuscript after every arm.
  const edited=large.source.replace('実測組版を確認します。','増分組版を確認します。');
  if(edited===large.source||edited.length!==large.source.length||edited.split('増分組版を確認します。').length!==2)throw Error('Invalid single-paragraph edit fixture');
  await measure('paragraph-edit-open','manuscript',()=>click('[data-section='+large.id+']'),"document.querySelector('#source').value==="+JSON.stringify(large.source));
  if(!await raw("document.querySelector('#live-preview').checked"))throw Error('Live edit benchmark needs automatic preview');
  const originalPaper=await paperSignature();
  const paragraphEditComparisons=[];
  for(const {pair,order} of cacheComparisonPlan()){
    let editedPaper;
    for(const arm of order){
      const enabled=arm==='warm';
      await setParagraphComparison(enabled);
      await raw("document.querySelector('#preview > div').dataset.paperProbe='old'");
      const primeLabel='paragraph-edit-prime-'+pair+'-'+arm;
      await measure(primeLabel,'manuscript',()=>click('#preview-button'),"document.querySelector('#preview > div').dataset.paperProbe!=='old'");
      if(await paperSignature()!==originalPaper)throw Error('Live edit prime differs from original paper');
      const prime=await readParagraphComparison('manuscript',enabled);
      if(enabled&&prime.stats.entries<=0)throw Error('Live edit prime must retain paragraph plans');
      await raw("document.querySelector('#source').focus()");
      const label='paragraph-edit-pair-'+pair+'-'+arm;
      await measure(label,'manuscript',()=>setSource(edited),paperText('増分組版を確認します。')+"&&document.activeElement.id==='source'");
      const signature=await paperSignature();
      if(signature===originalPaper)throw Error('Live edit did not change paper');
      if(editedPaper===undefined)editedPaper=signature;
      else if(editedPaper!==signature)throw Error('Live edit paper differs between modes');
      const after=await readParagraphComparison('manuscript',enabled);
      if(after.phase.count!==prime.phase.count+1)throw Error('Expected one successful live edit phase sample');
      if(enabled){
        if(after.stats.misses-prime.stats.misses!==1||after.stats.hits<=prime.stats.hits)throw Error('Expected only the edited paragraph to be remeasured');
      }else if(!paragraphEmpty(prime.stats)||!paragraphEmpty(after.stats))throw Error('Disabled paragraph cache accumulated data during edit');
      paragraphEditComparisons.push({pair,arm,elapsedMs:samples.find(s=>s.label===label).elapsedMs,
        primeElapsedMs:samples.find(s=>s.label===primeLabel).elapsedMs,primeTimings:prime.phase.timings,timings:after.phase.timings,prime:prime.stats,after:after.stats});
      await raw("document.querySelector('#source').focus()");
      await measure('paragraph-edit-restore-'+pair+'-'+arm,'manuscript',()=>setSource(large.source),"!"+paperText('増分組版を確認します。')+"&&document.querySelector('#workspace-save-state').textContent==='保存済み'");
      if(await paperSignature()!==originalPaper||await readFile(join(root,'manuscript',large.id+'.md'),'utf8')!==large.source)throw Error('Live edit fixture not restored');
    }
  }
  await setParagraphComparison(true);
  const paragraphEditComparison=summarizeCacheComparison(paragraphEditComparisons.map(s=>({label:'cache-pair-'+s.pair+'-'+s.arm,scope:'manuscript',elapsedMs:s.elapsedMs})),'manuscript');
  // Hold incremental paragraph measurement enabled and isolate page templates.
  await measure('page-comparison-open','book',()=>click('#mode-layout'));
  if(await paperSignature()!==cachedPaper)throw Error('Page comparison baseline paper differs');
  async function setPageComparison(enabled){
    await click('#performance-toggle');
    const checked=()=>raw("document.querySelector('#performance-page-cache-enabled').checked");
    if(await checked())await click('#performance-page-cache-enabled');
    if(enabled)await click('#performance-page-cache-enabled');
    if(await checked()!==enabled||!pageEmpty(await pageStats()))throw Error('Page cache toggle/reset failed');
    if(!await raw("document.querySelector('#performance-paragraph-cache-enabled').checked&&!document.querySelector('#performance-cache-enabled').checked&&!document.querySelector('#performance-math-cache-enabled').checked"))throw Error('Page comparison requires only incremental paragraph cache enabled');
    await click('#performance-close');
  }
  async function readPageComparison(enabled){
    await click('#performance-toggle');
    const stats=await pageStats(),phase=await readPhaseSample('book',false,false,true,enabled),paragraph=await paragraphStats();
    await click('#performance-close');return {stats,phase,paragraph};
  }
  const pageComparisons=[];
  for(const {pair,order} of cacheComparisonPlan()){
    for(const arm of order){
      const enabled=arm==='warm';
      await setParagraphComparison(true);
      await setPageComparison(enabled);
      await repeat('page-prime-'+pair+'-'+arm);
      const prime=await readPageComparison(enabled);
      const label='page-pair-'+pair+'-'+arm;
      await repeat(label);
      const after=await readPageComparison(enabled);
      const sample=samples.find(s=>s.label===label);
      if(after.phase.count!==prime.phase.count+1)throw Error('Expected one page phase sample');
      if(after.paragraph.misses!==prime.paragraph.misses||after.paragraph.hits<=prime.paragraph.hits)throw Error('Expected warm paragraph reuse in both page arms');
      if(enabled){
        if(prime.stats.entries<=0||after.stats.hits<=prime.stats.hits)throw Error('Expected warm page template reuse');
        if(['hits','misses','bypasses'].reduce((n,k)=>n+after.stats[k]-prime.stats[k],0)!==sample.pages)throw Error('Page cache counters must cover every page');
      }else if(!pageEmpty(prime.stats)||!pageEmpty(after.stats))throw Error('Disabled page cache accumulated data');
      pageComparisons.push({pair,arm,elapsedMs:sample.elapsedMs,pages:sample.pages,memory:sample.memory,timings:after.phase.timings,prime:prime.stats,after:after.stats});
    }
  }
  const pageComparison=summarizeCacheComparison(pageComparisons.map(s=>({label:'cache-pair-'+s.pair+'-'+s.arm,scope:'book',elapsedMs:s.elapsedMs})));
  await setPageComparison(true);
  await repeat('page-session-release-prime');
  if((await readPageComparison(true)).stats.entries<=0)throw Error('Expected populated page cache before book session release');
  await click('#mode-home');await click('#open');
  await until('page session reopened',"document.querySelector('.workspace-shell').dataset.workspaceMode==='writing'&&!document.querySelector('#open').disabled&&!document.querySelector('#source').value");
  await click('#performance-toggle');
  if(!pageEmpty(await pageStats()))throw Error('Page cache survived book reopen');
  await click('#performance-close');await setPageComparison(false);
  // Compare real edits with warm incremental paragraphs, but without the
  // page template cache. A new host primes every arm, even the partial mode.
  async function setPartial(enabled){
    await click('#performance-toggle');
    const checked=()=>raw("document.querySelector('#performance-reuse-paper-pages').checked");
    if(await checked()!==enabled)await click('#performance-reuse-paper-pages');
    if(await checked()!==enabled)throw Error('Partial publication toggle failed');
    if(!await raw("document.querySelector('#performance-paragraph-cache-enabled').checked&&!document.querySelector('#performance-page-cache-enabled').checked&&!document.querySelector('#performance-cache-enabled').checked&&!document.querySelector('#performance-math-cache-enabled').checked"))throw Error('Partial comparison requires only incremental paragraphs');
    await click('#performance-close');
  }
  async function readPartial(enabled){
    await click('#performance-toggle');
    // Read both snapshots in the same browser task and from the exact mode.
    const selector=phaseSelector('manuscript',false,false,true,false,enabled);
    const {phase,stats}=await raw("(()=>{const e=document.querySelector("+JSON.stringify(selector)+");return {phase:e?{count:Number(e.dataset.count),timings:JSON.parse(e.dataset.latest)}:null,stats:JSON.parse(document.querySelector('#performance-paragraph-cache').dataset.stats)};})()");
    await click('#performance-close');return {phase:validatePhaseSample(phase,'manuscript',false),stats};
  }
  await setPartial(false);
  await measure('partial-open','manuscript',()=>click('[data-section='+large.id+']'),"document.querySelector('#source').value==="+JSON.stringify(large.source));
  if(await paperSignature()!==originalPaper)throw Error('Partial baseline differs');
  const partialComparisons=[];
  // This comparison deliberately measures an already-warm paragraph cache.
  // The performance panel itself introduces Japanese glyphs from lazy CSS
  // font subsets. Load the fixture and UI glyph coverage before priming.
  await click('#performance-toggle');
  await raw(`(async()=>{const text=document.body.textContent+' '+${JSON.stringify(edited)};await Promise.all([document.fonts.load('400 16px BCFont_NotoSansJP',text),document.fonts.load('700 16px BCFont_NotoSansJP',text)]);await document.fonts.ready;})()`);
  await click('#performance-close');
  await raw('document.fonts.ready.then(()=>true)');
  // Diagnostic only: identify environment invalidation without weakening the
  // exact one-miss assertion or changing the measured editing path.
  await raw(`(()=>{
    const faces=new WeakMap();let next=0,events=[];
    const snapshot=()=>({scale:devicePixelRatio,fontStatus:document.fonts.status,
      faces:[...document.fonts].map(f=>{const descriptors=JSON.stringify([f.family,f.style,f.weight,f.stretch,f.unicodeRange,f.ascentOverride,f.descentOverride,f.lineGapOverride,f.featureSettings,f.variationSettings]);let entry=faces.get(f);if(!entry){entry={identity:++next,descriptors,revision:0};faces.set(f,entry);}else if(entry.descriptors!==descriptors){entry.descriptors=descriptors;entry.revision++;}return {identity:entry.identity,family:f.family,status:f.status,descriptorRevision:entry.revision};}),
      visibility:document.visibilityState});
    const record=event=>{events.push({event:event.type,at:performance.now(),environment:snapshot()});if(events.length>64)events.shift();};
    const types=['loading','loadingdone','loadingerror'];
    for(const type of types)document.fonts.addEventListener(type,record);
    window.addEventListener('resize',record);
    document.addEventListener('visibilitychange',record);
    window.__bcPartialEnvironment={start:()=>{events=[];return snapshot();},read:()=>({environment:snapshot(),events:[...events]}),close:()=>{for(const type of types)document.fonts.removeEventListener(type,record);window.removeEventListener('resize',record);document.removeEventListener('visibilitychange',record);delete window.__bcPartialEnvironment;}};
  })()`);
  for(const {pair,order} of cacheComparisonPlan()){
    let editedPaper;
    for(const arm of order){
      const enabled=arm==='warm';
      await setPartial(false);
      await setParagraphComparison(true);
      await raw('document.fonts.ready.then(()=>true)');
      await raw("document.querySelector('#preview > div').dataset.paperProbe='old'");
      await measure('partial-prime-'+pair+'-'+arm,'manuscript',()=>click('#preview-button'),"document.querySelector('#preview > div').dataset.paperProbe!=='old'");
      if(await paperSignature()!==originalPaper)throw Error('Partial prime differs');
      const prime=await readPartial(false);
      const primeEnvironment=await raw('window.__bcPartialEnvironment.start()');
      await setPartial(enabled);
      // A first partial-mode sample does not exist until the edit succeeds.
      await click('#performance-toggle');
      const selector=phaseSelector('manuscript',false,false,true,false,enabled);
      const beforeCount=await raw("Number(document.querySelector("+JSON.stringify(selector)+")?.dataset.count??0)");
      await click('#performance-close');
      await raw("(()=>{const h=document.querySelector('#preview > div');window.__bcPartialBenchmark={host:h,pages:[...h.shadowRoot.querySelectorAll('[data-page]')]};document.querySelector('#source').focus();})()");
      const beforeEnvironment=await raw('window.__bcPartialEnvironment.read()');
      const label='partial-edit-pair-'+pair+'-'+arm;
      await measure(label,'manuscript',()=>setSource(edited),paperText('増分組版を確認します。')+"&&document.activeElement.id==='source'");
      const identity=await raw("(()=>{const h=document.querySelector('#preview > div'),old=window.__bcPartialBenchmark,p=[...h.shadowRoot.querySelectorAll('[data-page]')];delete window.__bcPartialBenchmark;return {sameHost:h===old.host,reused:p.filter((n,i)=>n===old.pages[i]).length,reported:Number(h.dataset.reusedPages),pages:p.length};})()");
      if(identity.reported!==identity.reused||identity.sameHost!==enabled||(enabled?(identity.reused<=0||identity.reused>=identity.pages):identity.reused!==0))throw Error('Unexpected partial publication identity: '+JSON.stringify(identity));
      const signature=await paperSignature();
      if(signature===originalPaper)throw Error('Partial edit did not change paper');
      if(editedPaper===undefined)editedPaper=signature;
      else if(editedPaper!==signature)throw Error('Partial edit paper differs between modes');
      const after=await readPartial(enabled);
      const afterEnvironment=await raw('window.__bcPartialEnvironment.read()');
      if(after.phase.count!==beforeCount+1||after.stats.misses-prime.stats.misses!==1||after.stats.hits<=prime.stats.hits)throw Error('Expected one edit and one remeasured paragraph: '+JSON.stringify({label,beforeCount,afterCount:after.phase.count,prime:prime.stats,after:after.stats,missDelta:after.stats.misses-prime.stats.misses,hitDelta:after.stats.hits-prime.stats.hits,identity,primeEnvironment,beforeEnvironment,afterEnvironment}));
      const sample=samples.find(s=>s.label===label);
      partialComparisons.push({pair,arm,elapsedMs:sample.elapsedMs,timings:after.phase.timings,memory:sample.memory,identity});
      await raw("document.querySelector('#source').focus()");
      await measure('partial-restore-'+pair+'-'+arm,'manuscript',()=>setSource(large.source),"!"+paperText('増分組版を確認します。')+"&&document.querySelector('#workspace-save-state').textContent==='保存済み'");
      if(await paperSignature()!==originalPaper||await readFile(join(root,'manuscript',large.id+'.md'),'utf8')!==large.source)throw Error('Partial edit fixture not restored');
    }
  }
  await setPartial(false);
  await raw('window.__bcPartialEnvironment.close()');
  const partialComparison=summarizeCacheComparison(partialComparisons.map(s=>({label:'cache-pair-'+s.pair+'-'+s.arm,scope:'manuscript',elapsedMs:s.elapsedMs})),'manuscript');
  const retainedEdits=await benchmarkRetainedEdits({raw,click,until,ready,paperSignature,large,root});
  const positionDrag=await benchmarkBookPositionDrag({win,raw,click,until,ready,paperSignature,root,fixture});
  console.log('BENCH report '+JSON.stringify({version:13,fixtureVersion:2,editorSubscription,retainedEdits,positionDrag,defaultParagraphCacheEnabled:true,partialComparison,partialComparisons,baselinePage,pageComparison,pageComparisons,paragraphEditComparison,paragraphEditComparisons,cacheComparison,phaseComparisons,mathComparison,mathComparisons,paragraphComparison,paragraphComparisons,chapters:fixture.chapters.map(c=>({id:c.id,characters:c.source.length,sections:c.sections,blocks:c.blocks})),initialMemory,finalMemory:memory(),samples,summary,baselineCache,baselineMath,baselineParagraph,finalCache}));
}


// Real GUI drag on the existing synthetic long book; never persist a proposal.
// Add an ID only after the historical comparison arms have finished.
async function benchmarkBookPositionDrag({win,raw,click,until,ready,paperSignature,root,fixture}){
  const small=fixture.chapters[0],path=join(root,'manuscript',small.id+'.md');
  const source=small.source.replace(':::component{name="example"}',':::component{name="example" #bench-drag}');
  if(source===small.source)throw Error('Missing drag fixture');
  await click('#mode-home');
  await writeFile(path,source);
  try{
    await click('#open');
    await until('drag project reopened',"document.querySelector('.workspace-shell').dataset.workspaceMode==='writing'&&!!document.querySelector('[data-section=small]')");
    await click('[data-section=small]');
    await until('drag source loaded',"document.querySelector('#source').value==="+JSON.stringify(source));
    await click('#performance-toggle');
    const pageCache="#performance-page-cache-enabled";
    if(await raw("document.querySelector("+JSON.stringify(pageCache)+").checked"))await click(pageCache);
    await click('#performance-close');
    await click('#mode-layout');
    await click('#paper-area-apply-saved');
    await click('#preview-book');
    await until('drag full IL paper',ready('book'));
    const pages=await raw("document.querySelector('#preview > div').shadowRoot.querySelectorAll('[data-page]').length");
    if(pages<10)throw Error('Long-book drag fixture is too small: '+pages);
    const baseline=await paperSignature();
    await click('#paper-edit-mode');
    const target="(()=>{const r=document.querySelector('#preview > div').shadowRoot;return [...r.querySelectorAll('[data-block]')].find(n=>n.dataset.document==='small'&&n.textContent.includes('例題の本文です。'));})()";
    const phase=p=>"(!!document.querySelector('[data-position-phase="+p+"]'))";
    const dragState=()=>raw("(()=>{const h=document.querySelector('#book-paper-position-drag'),r=h?.getBoundingClientRect();return {handle:h?{...h.dataset,rect:r?.toJSON()}:null,focused:document.hasFocus(),active:document.activeElement?.id,hit:r?document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.outerHTML.slice(0,300):null,viewport:{width:innerWidth,height:innerHeight},panel:document.querySelector('.book-position-panel')?.getBoundingClientRect().toJSON(),phase:[...document.querySelectorAll('[data-position-phase]')].map(e=>({phase:e.dataset.positionPhase,text:e.textContent}))};})()");
    const readTiming=async p=>{
      const failure=p.replace('-ready','-conflict');
      await until('drag '+p,phase(p)+"||"+phase(failure));
      const state=await dragState();
      if(state.phase.some(x=>x.phase===failure))throw Error('Position draft conflict: '+JSON.stringify(state));
      const row=await raw("(()=>{const e=document.querySelector('[data-position-phase="+p+"]');return {elapsedMs:Number(e.dataset.elapsedMs),queueMs:Number(e.dataset.queueMs),measurementWork:e.dataset.measurementWork?JSON.parse(e.dataset.measurementWork):null};})()");
      if(![row.elapsedMs,row.queueMs].every(n=>Number.isFinite(n)&&n>=0))throw Error('Invalid position timing');
      return row;
    };
    const rows=[];
    // Electron sendInputEvent requires a focused window. Keep the historical
    // benchmark hidden until this final, genuinely interactive workload.
    win.show();win.focus();win.webContents.focus();
    await until('drag window focused','document.hasFocus()');
    for(let i=0;i<4;i++){
      await raw(target+".scrollIntoView({block:'center',inline:'center'})");
      await raw("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
      await raw(target+".click()");
      await click('#book-paper-preferred-mode');
      if(!await raw("document.querySelector('.book-paper-toolbar')?.dataset.tool==='preferred'&&!document.querySelector('#book-paper-position-mode')&&!document.querySelector('#book-paper-fixed-toggle')&&!document.querySelector('#book-paper-group-mode')&&!document.querySelector('#book-paper-area-undo')&&!document.querySelector('#book-paper-block-up')"))throw Error('Unrelated tools exposed during preferred position editing');
      await until('drag handle',"document.querySelector('#book-paper-position-drag')?.dataset.geometryAvailable==='true'");
      await raw("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
      const probe=await raw("(()=>{const h=document.querySelector('#book-paper-position-drag'),r=h.getBoundingClientRect(),d=h.dataset;for(const fx of [.5,.25,.75])for(const fy of [.5,.25,.75]){const x=Math.round(r.left+r.width*fx),y=Math.round(r.top+r.height*fy);if(document.elementFromPoint(x,y)===h)return {point:{x,y},up:Number(d.originY)/Number(d.bodyHeight)*Number(d.bodyPixels),down:(Number(d.maxY)-Number(d.originY))/Number(d.bodyHeight)*Number(d.bodyPixels)};}return null;})()");
      if(!probe)throw Error('Position drag handle is obscured: '+JSON.stringify(await dragState()));
      const {point,up,down}=probe,step=8+i*2;
      const delta=down>=step+1?step:up>=step+1?-step:0;
      if(!delta)throw Error('No valid vertical movement in drag fixture: '+JSON.stringify(probe));
      const end={x:point.x,y:point.y+delta};
      const started=performance.now();
      win.webContents.sendInputEvent({type:'mouseMove',...point});
      win.webContents.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1});
      try{
        await until('drag pointer captured',"document.querySelector('#book-paper-position-drag')?.dataset.dragging==='true'").catch(async e=>{throw Error(e.message+'; '+JSON.stringify(await dragState()));});
        win.webContents.sendInputEvent({type:'mouseMove',...end,button:'left',modifiers:['leftButtonDown']});
        const geometry=await readTiming('geometry-ready').catch(async e=>{throw Error(e.message+'; '+JSON.stringify(await dragState()));});
        const pointerToGuideMs=performance.now()-started;
        const drop=performance.now();
        win.webContents.sendInputEvent({type:'mouseUp',...end,button:'left',clickCount:1});
        const paper=await readTiming('paper-ready');
        const dropToPaperMs=performance.now()-drop;
        if(!paper.measurementWork||!['measuredBlocks','reusedBlocks','bypassedBlocks','sharedSnapshotEntries'].every(k=>Number.isSafeInteger(paper.measurementWork[k])&&paper.measurementWork[k]>=0)||paper.measurementWork.reusedBlocks<1)throw Error('Expected retained published measurement reuse: '+JSON.stringify(paper));
        if(!await raw("!!document.querySelector('.paper-inline-live')"))throw Error('Complete draft DOM missing');
        rows.push({sample:i+1,geometry,paper,pointerToGuideMs,dropToPaperMs});
      }finally{win.webContents.sendInputEvent({type:'mouseUp',...end,button:'left',clickCount:1});}
      await click('#book-paper-preferred-mode');
      await until('draft closed',"!document.querySelector('#book-paper-position-drag')&&!document.querySelector('.paper-inline-live')&&document.querySelector('.book-paper-toolbar')?.dataset.tool==='select'&&!!document.querySelector('#book-paper-area-undo')&&!!document.querySelector('#book-paper-group-mode')");
      if(await paperSignature()!==baseline||await readFile(path,'utf8')!==source)throw Error('Cancelled drag changed published paper or manuscript');
    }
    await raw(target+".scrollIntoView({block:'center',inline:'center'})");
    await raw("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
    await raw(target+".click()");
    await click('#book-paper-preferred-mode');
    await until('coordinate fields',"!!document.querySelector('#book-paper-coordinate-y')");
    const field=(value)=>raw("(()=>{const e=document.querySelector('#book-paper-coordinate-y');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
    const oldY=await raw("Number(document.querySelector('#book-paper-coordinate-y').value)");
    const maxY=await raw("Number(document.querySelector('#book-paper-position-drag').dataset.maxY)/1000");
    const nextY=String(Math.round((oldY+1<=maxY?oldY+1:oldY-1)*1000)/1000);
    await field('-1');
    await until('invalid coordinate rejected',"document.querySelector('#book-paper-coordinate-y').getAttribute('aria-invalid')==='true'&&document.querySelector('#book-paper-coordinate-apply').disabled&&document.querySelector('#book-paper-position-apply').disabled");
    await field(nextY);
    await until('valid coordinate staged',"!document.querySelector('#book-paper-coordinate-apply').disabled&&document.querySelector('#book-paper-position-apply').disabled");
    await click('#book-paper-coordinate-apply');
    await until('exact coordinate reflected',"document.querySelector('#book-paper-coordinate-y')?.value==="+JSON.stringify(nextY)+"&&!document.querySelector('#book-paper-coordinate-apply')").catch(async e=>{throw Error(e.message+'; '+JSON.stringify(await dragState())+'; coordinate='+await raw("document.querySelector('#book-paper-coordinate-y')?.value"));});
    await readTiming('paper-ready');
    const reflected=await raw("(()=>{const e=document.querySelector('[data-position-phase=paper-ready]');return {y:document.querySelector('#book-paper-coordinate-y').value,key:JSON.parse(e.dataset.proposalKey)};})()");
    if(reflected.y!==nextY||reflected.key[3]!==Math.round(Number(nextY)*1000))throw Error('Exact coordinate was not reflected: '+JSON.stringify({expected:nextY,reflected}));
    await raw("window.dispatchEvent(new Event('resize'))");
    await until('coordinate retained on viewport resize',"document.querySelector('#book-paper-coordinate-y')?.value==="+JSON.stringify(nextY)+"&&!!document.querySelector('[data-position-phase=paper-ready]')");
    await click('#book-paper-preferred-mode');
    await until('coordinate draft closed',"!document.querySelector('#book-paper-coordinate-y')&&!document.querySelector('.paper-inline-live')");
    if(await paperSignature()!==baseline||await readFile(path,'utf8')!==source)throw Error('Cancelled coordinate edit changed published paper or manuscript');
    await readFile(join(root,'layouts','paper-area.json')).then(()=>{throw Error('Unsaved drag persisted paper intent');},e=>{if(e.code!=='ENOENT')throw e;});
    const median=values=>{const v=[...values].sort((a,b)=>a-b);return (v[1]+v[2])/2;};
    const report={pages,samples:rows,geometryMedianMs:median(rows.map(r=>r.geometry.elapsedMs)),paperMedianMs:median(rows.map(r=>r.paper.elapsedMs)),pointerToGuideMedianMs:median(rows.map(r=>r.pointerToGuideMs)),dropToPaperMedianMs:median(rows.map(r=>r.dropToPaperMs))};
    console.log('BENCH IL position drag '+JSON.stringify(report));
    await click('#mode-home');
    return report;
  }finally{await writeFile(path,small.source);}
}
