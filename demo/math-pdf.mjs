import {makeMathTextbook,makeLibrary,size,typography,expectedNumbers} from '/fixtures/math-textbook.mjs';
import {prepareBookBrowserPreview,defaultHeadingDesign,prepareTrialPrint} from '/app/dist/index.js';
import {scanDocument,validateScannedBlocks,indexBlockIds,parseReferenceToken} from '/bcm/dist/index.js';
import {createPlainTextPagePreview,parsePreviewMath,parseDisplayMath} from '/engine/dist/index.js';
const deps={scan:scanDocument,validate:validateScannedBlocks,index:indexBlockIds,validateDisplayMath:parseDisplayMath,validateInlineMath:parsePreviewMath,parseReference:parseReferenceToken};

// Test-only entrypoint. The runner provides the verified bundled font bytes,
// never a file path or arbitrary manuscript. No publication-ready claim.
window.renderMathPdfFixture=async fontBase64=>{
  const bytes=Uint8Array.from(atob(fontBase64),c=>c.charCodeAt(0));
  const face=new FontFace(typography.mathFontFamily,bytes.buffer);
  await face.load();
  document.fonts.add(face);
  await document.fonts.ready;
  if(face.status!=='loaded'||!document.fonts.check('16px '+typography.mathFontFamily))throw Error('Math font not loaded');
  const prepared=prepareBookBrowserPreview(makeMathTextbook(),'pdf-test','math-pdf',size,deps,typography,undefined,undefined,undefined,undefined,makeLibrary(defaultHeadingDesign));
  if(!prepared.options)throw Error(JSON.stringify(prepared.diagnostics));
  const paper={width:160000,height:200000,top:10000,bottom:10000,inner:10000,outer:10000,firstSide:'right'};
  const preview=await createPlainTextPagePreview(document,{...prepared.options,paper});
  const current={revision:'pdf-test',fingerprint:'math-pdf'};
  // A stale or mismatched print request must leave the preview detached.
  for(const [ticket,geometry] of [[{...current,revision:'stale'},paper],[current,{...paper,width:paper.width+1000}]]){
    let refused=false;
    try{prepareTrialPrint(ticket,preview,geometry);}catch(e){if(!(e instanceof RangeError))throw e;refused=true;}
    if(!refused||preview.element.isConnected)throw Error('Invalid print projection accepted');
  }
  const projection=prepareTrialPrint(current,preview,paper);
  const style=document.createElement('style');style.textContent=projection.css;document.head.append(style);
  document.body.replaceChildren(projection.element);
  const pages=[...preview.element.shadowRoot.querySelectorAll('[data-page]')];
  if(pages.length!==projection.pageCount||pages.some(p=>[...p.querySelectorAll('[data-content-guide]')].some(g=>getComputedStyle(g).display!=='none')))throw Error('Print guide/page mismatch');
  await document.fonts.ready;
  const labels=pages.flatMap(p=>[...p.querySelectorAll('[data-equation-number]')].map(n=>n.textContent)).sort();
  if(JSON.stringify(labels)!==JSON.stringify(expectedNumbers.map(([,n])=>'('+n+')').sort()))throw Error('Wrong equation labels');
  let mathCount=0;
  for(const page of pages){
    const bounds=page.getBoundingClientRect();
    for(const math of page.querySelectorAll('math,[data-equation-number]')){
      const r=math.getBoundingClientRect();
      if(r.width<=0||r.height<=0||r.left<bounds.left-1||r.top<bounds.top-1||r.right>bounds.right+1||r.bottom>bounds.bottom+1)throw Error('Math outside page boundary');
      if(math.localName==='math')mathCount++;
    }
  }
  return {pages:pages.length,mathCount,labels,publicationReady:false};
};
