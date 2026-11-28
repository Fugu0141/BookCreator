import {printPlanSignature} from './trial-print-plan.mjs';
export const TRIAL_PRINT_PAGE='bookcreator://app/print.html';

// Caller supplies a frozen main-process-approved snapshot and a currentness
// guard. Returns PDF bytes only; the separate output transaction must verify
// the actual PDF before publishing it. No editing-window print is performed.
export async function renderTrialPdfInWindow({BrowserWindow,options,expectedPlan,fonts=[],isCurrent,intelligentTicket}){
  printPlanSignature(expectedPlan);
  if((options?.intelligentLayout!==undefined)!==(intelligentTicket!==undefined))throw Error('IL print mode and ticket must match');
  if(typeof isCurrent!=='function'||options?.revision!==expectedPlan.revision||options?.fingerprint!==expectedPlan.fingerprint||
    ![options?.paper?.width,options?.paper?.height].every(n=>Number.isSafeInteger(n)&&n>=30000&&n<=300000))throw Error('Invalid print snapshot');
  const requireCurrent=()=>{if(!isCurrent())throw Error('組版結果が更新されました。再出力してください。');};
  requireCurrent();
  const payload=JSON.stringify({options,expectedPlan,fonts,intelligentTicket});
  if(Buffer.byteLength(payload,'utf8')>16*1024*1024)throw Error('Print snapshot exceeds limit');
  const window=new BrowserWindow({show:false,width:1280,height:850,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,devTools:false,backgroundThrottling:false}});
  try{
    const wc=window.webContents;
    wc.setWindowOpenHandler(()=>({action:'deny'}));
    wc.on('will-navigate',event=>event.preventDefault());
    wc.on('will-attach-webview',event=>event.preventDefault());
    await window.loadURL(TRIAL_PRINT_PAGE);
    requireCurrent();
    if(wc.getURL()!==TRIAL_PRINT_PAGE)throw Error('Unexpected print document');
    // Data is passed as a JSON string literal, never as executable source.
    const report=await wc.executeJavaScript('globalThis.renderTrialPrint(JSON.parse('+JSON.stringify(payload)+'))');
    if(!report||report.publicationReady!==false||report.pageCount!==expectedPlan.pages.length||
      report.revision!==expectedPlan.revision||report.fingerprint!==expectedPlan.fingerprint||(intelligentTicket!==undefined&&report.intelligentLayoutVerified!==true))throw Error('印刷用画面の検査に失敗しました。');
    requireCurrent();
    const bytes=await wc.printToPDF({printBackground:true,displayHeaderFooter:false,preferCSSPageSize:true,scale:1});
    requireCurrent();
    return {bytes,report};
  }finally{if(!window.isDestroyed())window.destroy();}
}
