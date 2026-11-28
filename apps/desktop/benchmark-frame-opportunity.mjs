// Shown-window frame-opportunity comparison, separate from the historical
// hidden-window DOM benchmark. rAF is before paint, never a pixel assertion.
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {cacheComparisonPlan,summarizeCacheComparison} from './benchmark-comparison.mjs';

// Serialized into the renderer. No captured values or imports.
export function observeEditFrames({value,marker,timeoutMs=5000}){
  return new Promise((resolve,reject)=>{
    const viewport=document.querySelector('#preview'),state=document.querySelector('#workspace-layout-state'),input=document.querySelector('#source');
    if(document.visibilityState!=='visible'||!viewport?.getClientRects().length||!input||!state){reject(Error('Frame probe requires visible writing paper'));return;}
    viewport.scrollTop=0;viewport.scrollLeft=0;input.focus();
    const start=performance.now(),sample={domMs:null,firstCandidateFrameMs:null,finalFrameMs:null,nextFrameMs:null,provisionalFrameSeen:false};
    let frame=null,timer=null,finalHost=null,done=false;
    const clean=()=>{done=true;observer.disconnect();if(frame!==null)cancelAnimationFrame(frame);clearTimeout(timer);};
    const fail=message=>{clean();reject(Error(message));};
    const current=()=>{const h=viewport.firstElementChild;return h?.dataset.paperFreshness==='current'&&state.dataset.phase==='ready'&&!h.inert&&input.value===value&&h.shadowRoot?.textContent.includes(marker)?h:null;};
    const observer=new MutationObserver(()=>{
      if(sample.domMs!==null)return;
      const h=current();if(h){finalHost=h;sample.domMs=performance.now()-start;}
    });
    const tick=()=>{
      frame=null;if(done)return;
      if(document.visibilityState!=='visible'||!viewport.getClientRects().length||document.activeElement!==input||input.value!==value){fail('Frame probe lost visible input');return;}
      const h=viewport.firstElementChild,now=performance.now()-start;
      if(!finalHost&&Number(h?.dataset.provisionalPages)>0&&h.shadowRoot?.querySelector('[data-provisional-layer]')){
        sample.provisionalFrameSeen=true;sample.firstCandidateFrameMs??=now;
      }
      if(finalHost){
        if(current()!==finalHost){fail('Committed paper changed before frame opportunity');return;}
        sample.firstCandidateFrameMs??=now;
        if(sample.finalFrameMs===null)sample.finalFrameMs=now;
        else{sample.nextFrameMs=now;clean();resolve(sample);return;}
      }
      frame=requestAnimationFrame(tick);
    };
    observer.observe(viewport,{childList:true,subtree:true,attributes:true,attributeFilter:['data-paper-freshness','data-provisional-pages','inert']});
    observer.observe(state,{attributes:true,attributeFilter:['data-phase']});
    timer=setTimeout(()=>fail('Frame opportunity timed out'),timeoutMs);
    frame=requestAnimationFrame(tick);
    try{
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,value);
      input.dispatchEvent(new Event('input',{bubbles:true}));
    }catch(e){clean();reject(e);}
  });
}

export function summarizeFrameOpportunity(rows){
  if(rows.length!==8)throw Error('Expected four frame pairs');
  for(const r of rows){
    if(!['uncached','warm'].includes(r.arm)||!Number.isInteger(r.pair)||r.pair<1||r.pair>4||
      ![r.domMs,r.firstCandidateFrameMs,r.finalFrameMs,r.nextFrameMs].every(n=>Number.isFinite(n)&&n>0)||
      r.domMs>r.finalFrameMs||r.firstCandidateFrameMs>r.finalFrameMs||r.finalFrameMs>r.nextFrameMs||
      typeof r.provisionalFrameSeen!=='boolean'||(!r.provisionalFrameSeen&&r.firstCandidateFrameMs!==r.finalFrameMs)||
      (r.arm==='warm'&&r.provisionalFrameSeen))throw Error('Invalid frame opportunity sample');
  }
  const compare=key=>summarizeCacheComparison(rows.map(r=>({label:'cache-pair-'+r.pair+'-'+r.arm,scope:'manuscript',elapsedMs:r[key]})),'manuscript');
  const stats=Object.fromEntries(['uncached','warm'].map(arm=>{
    const selected=rows.filter(r=>r.arm===arm),p95=key=>selected.map(r=>r[key]).sort((a,b)=>a-b)[Math.ceil(selected.length*.95)-1];
    return [arm,{firstCandidateP95Ms:p95('firstCandidateFrameMs'),finalP95Ms:p95('finalFrameMs'),nextP95Ms:p95('nextFrameMs'),provisionalFrameCount:selected.filter(r=>r.provisionalFrameSeen).length}];
  }));
  return {dom:compare('domMs'),firstCandidate:compare('firstCandidateFrameMs'),final:compare('finalFrameMs'),next:compare('nextFrameMs'),arms:stats};
}

