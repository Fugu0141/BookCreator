import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {benchmarkFixture} from './benchmark-fixture.mjs';
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
  const cachedStats=await cacheStats();
  if(cachedStats.hits<=0||cachedStats.entries<=0)throw Error('Benchmark expected reuse of unchanged uniform text');
  const cachedPaper=await paperSignature();
  await click('#performance-cache-enabled');
  const disabledStats=await cacheStats();
  if(disabledStats.entries!==0||disabledStats.hits!==0)throw Error('Disabling cache must release entries');
  await click('#performance-close');
  for(let i=1;i<=3;i++){
    await raw("document.querySelector('#preview > div').dataset.paperProbe='old'");
    await measure('whole-book-uncached-'+i,'book',()=>click('#preview-book'),"document.querySelector('#preview > div').dataset.paperProbe!=='old'");
    if(await paperSignature()!==cachedPaper)throw Error('Uncached page DOM differs from cached page DOM');
  }
  await click('#performance-toggle');
  await click('#performance-cache-enabled');
  await click('#performance-close');
  for(let i=1;i<=4;i++){
    await raw("document.querySelector('#preview > div').dataset.paperProbe='old'");
    await measure(i===1?'whole-book-cache-cold':'whole-book-cache-warm-'+(i-1),'book',()=>click('#preview-book'),"document.querySelector('#preview > div').dataset.paperProbe!=='old'");
    if(await paperSignature()!==cachedPaper)throw Error('Rebuilt cached page DOM differs from original');
  }
  await click('#performance-toggle');
  const finalCache=await cacheStats();
  if(finalCache.hits<=0||finalCache.entries<=0)throw Error('Expected warm cache hits');
  const summary=await raw("Array.from(document.querySelectorAll('#performance-summary tbody tr')).map(tr=>({stage:tr.dataset.stage,category:tr.dataset.category,values:Array.from(tr.querySelectorAll('td')).map(td=>td.textContent)}))");
  await click('#performance-close');await click('#mode-home');await click('#open');
  await until('cache session reopened',"document.querySelector('.workspace-shell').dataset.workspaceMode==='writing'&&!document.querySelector('#open').disabled&&!document.querySelector('#source').value");
  await click('#performance-toggle');
  if((await cacheStats()).entries!==0)throw Error('Cache entries survived book reopen');
  console.log('BENCH report '+JSON.stringify({version:2,chapters:fixture.chapters.map(c=>({id:c.id,characters:c.source.length,sections:c.sections,blocks:c.blocks})),initialMemory,finalMemory:memory(),samples,summary,cachedStats,finalCache}));
}
