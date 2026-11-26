import {makeMathTextbook,makeLibrary,size,typography,expectedNumbers} from '/fixtures/math-textbook.mjs';
import {prepareBookBrowserPreview,defaultHeadingDesign} from '/app/dist/index.js';
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
  const preview=await createPlainTextPagePreview(document,prepared.options);
  if(preview.publicationReady!==false||preview.plan.completeness!=='full')throw Error('Expected complete experimental preview');
  document.body.replaceChildren(preview.element);
  const pages=[...preview.element.shadowRoot.querySelectorAll('[data-page]')];
  for(const [i,page] of pages.entries()){
    Object.assign(page.style,{border:'0',margin:'0 auto',breakInside:'avoid',breakAfter:i===pages.length-1?'auto':'page'});
  }
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