export async function benchmarkFrameOpportunity({raw,click,until,ready,paperSignature,large,root}){
  await until('shown window',"document.visibilityState==='visible'&&!!document.querySelector('#preview').getClientRects().length");
  const original=await paperSignature(),from='実測組版を確認します。',to='増分組版を確認します。',edited=large.source.replace(from,to);
  if(edited===large.source||edited.length!==large.source.length)throw Error('Invalid visible frame fixture');
  const setSource=value=>raw("(()=>{const e=document.querySelector('#source');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  async function mode(direct,{reset=false}={}){
    await click('#performance-toggle');
    const checked=id=>raw("document.querySelector("+JSON.stringify(id)+").checked");
    // A retained no-op prime can legitimately keep the host (and paperProbe).
    // Reset the sparse lease and preparation caches in BOTH arms before marking
    // the host; this forces a new host and equalizes primer state.
    if(reset&&await checked('#performance-retained-preview')){
      await click('#performance-retained-preview');
      if(await checked('#performance-retained-preview'))throw Error('Frame comparison reset failed');
    }
    for(const [id,on] of [['#performance-retained-preview',true],['#performance-short-warm-window',true],['#performance-worker-preparation',false],['#performance-direct-single-page',direct]]){
      if(await checked(id)!==on)await click(id);
      if(await checked(id)!==on)throw Error('Frame comparison mode mismatch: '+id);
    }
    await click('#performance-close');
  }
  const rows=[];let oracle;
  for(const {pair,order} of cacheComparisonPlan()){
    for(const arm of order){
      const direct=arm==='warm';
      await mode(direct,{reset:true});
      await raw("document.querySelector('#preview > div').dataset.paperProbe='old'");
      await click('#preview-button');
      await until('frame prime',ready('manuscript')+"&&document.querySelector('#preview > div').dataset.paperProbe!=='old'&&!!document.querySelector('#preview > div').dataset.retainedWork");
      if(await paperSignature()!==original)throw Error('Frame prime paper differs');
      const prime=await raw("JSON.parse(document.querySelector('#preview > div').dataset.retainedWork)");
      if(prime.directSinglePage!==direct||prime.hostTiming.preparationMode!=='main')throw Error('Frame prime used incorrect preparation/publication mode');
      // Flush initial rendering before starting the timed input.
      await raw("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))");
      await raw("window.__bcFramePrime={host:document.querySelector('#preview > div'),pages:Array.from(document.querySelector('#preview > div').shadowRoot.children)}");
      const s=await raw("("+observeEditFrames.toString()+")("+JSON.stringify({value:edited,marker:to})+")");
      const signature=await paperSignature();
      if(signature===original||(oracle!==undefined&&signature!==oracle))throw Error('Frame comparison paper parity failed');
      oracle=signature;
      const work=await raw("(()=>{const h=document.querySelector('#preview > div'),p=window.__bcFramePrime,nodes=Array.from(h.shadowRoot.children);delete window.__bcFramePrime;return {work:JSON.parse(h.dataset.retainedWork),reused:Number(h.dataset.reusedPages),pages:nodes.length,sameHost:h===p.host,reusedIdentity:nodes.filter((n,i)=>n===p.pages[i]).length,clean:!h.dataset.provisionalPages&&!h.shadowRoot.querySelector('[data-provisional-layer]')};})()");
      if(work.work.directSinglePage!==direct||work.work.hostTiming.preparationMode!=='main'||work.reused!==work.pages-1||!work.sameHost||work.reusedIdentity!==work.pages-1||!work.clean)throw Error('Frame comparison did not use expected retained path');
      rows.push({pair,arm,...s});
      await setSource(large.source);
      await until('frame fixture restored',ready('manuscript')+"&&document.querySelector('#source').value==="+JSON.stringify(large.source)+"&&!document.querySelector('#preview > div').shadowRoot.textContent.includes("+JSON.stringify(to)+")");
      if(await paperSignature()!==original||await readFile(join(root,'manuscript',large.id+'.md'),'utf8')!==large.source)throw Error('Frame comparison restore failed');
    }
  }
  await mode(false);
  const comparison=summarizeFrameOpportunity(rows);
  const report={version:1,environment:'shown Electron window; animation frame opportunities, not pixel presentation',arms:{uncached:'streaming',warm:'direct'},comparison,rows};
  console.log('BENCH visible frame '+JSON.stringify(report));
  return report;
}
