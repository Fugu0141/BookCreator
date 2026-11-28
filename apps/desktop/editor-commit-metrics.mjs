// Numeric local-only measurements, independent of React's profiling build.
const areas=['workspace','source','structured'];
export function createEditorCommitMetrics(limit=200){
  if(!Number.isInteger(limit)||limit<1||limit>1000)throw RangeError('Invalid editor metrics limit');
  let epoch=0,counts=Object.fromEntries(areas.map(area=>[area,0])),rows=[];
  return {
    epoch:()=>epoch,
    commit(area){if(areas.includes(area))counts[area]++;},
    input(ms,expectedEpoch){
      if(expectedEpoch!==epoch||!Number.isFinite(ms)||ms<0)return false;
      rows.push(ms);if(rows.length>limit)rows.shift();return true;
    },
    snapshot:()=>({counts:{...counts},inputMs:[...rows]}),
    clear(){epoch++;counts=Object.fromEntries(areas.map(area=>[area,0]));rows=[];}
  };
}
export function summarizeEditorInput(values){
  const sorted=[...values].sort((a,b)=>a-b),n=sorted.length;
  return {count:n,median:n?(n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2):null,p95:n?sorted[Math.ceil(n*.95)-1]:null};
}
export const editorCommitMetrics=createEditorCommitMetrics();
