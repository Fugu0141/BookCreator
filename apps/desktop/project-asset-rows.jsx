import React,{memo} from 'react';

// Asset rows depend only on immutable catalog snapshots, never manuscript text.
// Preserve mounted native details and image error state when editing elsewhere.
export const ProjectFontRows=memo(function ProjectFontRows({fonts}){
  return <>{fonts.map(f=><div key={f.id} data-project-font={f.id} data-loaded={f.loaded}><strong>{f.family} {f.style}</strong><small>{f.weight} · {f.license} · {f.loaded?'読込済み':'読込失敗'}</small><div style={{fontFamily:f.loaded?f.alias:'sans-serif',fontWeight:f.weight}}>日本語 ABC 123</div><details><summary>ライセンス情報</summary><pre>{f.licenseText}</pre><small>埋込許可申告: {f.embedAllowed?'あり':'なし'} / fsType: {f.fsType}</small></details></div>)}</>;
});
export const ProjectImageRows=memo(function ProjectImageRows({images}){
  return <>{images.map(i=><div key={i.id} data-project-image={i.id}><img alt="登録画像" src={'bookcreator://app/project-images/'+i.id+'.png'} style={{display:'block',maxWidth:'100%',maxHeight:96,objectFit:'contain'}} onError={e=>{e.currentTarget.hidden=true;e.currentTarget.nextElementSibling.textContent='画像のデコードに失敗しました。';}}/><small>{i.width} × {i.height} px · {i.id.slice(0,12)}</small></div>)}</>;
});
