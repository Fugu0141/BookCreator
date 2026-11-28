import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument,degrees,PDFName,PDFNumber} from 'pdf-lib';
import {inspectTrialPdfStructure} from '../trial-pdf-inspection.mjs';

const paper={width:148000,height:210000},size=[paper.width*72/25400,paper.height*72/25400];
async function fixture({pages=2,blank=[],modify=()=>{}}={}){
  const doc=await PDFDocument.create();
  for(let i=0;i<pages;i++){
    const page=doc.addPage(size);
    if(!blank.includes(i))page.drawText('BookCreator '+(i+1),{x:24,y:100,size:12});
    modify(page,i);
  }
  return Buffer.from(await doc.save({useObjectStreams:true}));
}
const inspect=(bytes,options={})=>inspectTrialPdfStructure(bytes,{pageCount:2,paper,expectedNonblank:[true,true],...options});
test('actual PDF with compressed object streams passes geometry inspection',async()=>{
  const result=await inspect(await fixture());
  assert.equal(result.pageCount,2);
  assert.ok(result.pages.every(p=>Math.abs(p.widthPt-size[0])<0.01&&p.contentBytes>0));
  assert.equal(result.structureVerified,true);
  assert.equal(result.contentFidelityVerified,false);
  assert.equal(result.publicationReady,false);
});
test('actual page count and every page dimension must agree',async()=>{
  await assert.rejects(inspect(await fixture({pages:1})),/ページ数/);
  await assert.rejects(inspect(await fixture({modify:(p,i)=>{if(i===1)p.setSize(612,792);}})),/2ページ/);
});
test('cropped, rotated and rescaled pages are refused',async()=>{
  await assert.rejects(inspect(await fixture({modify:(p,i)=>{if(i===0)p.setCropBox(10,0,size[0]-10,size[1]);}})),/CropBox/);
  await assert.rejects(inspect(await fixture({modify:(p,i)=>{if(i===1)p.setRotation(degrees(90));}})),/回転/);
  await assert.rejects(inspect(await fixture({modify:p=>p.node.set(PDFName.of('UserUnit'),PDFNumber.of(2))})),/物理単位/);
});
test('missing content streams are refused on expected nonblank pages',async()=>{
  const bytes=await fixture({blank:[1]});
  await assert.rejects(inspect(bytes),/内容がありません/);
  const result=await inspect(bytes,{expectedNonblank:[true,false]});
  assert.equal(result.pages[1].contentBytes,0);
});
test('invalid input and malformed PDF are refused',async()=>{
  const bytes=await fixture();
  await assert.rejects(inspect(bytes,{expectedNonblank:[true]}),/検査条件/);
  await assert.rejects(inspect(Buffer.from('not a PDF')));
  await assert.rejects(inspect(Buffer.from('%PDF-1.4\n% invalid object structure\n%%EOF\n')));
});
