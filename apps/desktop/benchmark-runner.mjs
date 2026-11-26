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
      if(await raw(js))return;
      if(await raw("document.querySelector('#workspace-layout-state')?.dataset.phase==='failed'"))throw Error('Benchmark failed: '+label+'; '+await raw("document.querySelector('#status')?.textContent"));
      await sleep(25);
    }
    throw Error('Benchmark timeout: '+label);
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
  await measure('whole-book-open','book',()=>click('#mode-layout'));
  await raw("document.querySelector('#preview > div').dataset.paperProbe='old'");
  await measure('whole-book-repeat','book',()=>click('#preview-book'),"document.querySelector('#preview > div').dataset.paperProbe!=='old'");
  for(const c of fixture.chapters)if(await readFile(join(root,'manuscript',c.id+'.md'),'utf8')!==c.source)throw Error('Benchmark changed a saved manuscript');
  if(await readFile(join(root,'book.yaml'),'utf8')!==fixture.manifest)throw Error('Benchmark changed manifest');
  await click('#performance-toggle');
  await until('metrics',"document.querySelector('#performance-summary tbody tr[data-stage=layout][data-category=book]')?.dataset.success>0&&document.querySelector('#performance-memory')?.dataset.phase==='ready'");
  const summary=await raw("Array.from(document.querySelectorAll('#performance-summary tbody tr')).map(tr=>({stage:tr.dataset.stage,category:tr.dataset.category,values:Array.from(tr.querySelectorAll('td')).map(td=>td.textContent)}))");
  console.log('BENCH report '+JSON.stringify({version:1,chapters:fixture.chapters.map(c=>({id:c.id,characters:c.source.length,sections:c.sections})),initialMemory,finalMemory:memory(),samples,summary}));
}
