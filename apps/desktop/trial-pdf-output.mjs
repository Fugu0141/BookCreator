import {open,link,unlink,realpath,stat} from 'node:fs/promises';
import {dirname,basename,join,isAbsolute,extname} from 'node:path';
import {randomUUID} from 'node:crypto';

const MAX_PDF_BYTES=256*1024*1024;
export function assertPdfEnvelope(bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length<32||bytes.length>MAX_PDF_BYTES||
    !/^%PDF-1\.[0-7](?:\r\n|\n|\r)/.test(bytes.subarray(0,16).toString('latin1'))||
    !/%%EOF[\t\r\n ]*$/.test(bytes.subarray(-1024).toString('latin1')))throw Error('PDFの形式またはサイズを確認できません。');
}

/** Publish a new PDF only, using a same-directory temporary file and an
 * exclusive hard link. Never truncate or replace a user's existing file.
 * The caller must perform the full PDF inspection before this function;
 * the envelope check is intentionally not a PDF parser. */
export async function saveNewTrialPdf(destination,bytes,{isCurrent=()=>true}={}){
  if(typeof destination!=='string'||!isAbsolute(destination)||extname(destination).toLowerCase()!=='.pdf')throw Error('PDFの保存先が不正です。');
  assertPdfEnvelope(bytes);
  if(!isCurrent())throw Error('組版結果が更新されました。再出力してください。');
  const directory=await realpath(dirname(destination));
  if(!(await stat(directory)).isDirectory())throw Error('PDFの保存先フォルダがありません。');
  const target=join(directory,basename(destination));
  const temporary=join(directory,'.bookcreator-trial-'+randomUUID()+'.tmp');
  let file,created=false,published=false;
  try{
    file=await open(temporary,'wx',0o600);created=true;
    await file.writeFile(bytes);
    await file.sync();
    await file.close();file=undefined;
    if(!isCurrent())throw Error('組版結果が更新されました。再出力してください。');
    // link is atomic and refuses an existing file, including symlinks.
    // Filesystems without hard-link support fail closed; do not fall back
    // to a nonexclusive rename or copy.
    await link(temporary,target);published=true;
    return {path:target,byteLength:bytes.length};
  }catch(e){
    if(e.code==='EEXIST')throw Object.assign(Error('同名のPDFがあります。別の名前を指定してください。'),{code:'PDF_EXISTS'});
    throw e;
  }finally{
    if(file)await file.close().catch(()=>{});
    if(created)try{await unlink(temporary);}catch(e){
      // Once published, never report failure as if no output existed.
      // A cleanup failure may leave only the random temporary name.
      if(!published&&e.code!=='ENOENT')throw e;
    }
  }
}

/** Main-process output boundary. Rendering must use a dedicated, already
 * prepared print document, not the active editing window. The injected
 * verifier must reject page/geometry/content mismatches; envelope alone
 * is never sufficient. */
export async function outputTrialPdf({ticket,paper,pageCount,chooseDestination,print,verify,isCurrent,save=saveNewTrialPdf}){
  if(!ticket?.revision||!ticket.fingerprint||!Number.isSafeInteger(pageCount)||pageCount<1||pageCount>512||
    ![paper?.width,paper?.height].every(n=>Number.isSafeInteger(n)&&n>=30000&&n<=300000)||
    ![chooseDestination,print,verify,isCurrent,save].every(f=>typeof f==='function'))throw Error('試しPDFの出力条件が不正です。');
  const current=()=>isCurrent(ticket);
  const requireCurrent=()=>{if(!current())throw Error('組版結果が更新されました。再出力してください。');};
  requireCurrent();
  const destination=await chooseDestination();
  if(destination===null)return {status:'cancelled'};
  requireCurrent();
  const bytes=await print({printBackground:true,displayHeaderFooter:false,preferCSSPageSize:true,scale:1});
  requireCurrent();
  assertPdfEnvelope(bytes);
  if(await verify(bytes,{pageCount,paper,ticket})!==true)throw Error('PDFの出力検査に失敗しました。');
  requireCurrent();
  const result=await save(destination,bytes,{isCurrent:current});
  return {status:'saved',...result,pageCount,revision:ticket.revision,publicationReady:false};
}
