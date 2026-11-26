// Successful, published previews only. Separate bounded numeric store so phase
// samples do not evict unrelated queue/read measurements.
export const phaseKeys=Object.freeze(['validationMs','imagesMs','measurementMs','paginationMs','renderingMs','presentationMs']);
export function createPreviewPhaseMetrics(limit=200){
  if(!Number.isInteger(limit)||limit<1||limit>1000)throw RangeError('Invalid phase metrics limit');
  let rows=[];
  return {
    record(scope,cacheEnabled,timings,mathCacheEnabled=false,paragraphCacheEnabled=false,pageCacheEnabled=false,reusePaperPages=false){
      if(!['book','manuscript'].includes(scope)||typeof cacheEnabled!=='boolean'||typeof mathCacheEnabled!=='boolean'||typeof paragraphCacheEnabled!=='boolean'||typeof pageCacheEnabled!=='boolean'||typeof reusePaperPages!=='boolean'||(cacheEnabled&&paragraphCacheEnabled)||!timings||
        !phaseKeys.every(k=>Number.isFinite(timings[k])&&timings[k]>=0))return false;
      rows.push({scope,cacheEnabled,mathCacheEnabled,paragraphCacheEnabled,pageCacheEnabled,reusePaperPages,...Object.fromEntries(phaseKeys.map(k=>[k,timings[k]]))});
      if(rows.length>limit)rows.shift();
      return true;
    },
    snapshot(){return rows.map(row=>({...row}));},
    clear(){rows=[];}
  };
}
export function summarizePreviewPhases(rows){
  const groups=new Map();
  for(const row of rows){
    const key=row.scope+':'+row.cacheEnabled+':'+row.mathCacheEnabled+':'+row.paragraphCacheEnabled+':'+row.pageCacheEnabled+':'+row.reusePaperPages;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(row);
  }
  return [...groups.values()].map(group=>{
    const last=group.at(-1);
    const median=key=>{
      const values=group.map(row=>row[key]).sort((a,b)=>a-b),i=Math.floor(values.length/2);
      return values.length%2?values[i]:(values[i-1]+values[i])/2;
    };
    return {scope:last.scope,cacheEnabled:last.cacheEnabled,mathCacheEnabled:last.mathCacheEnabled,paragraphCacheEnabled:last.paragraphCacheEnabled,pageCacheEnabled:last.pageCacheEnabled,reusePaperPages:last.reusePaperPages,count:group.length,
      latest:Object.fromEntries(phaseKeys.map(k=>[k,last[k]])),
      median:Object.fromEntries(phaseKeys.map(k=>[k,median(k)]))};
  });
}
export const previewPhaseMetrics=createPreviewPhaseMetrics();
