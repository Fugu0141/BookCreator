import {compileHeadingDesign} from './preview-component.js';
import type {PreviewTextStyle} from './preview-typography.js';
import type {SemanticItem} from './manuscript-poc.js';

export interface FigureAsset {id:string;width:number;height:number}
export interface FigureResources {
  readonly assets:readonly FigureAsset[];
  readonly documentPaths:Readonly<Record<string,string>>;
}

/** Only resolve the existing project-local, content-addressed PNG catalog.
 * The host supplies manuscript paths and verified image dimensions; no IO,
 * browser objects or network URLs cross the preparation boundary. */
export function compileFigurePreview(item:SemanticItem,width:number,pageHeight:number,resources:FigureResources|undefined,body:PreviewTextStyle){
  const fail=(message:string):never=>{throw RangeError(message);};
  const src=item.attributes?.src??'';
  const match=/^(?:\.\.\/)*assets\/images\/([a-f0-9]{64})\.png$/.exec(src);
  if(!resources||!match) return fail('図は登録済みPNG素材を原稿相対パスで指定してください。');
  const path=Object.hasOwn(resources.documentPaths,item.origin.documentId)?resources.documentPaths[item.origin.documentId]:undefined;
  if(!path||path.split('/').some(p=>!p||p==='.'||p==='..')||/[\\:\u0000-\u001f]/.test(path))return fail('図の原稿パスを確認できません。');
  const id=match[1];
  const expected='../'.repeat(path.split('/').length-1)+'assets/images/'+id+'.png';
  if(src!==expected)return fail('図の素材パスが原稿位置と一致しません。');
  const matches=resources.assets.filter(a=>a.id===id);
  const asset=matches[0];
  if(matches.length!==1||!asset||!Number.isSafeInteger(asset.width)||!Number.isSafeInteger(asset.height)||asset.width<=0||asset.height<=0||asset.width*asset.height>16000000)return fail('登録画像の寸法を確認できません。');
  const height=Math.round(width*asset.height/asset.width);
  if(!Number.isSafeInteger(width)||width<=0||!Number.isSafeInteger(height)||height<1||height>100000||height>=pageHeight)return fail('図が大きすぎます。幅を小さくしてください。');
  // The current Engine component API requires one nonempty text content slot.
  // An explicit caption is required rather than silently adding printed text.
  if(!item.text.trim())return fail('現在の図プレビューにはキャプションが必要です。');
  return compileHeadingDesign({schemaVersion:1,fontSize:3500,lineHeight:1.5,direction:'column',gap:1500,padding:0,background:'#ffffff',textColor:'#222222',children:[
    {id:'figure-image',type:'image',width:'fill',height,assetId:id,fit:'contain',alt:item.attributes?.alt??''},
    {id:'content',type:'content'}
  ]},body);
}
