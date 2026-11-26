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
