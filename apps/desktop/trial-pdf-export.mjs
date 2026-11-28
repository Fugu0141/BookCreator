import {createHash} from 'node:crypto';
import {printPlanSignature} from './trial-print-plan.mjs';
import {renderTrialPdfInWindow} from './trial-print-window.mjs';
import {outputTrialPdf} from './trial-pdf-output.mjs';
import {inspectTrialPdfStructure} from './trial-pdf-inspection.mjs';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function sourceSignature(docs){return digest(docs.map(d=>[d.documentId,d.revision,d.startOn,d.source]));}
async function readState(workspace){
  const docs=await workspace.readBook(),theme=await workspace.typography(),settings=await workspace.bookSettings(),fonts=await workspace.fonts();
  return {docs,theme,settings,fonts,signature:digest([docs,theme,settings,fonts])};
}
export async function exportSavedTrialPdf({workspace,request,BrowserWindow,chooseDestination,isCurrent}){
  const {options,expectedPlan,documents,themeRevision,settingsRevision}=request??{};
  printPlanSignature(expectedPlan);
  if(!options||!Array.isArray(options.sections)||!Array.isArray(documents)||typeof isCurrent!=='function'||
    options.revision!==expectedPlan.revision||options.fingerprint!==expectedPlan.fingerprint)throw Error('Invalid trial PDF request');
  if(Buffer.byteLength(JSON.stringify(request),'utf8')>16*1024*1024)throw Error('PDF snapshot exceeds limit');
  const state=await readState(workspace);
  if(sourceSignature(state.docs)!==sourceSignature(documents)||state.theme.revision!==themeRevision||state.settings.revision!==settingsRevision)
    throw Error('保存済み書籍が変更されています。再読込して全冊を組版してください。');
  if(JSON.stringify(options.sections.map(s=>[s.id,s.startOn]))!==JSON.stringify(state.docs.map(s=>[s.documentId,s.startOn])))
    throw Error('全冊組版が必要です。');
  const fonts=state.fonts.map(({sha256,alias,weight,embedAllowed})=>({sha256,alias,weight,embedAllowed}));
  const ticket={revision:options.revision,fingerprint:options.fingerprint};
  const ensureSaved=async()=>{
    if(!isCurrent()||(await readState(workspace)).signature!==state.signature||!isCurrent())
      throw Error('出力中に保存済み書籍が変更されました。');
  };
  // This is explicitly a trial export. Structure inspection is not a proof
  // of glyph/ink fidelity; the isolated window separately matches the plan.
  const result=await outputTrialPdf({ticket,paper:options.paper,pageCount:expectedPlan.pages.length,isCurrent,
    chooseDestination:async()=>{const path=await chooseDestination();if(path!==null)await ensureSaved();return path;},
    print:async()=>{await ensureSaved();const printed=await renderTrialPdfInWindow({BrowserWindow,options,expectedPlan,fonts,isCurrent});await ensureSaved();return printed.bytes;},
    verify:async bytes=>{
      const inspection=await inspectTrialPdfStructure(bytes,{pageCount:expectedPlan.pages.length,paper:options.paper,expectedNonblank:expectedPlan.pages.map(p=>p.fragments.length>0)});
      await ensureSaved();
      return inspection.structureVerified===true;
    }
  });
  return {...result,contentFidelityVerified:false,publicationReady:false};
}
