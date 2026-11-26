// Local bounded numeric measurements only. Never store project paths, text,
// identifiers, diagnostics, wall-clock timestamps, or raw engine results.
const stages=new Set(['measurement','layout','read']);
const categories=new Set(['manuscript','book','component','paragraph','catalog','source','image','other']);
const outcomes=new Set(['success','failed','cancelled']);
const duration=v=>Number.isFinite(v)?Math.max(0,v):0;
export function createPerformanceMetrics(limit=200){
  if(!Number.isInteger(limit)||limit<1||limit>1000)throw RangeError('Invalid metrics limit');
  let rows=[];
  return {
    record({stage,category,outcome,waitMs=0,runMs=0,retries=0}){
      if(!stages.has(stage)||!categories.has(category)||!outcomes.has(outcome))return;
      rows.push({stage,category,outcome,waitMs:duration(waitMs),runMs:duration(runMs),retries:Number.isSafeInteger(retries)&&retries>=0?retries:0});
      if(rows.length>limit)rows.shift();
    },
    snapshot(){return rows.map(row=>({...row}));},
    clear(){rows=[];}
  };
}
export function summarizePerformance(rows){
  const groups=new Map();
  for(const row of rows){
    const key=row.stage+':'+row.category;
    if(!groups.has(key))groups.set(key,{stage:row.stage,category:row.category,success:0,failed:0,cancelled:0,retries:0,wait:[],run:[]});
    const group=groups.get(key);
    group[row.outcome]++;group.retries+=row.retries;
    if(row.outcome==='success'){group.wait.push(row.waitMs);group.run.push(row.runMs);}
  }
  const median=values=>{
    const sorted=[...values].sort((a,b)=>a-b),n=sorted.length;
    return !n?null:n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2;
  };
  return [...groups.values()].map(({wait,run,...g})=>({...g,medianWaitMs:median(wait),medianRunMs:median(run),maxRunMs:run.length?Math.max(...run):null}));
}
export const performanceMetrics=createPerformanceMetrics();
