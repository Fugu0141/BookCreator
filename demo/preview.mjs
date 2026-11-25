import {prepareBrowserPreview,previewSourceRange} from '/app/dist/index.js';
import {scanDocument,validateScannedBlocks,indexBlockIds} from '/bcm/dist/index.js';
import {createPlainTextPagePreview} from '/engine/dist/index.js';
const source=document.querySelector('#source'),width=document.querySelector('#width'),height=document.querySelector('#height');
const button=document.querySelector('#render'),status=document.querySelector('#status'),target=document.querySelector('#preview');
const deps={scan:scanDocument,validate:validateScannedBlocks,index:indexBlockIds};
let revision=0,latest;
source.value='# 実測組版の試作\n\n'+('日本語と English text を混在させた原稿です。ブラウザの実測値によって折り返し位置とページ分割を決定します。 '.repeat(14)).trim()+'\n\n## 原稿範囲の確認\n\n紙面の本文を選ぶと原稿の対応範囲を確認できます。';
function invalidate(){revision++;latest=undefined;target.replaceChildren();status.textContent='未組版の変更があります。';button.disabled=false;}
for(const el of [source,width,height])el.addEventListener('input',invalidate);
async function render(){
  const job=++revision;latest=undefined;target.replaceChildren();button.disabled=true;status.textContent='計測中…';
  const raw=source.value,w=Number(width.value),h=Number(height.value);
  try{
    if(!Number.isFinite(w)||w<30||w>250||!Number.isFinite(h)||h<30||h>300)throw Error('本文寸法が範囲外です。');
    const rev=String(job),fingerprint='demo-'+rev+'-'+w+'-'+h;
    const prepared=prepareBrowserPreview({documentId:'demo',revision:rev,source:raw,startOn:'page'},rev,fingerprint,{width:Math.round(w*1000),height:Math.round(h*1000)},deps);
    if(!prepared.options)throw Error(prepared.diagnostics.map(d=>d.code+' '+d.message+' ['+d.range.start+','+d.range.end+')').join('\n'));
    const preview=await createPlainTextPagePreview(document,prepared.options);
    if(job!==revision)return;
    latest=preview;target.append(preview.element);
    const fragments=[...preview.element.shadowRoot.querySelectorAll('[data-block]')];
    fragments.forEach((fragment,i)=>{
      const fragmentSlice=preview.slices[i];
      const block=prepared.options.blocks.find(b=>b.origin.blockKey===fragmentSlice?.origin.blockKey);
      const slice=fragmentSlice?previewSourceRange(block,fragmentSlice):undefined;
      if(!slice)return;
      fragment.tabIndex=0;fragment.style.cursor='pointer';
      fragment.setAttribute('aria-label','対応する原稿範囲を選択');
      const select=()=>{if(job!==revision)return;source.focus();source.setSelectionRange(slice.start,slice.end);};
      fragment.addEventListener('click',select);
      fragment.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}});
    });
    status.textContent=preview.plan.pages.length+' ページ · 実験的なブラウザ実測 · 出版不可';
  }catch(error){if(job===revision){status.textContent=String(error.message??error);latest=undefined;target.replaceChildren();}}
  finally{if(job===revision)button.disabled=false;}
}
button.addEventListener('click',()=>void render());
if(new URLSearchParams(location.search).has('smoke')){
  const report=document.querySelector('#smoke');
  try{
    await render();
    if(!latest||latest.plan.pages.length<2||latest.publicationReady!==false)throw Error('Expected multi-page experimental preview');
    const fragment=latest.element.shadowRoot.querySelector('[data-block]');
    const slice=latest.slices[0].sourceSlice;
    fragment.click();
    if(source.selectionStart!==slice.start||source.selectionEnd!==slice.end||source.value.slice(slice.start,slice.end)!==fragment.textContent)throw Error('Source mapping mismatch');
    const pages=latest.plan.pages.length;
    source.value='[unsupported](https://example.invalid)';source.dispatchEvent(new Event('input'));if(target.children.length)throw Error('Stale preview remained');
    await render();if(latest||target.children.length)throw Error('Unsupported input rendered');
    report.textContent='PASS '+JSON.stringify({pages,sourceMapping:true,staleGuard:true});
  }catch(e){report.textContent='FAIL '+String(e);}
}else void render();
