// Isolated paired real-input benchmark. Browser-side MutationObserver clocks
// exclude IPC/polling delay; they measure DOM availability, not actual paint.
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {summarizeCacheComparison,cacheComparisonPlan} from './benchmark-comparison.mjs';

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
    {id:'math',from:'x^2+2x+1',to:'x^2+3x+1'}
  ];
  // Install observers and send the actual input event in one browser task.
  // The provisional marker is read at the task boundary before final commit.
  async function edit(value){
    await raw("("+function(source){
      const viewport=document.querySelector('#preview'),host=viewport.firstElementChild,state=document.querySelector('#workspace-layout-state'),input=document.querySelector('#source');
      viewport.scrollTop=0;input.focus();
      const probe={started:performance.now(),provisionalMs:null,finalMs:null};
      const observer=new MutationObserver(()=>{
        const current=viewport.firstElementChild;
        if(probe.provisionalMs===null&&current===host&&Number(host.dataset.provisionalPages)>0)probe.provisionalMs=performance.now()-probe.started;
        if(probe.finalMs===null&&current?.dataset.paperFreshness==='current'&&state.dataset.phase==='ready'&&!current.inert){
          probe.finalMs=performance.now()-probe.started;observer.disconnect();
        }
      });
      observer.observe(viewport,{childList:true});
      observer.observe(host,{attributes:true,attributeFilter:['data-paper-freshness','data-provisional-pages','inert']});
      observer.observe(state,{attributes:true,attributeFilter:['data-phase']});
      window.__bcRetainedEditBenchmark={probe,observer};
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,source);
      input.dispatchEvent(new Event('input',{bubbles:true}));
    }.toString()+")("+JSON.stringify(value)+")");
    try{
      await until('retained benchmark input committed',ready('manuscript')+"&&window.__bcRetainedEditBenchmark.probe.finalMs!==null&&document.querySelector('#source').value==="+JSON.stringify(value));
      return await raw("(()=>{const h=document.querySelector('#preview > div'),p=window.__bcRetainedEditBenchmark.probe;return {...p,pages:h.shadowRoot.children.length,work:h.dataset.retainedWork?JSON.parse(h.dataset.retainedWork):null,focus:document.activeElement.id==='source',clean:!h.dataset.provisionalPages&&!h.shadowRoot.querySelector('[data-provisional-layer]')};})()");
    }finally{await raw("window.__bcRetainedEditBenchmark?.observer.disconnect();delete window.__bcRetainedEditBenchmark");}
  }
  const samples=[];
  for(const item of cases){
    const edited=large.source.replace(item.from,item.to);
    if(edited===large.source||edited.length!==large.source.length)throw Error('Invalid retained edit fixture '+item.id);
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
        const sample=await edit(edited),signature=await paperSignature();
        if(signature===original||oracle!==undefined&&signature!==oracle)throw Error('Retained benchmark paper parity failed '+item.id);
        oracle=signature;
        if(!sample.focus||!sample.clean||!Number.isFinite(sample.finalMs)||sample.finalMs<0||sample.provisionalMs!==null&&(!Number.isFinite(sample.provisionalMs)||sample.provisionalMs<0||sample.provisionalMs>sample.finalMs))throw Error('Invalid retained benchmark sample');
        if(retained&&(!sample.work||sample.work.measurement.reusedBlocks<1||sample.work.pagination.reusedBlocks<1))throw Error('Retained benchmark did not reuse measured/placed blocks');
        if(!retained&&(sample.work||sample.provisionalMs!==null))throw Error('Baseline used retained work');
        const {finalMs,provisionalMs,pages,work}=sample;
        samples.push({case:item.id,pair,arm,finalMs,provisionalMs,pages,work});
        await edit(large.source);
        if(await paperSignature()!==original||await readFile(join(root,'manuscript',large.id+'.md'),'utf8')!==large.source)throw Error('Retained benchmark restore failed');
      }
    }
  }
  await setRetained(false);
  const summaries=cases.map(({id})=>summarizeRetainedEditSamples(id,samples.filter(s=>s.case===id)));
  console.log('BENCH retained '+JSON.stringify({version:1,summaries,samples}));
  return {summaries,samples};
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
