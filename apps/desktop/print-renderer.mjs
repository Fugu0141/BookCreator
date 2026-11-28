import {prepareTrialPrint} from '../../dist/index.js';
import {createPlainTextPagePreview} from '../../../BookCreator_LayoutEngine/dist/index.js';
import {assertMatchingPrintPlan} from './trial-print-plan.mjs';

// A separate, single-use document, without editor state or preload IPC.
let started=false;
globalThis.renderTrialPrint=async ({options,expectedPlan,fonts=[]})=>{
  if(started)throw Error('Print document has already been used');
  started=true;
  if(!options?.paper||!Array.isArray(options.sections)||!Array.isArray(fonts)||fonts.length>128)throw Error('Invalid print snapshot');
  for(const font of fonts){
    if(!/^[a-f0-9]{64}$/.test(font.sha256)||font.alias!=='BCFont_'+font.sha256||
      !Number.isSafeInteger(font.weight)||font.weight<100||font.weight>900||font.embedAllowed!==true)throw Error('登録フォントのPDF埋め込み権利を確認できません。');
    const face=new FontFace(font.alias,'url("bookcreator://app/project-fonts/'+font.sha256+'")',{weight:String(font.weight),style:'normal'});
    await face.load();document.fonts.add(face);
  }
  await document.fonts.ready;
  const resolveImage=async id=>{
    if(!/^[a-f0-9]{64}$/.test(id))throw Error('Invalid print image');
    const response=await fetch('bookcreator://app/project-images/'+id+'.png',{cache:'no-store'});
    if(!response.ok||response.headers.get('content-type')!=='image/png')throw Error('印刷用画像を読み込めません。');
    const image=await response.blob();
    if(!image.size||image.size>16*1024*1024)throw Error('Invalid print image size');
    return image;
  };
  const preview=await createPlainTextPagePreview(document,{...options,resolveImage});
  assertMatchingPrintPlan(expectedPlan,preview.plan);
  const projection=prepareTrialPrint({revision:options.revision,fingerprint:options.fingerprint},preview,options.paper);
  const style=document.createElement('style');style.textContent=projection.css;document.head.append(style);
  document.body.replaceChildren(projection.element);
  await document.fonts.ready;
  return {pageCount:projection.pageCount,revision:preview.plan.revision,fingerprint:preview.plan.fingerprint,publicationReady:false};
};
