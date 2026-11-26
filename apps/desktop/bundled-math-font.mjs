// Full, unsubsetted static font: subsetted webfonts may lose MATH assemblies.
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {inspectStaticFont} from './project-fonts.mjs';
export const STIX_FONT=Object.freeze({
  commit:'477b6577b3a9a9e3229eb8e0946da806d2cf822b',
  family:'BCFont_STIXTwoMath',
  asset:'STIXTwoMath-Regular.ttf',
  fontBlob:'351bfabef1444deb578b2e7c3257257962970f82',
  licenseBlob:'11b7b8e8892a6ec8fbe709cc10fa7a12d53a4501'
});
const base='https://raw.githubusercontent.com/google/fonts/'+STIX_FONT.commit+'/ofl/stixtwomath/';
export function verifyPinnedFontBlob(bytes,expected,max){
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>max)throw Error('Invalid pinned font asset size');
  const sha=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  if(sha!==expected)throw Error('Pinned font asset integrity mismatch');
  return bytes;
}
async function source(name,expected,max,localDir){
  let bytes;
  if(localDir)bytes=await readFile(join(localDir,name));
  else{
    const response=await fetch(base+name,{redirect:'error',signal:AbortSignal.timeout(60000)});
    if(!response.ok||!response.body)throw Error('Pinned font download failed: '+response.status);
    const chunks=[];let total=0;
    for await(const chunk of response.body){total+=chunk.length;if(total>max)throw Error('Pinned font asset exceeds limit');chunks.push(Buffer.from(chunk));}
    bytes=Buffer.concat(chunks);
  }
  return verifyPinnedFontBlob(bytes,expected,max);
}
export async function loadBundledMathFont(localDir=process.env.BC_STIX_SOURCE_DIR){
  const [font,license]=await Promise.all([
    source(STIX_FONT.asset,STIX_FONT.fontBlob,4*1024*1024,localDir),
    source('OFL.txt',STIX_FONT.licenseBlob,64*1024,localDir)
  ]);
  const meta=inspectStaticFont(font);
  if(meta.format!=='ttf'||meta.weight!==400||!meta.hasMathTable||meta.family!=='STIX Two Math')throw Error('Unexpected pinned STIX math font metadata');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(license);
  if(!text.includes('SIL OPEN FONT LICENSE')||!text.includes('Version 1.1'))throw Error('Unexpected STIX license');
  return {font,license};
}
