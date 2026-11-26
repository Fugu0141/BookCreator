import {recoveryKey} from './manuscript-recovery.mjs';
// Join trusted registered manifests to opaque recovery keys. Never send
// manuscript text, storage keys or raw recovery records to the home UI.
export async function listRecoveryCandidates(catalog,store,readManifest){
  const {records,unreadable}=await store.list();
  const remaining=new Map(records.map(r=>[r.key,r])),items=[],unavailable=[];
  if(remaining.size){
    for(const project of await catalog.list()){
      try{
        const manifest=await readManifest(project.path);
        for(const section of manifest.sections){
          const key=recoveryKey(manifest.manifestPath,section.id,section.path),record=remaining.get(key);
          if(!record)continue;
          remaining.delete(key);
          items.push({projectId:project.id,title:project.title,sectionId:section.id,sectionPath:section.path,updatedAt:record.updatedAt});
        }
      }catch{unavailable.push({projectId:project.id,title:project.title});}
    }
  }
  items.sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt)||a.title.localeCompare(b.title)||a.sectionId.localeCompare(b.sectionId));
  return {items,unmatched:remaining.size,unreadable,unavailable};
}

// Separate namespaces keep existing manuscript-only storage and its tests
// compatible. Only the routing metadata of recognized targets is returned.
import {componentRecoveryKey} from './component-recovery.mjs';
import {studyKinds} from '../../dist/preview-component.js';
const labels={note:'補足',tip:'ポイント',warning:'注意',important:'重要',example:'例題',exercise:'練習問題',explanation:'解説',custom:'新規自作教材部品'};
export async function listUnifiedRecovery(catalog,stores,readManifest,readLibrary){
  const namespaces=['manuscript','settings','components'];
  const remaining={},items=[],unavailable=[],storageErrors=[];
  let unreadable=0;
  for(const kind of namespaces){
    try{
      const result=await stores[kind].list();
      remaining[kind]=new Map(result.records.map(r=>[r.key,r]));
      unreadable+=result.unreadable;
    }catch(e){
      remaining[kind]=new Map();
      storageErrors.push({kind,message:String(e.message??e)});
    }
  }
  const count=()=>namespaces.reduce((n,k)=>n+remaining[k].size,0);
  function match(kind,key,item){
    const record=remaining[kind].get(key);
    if(!record)return;
    remaining[kind].delete(key);
    items.push({...item,kind,updatedAt:record.updatedAt});
  }
  if(count()){
    for(const project of await catalog.list()){
      if(!count())break;
      const base={projectId:project.id,title:project.title};
      try{
        const manifest=await readManifest(project.path);
        for(const section of manifest.sections){
          if(!remaining.manuscript.size)break;
          match('manuscript',recoveryKey(manifest.manifestPath,section.id,section.path),{...base,sectionId:section.id,sectionPath:section.path,targetLabel:section.path});
        }
        if(remaining.settings.size){
          match('settings',recoveryKey(manifest.manifestPath,'book-settings','book.yaml'),{...base,settingKind:'book-settings',targetLabel:'書籍設定'});
          if(manifest.themePath)match('settings',recoveryKey(manifest.manifestPath,'typography',manifest.themePath),{...base,settingKind:'typography',targetLabel:'フォント・スタイル設定'});
        }
        if(remaining.components.size&&manifest.themePath){
          function component(usage,level,entryId,targetLabel){
            const target={usage,level,entryId};
            match('components',componentRecoveryKey(manifest.manifestPath,manifest.themePath,target),{...base,target,targetLabel});
          }
          for(const level of ['default','1','2','3','4','5','6'])component('heading',level,null,level==='default'?'共通見出し':'見出し H'+level);
          component('paragraph','default',null,'本文フレーム');
          for(const level of [...studyKinds,'custom'])component('study',level,null,labels[level]??level);
          if(remaining.components.size){
            // Existing registered IDs are the only recoverable entry routes.
            // Missing IDs remain unmatched; do not guess a destination.
            const entries=await readLibrary(manifest.manifestPath);
            for(const entry of entries){
              const level=entry.usage==='study'?'custom':'default';
              component(entry.usage,level,entry.id,'登録部品：'+entry.name);
            }
          }
        }
      }catch{unavailable.push(base);}
    }
  }
  items.sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt)||a.title.localeCompare(b.title)||a.targetLabel.localeCompare(b.targetLabel));
  return {items,unmatched:count(),unreadable,unavailable,storageErrors};
}
