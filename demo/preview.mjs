import {makeMathTextbook,makeLibrary,expectedNumbers,size as mathSize} from '/fixtures/math-textbook.mjs';
import {prepareBrowserPreview,prepareBookBrowserPreview,defaultHeadingDesign,previewSourceRange} from '/app/dist/index.js';
import {scanDocument,validateScannedBlocks,indexBlockIds,parseReferenceToken} from '/bcm/dist/index.js';
import {createPlainTextPagePreview,parsePreviewMath,parseDisplayMath} from '/engine/dist/index.js';
const source=document.querySelector('#source'),width=document.querySelector('#width'),height=document.querySelector('#height');
const button=document.querySelector('#render'),status=document.querySelector('#status'),target=document.querySelector('#preview');
const deps={scan:scanDocument,validate:validateScannedBlocks,index:indexBlockIds,validateDisplayMath:parseDisplayMath,validateInlineMath:parsePreviewMath,parseReference:parseReferenceToken};
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
      for(const atom of fragment.querySelectorAll('[data-inline-math]')){
        const textStart=Number(atom.dataset.mathStart),textEnd=Number(atom.dataset.mathEnd);
        if(textStart<fragmentSlice.textStart||textEnd>fragmentSlice.textEnd||textEnd!==textStart+1)continue;
        const range=previewSourceRange(block,{textStart,textEnd});
        if(!range)continue;
        atom.tabIndex=0;atom.style.cursor='pointer';atom.setAttribute('aria-label','対応するインライン数式を選択');
        const focus=e=>{e.stopPropagation();if(job!==revision)return;source.focus();source.setSelectionRange(range.start,range.end);};
        atom.addEventListener('click',focus);atom.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();focus(e);}});
      }
    });
    status.textContent=preview.plan.pages.length+' ページ · 実験的なブラウザ実測 · 出版不可';
  }catch(error){if(job===revision){status.textContent=String(error.message??error);latest=undefined;target.replaceChildren();}}
  finally{if(job===revision)button.disabled=false;}
}
button.addEventListener('click',()=>void render());
const mathSample=['# 二次方程式','','**例題** 次の式を解く。','',':::layout{#eq-demo numbered="true"}','$$','x^2-5x+6=0','$$',':::','','::::callout{kind="note"}','式 :ref{target="eq-demo"} を因数分解する。','',':::layout{#eq-factor numbered="true"}','$$','(x-2)(x-3)=0','$$',':::','','解は $x=2$ または $x=3$。','::::',''].join('\n');
const initialSource=source.value;
document.querySelector('#sample-math').addEventListener('click',()=>{
  if(source.value!==initialSource&&source.value!==mathSample&&!window.confirm('現在の入力をサンプルに置き換えますか？'))return;
  source.value=mathSample;width.value='140';height.value='180';invalidate();void render();
});
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
    const formula='\\frac{a^2}{b}';
    source.value='導入。\n\n$$\n'+formula+'\n$$\n\n結び。';
    source.dispatchEvent(new Event('input'));await render();
    const math=latest?.element.shadowRoot.querySelector('[data-display-math]');
    if(!math?.querySelector('math mfrac msup'))throw Error('Display math not rendered as MathML: '+status.textContent);
    math.click();
    if(source.value.slice(source.selectionStart,source.selectionEnd)!==formula)throw Error('Display math source mapping mismatch');
    source.value='$$\n\\input{secret}\n$$\n';source.dispatchEvent(new Event('input'));await render();
    if(latest||target.children.length)throw Error('Unsafe formula rendered');
    const inlineFormula='$\\frac{1}{2}$';
    source.value='**係数** '+inlineFormula+' を用いる。';
    source.dispatchEvent(new Event('input'));await render();
    const atom=latest?.element.shadowRoot.querySelector('[data-inline-math]');
    if(!atom?.querySelector('math mfrac'))throw Error('Inline formula not rendered: '+status.textContent);
    atom.click();
    if(source.value.slice(source.selectionStart,source.selectionEnd)!==inlineFormula)throw Error('Inline formula envelope selection mismatch');
    const refToken=':ref{target="eq-demo"}',eqFormula='\\frac{a}{b}';
    source.value='参照 '+refToken+'。\n\n:::layout{#eq-demo numbered="true"}\n$$\n'+eqFormula+'\n$$\n:::\n';
    source.dispatchEvent(new Event('input'));await render();
    const eq=latest?.element.shadowRoot.querySelector('[data-equation-number]');
    if(eq?.textContent!=='(1.1)')throw Error('Equation number not rendered: '+status.textContent);
    const referenceBlock=[...latest.element.shadowRoot.querySelectorAll('[data-block]')].find(b=>b.textContent.includes('式 (1.1)'));
    if(!referenceBlock)throw Error('Resolved equation reference missing');
    eq.click();
    if(source.value.slice(source.selectionStart,source.selectionEnd)!==eqFormula)throw Error('Numbered equation selection mismatch');
    source.value='[unsupported](https://example.invalid)';source.dispatchEvent(new Event('input'));if(target.children.length)throw Error('Stale preview remained');
    await render();if(latest||target.children.length)throw Error('Unsupported input rendered');
    // Exercise the same three-document textbook as the node integration suite,
    // using the actual browser measurement and MathML rendering path.
    const docs=makeMathTextbook();
    const textbook=prepareBookBrowserPreview(docs,'textbook','textbook-smoke',mathSize,deps,undefined,undefined,undefined,undefined,undefined,makeLibrary(defaultHeadingDesign));
    if(!textbook.options)throw Error('Textbook compilation failed: '+JSON.stringify(textbook.diagnostics));
    const paper=await createPlainTextPagePreview(document,textbook.options);
    const root=paper.element.shadowRoot;
    const labels=Array.from(root.querySelectorAll('[data-equation-number]'),n=>n.textContent).sort();
    const expected=expectedNumbers.map(([,n])=>'('+n+')').sort();
    if(JSON.stringify(labels)!==JSON.stringify(expected))throw Error('Textbook numbers mismatch: '+JSON.stringify(labels));
    if(paper.plan.pages.length<3||paper.publicationReady!==false)throw Error('Textbook must use multi-page experimental output');
    if(root.querySelectorAll('math mtable').length<3||!root.querySelector('math mfrac')||!root.querySelector('[data-named-slot=hint] [data-equation-number]'))throw Error('Textbook math layout missing');
    if(!root.textContent.includes('次章の定義は 式 (2.1)')||!root.textContent.includes('式 (2.2)'))throw Error('Textbook reference label missing');
    report.textContent='PASS '+JSON.stringify({pages,sourceMapping:true,staleGuard:true,textbookPages:paper.plan.pages.length,textbookEquations:labels.length});
  }catch(e){report.textContent='FAIL '+String(e);}
}else void render();
