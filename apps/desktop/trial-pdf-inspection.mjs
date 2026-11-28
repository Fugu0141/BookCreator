import {PDFDocument,PDFName,PDFArray,PDFRawStream} from 'pdf-lib';
import {assertPdfEnvelope} from './trial-pdf-output.mjs';

// Chromium rounds physical page dimensions to points. Allow at most 1 mm
// (2.835 pt) per axis; never infer orientation by swapping the axes.
export const TRIAL_PAPER_TOLERANCE_PT=72/25.4;
const toPoints=um=>um*72/25400;
const close=(a,b)=>Number.isFinite(a)&&Math.abs(a-b)<=TRIAL_PAPER_TOLERANCE_PT;
function assertBox(box,width,height,index,label){
  if(!close(box.x,0)||!close(box.y,0)||!close(box.width,width)||!close(box.height,height))
    throw Error('PDF '+(index+1)+'ページの'+label+'寸法が組版と一致しません。');
}
function streamsFor(page,pdf){
  const contents=page.node.get(PDFName.of('Contents'));
  if(!contents)return [];
  const resolved=pdf.context.lookup(contents);
  const streams=resolved instanceof PDFArray?resolved.asArray().map(ref=>pdf.context.lookup(ref)):[resolved];
  if(streams.some(stream=>!(stream instanceof PDFRawStream)))throw Error('PDFのページ内容ストリームが不正です。');
  return streams;
}

/** Structural inspection for our own freshly generated trial PDF.
 * Uses a PDF object parser (not string matching /Type /Page). This verifies
 * physical geometry and the presence of content streams, NOT text fidelity,
 * embedded fonts, visible ink, or publication readiness. */
export async function inspectTrialPdfStructure(bytes,{pageCount,paper,expectedNonblank}){
  assertPdfEnvelope(bytes);
  if(!Number.isSafeInteger(pageCount)||pageCount<1||pageCount>512||
    ![paper?.width,paper?.height].every(n=>Number.isSafeInteger(n)&&n>=30000&&n<=300000)||
    !Array.isArray(expectedNonblank)||expectedNonblank.length!==pageCount||expectedNonblank.some(v=>typeof v!=='boolean'))
    throw Error('PDFの検査条件が不正です。');
  const pdf=await PDFDocument.load(bytes,{ignoreEncryption:false,throwOnInvalidObject:true,updateMetadata:false});
  const pages=pdf.getPages();
  if(pages.length!==pageCount)throw Error('PDFページ数が組版と一致しません。');
  const width=toPoints(paper.width),height=toPoints(paper.height);
  const report=pages.map((page,index)=>{
    if(page.getRotation().angle!==0)throw Error('PDF '+(index+1)+'ページの回転が不正です。');
    const userUnit=page.node.get(PDFName.of('UserUnit'));
    if(userUnit!==undefined&&pdf.context.lookup(userUnit)?.asNumber?.()!==1)throw Error('PDFの物理単位が不正です。');
    const media=page.getMediaBox(),crop=page.getCropBox();
    assertBox(media,width,height,index,'MediaBox');
    assertBox(crop,width,height,index,'CropBox');
    const streams=streamsFor(page,pdf);
    const contentBytes=streams.reduce((sum,s)=>sum+s.getContentsSize(),0);
    if(expectedNonblank[index]&&contentBytes===0)throw Error('PDF '+(index+1)+'ページの内容がありません。');
    return {index,widthPt:media.width,heightPt:media.height,contentBytes};
  });
  return {pageCount:pages.length,pages:report,structureVerified:true,contentFidelityVerified:false,publicationReady:false};
}
