// Pure, deterministic paired benchmark design. Each arm has one untimed-for-comparison
// primer and one measured repeat. Alternate order to reduce systematic warm-up bias.
export function cacheComparisonPlan(){
  return Array.from({length:4},(_,i)=>({
    pair:i+1,order:i%2===0?['uncached','warm']:['warm','uncached']
  }));
}
export function summarizeCacheComparison(samples,scope='book'){
  if(!['book','manuscript'].includes(scope))throw RangeError('Invalid comparison scope');
  const lookup=new Map();
  for(const sample of samples){
    if(lookup.has(sample.label))throw Error('Duplicate benchmark sample: '+sample.label);
    lookup.set(sample.label,sample);
  }
  const pairs=cacheComparisonPlan().map(({pair,order})=>{
    function elapsed(arm){
      const row=lookup.get('cache-pair-'+pair+'-'+arm);
      if(!row||row.scope!==scope||!Number.isFinite(row.elapsedMs)||row.elapsedMs<=0)
        throw Error('Missing or invalid cache comparison sample: '+pair+' '+arm);
      return row.elapsedMs;
    }
    const uncachedMs=elapsed('uncached'),warmMs=elapsed('warm');
    return {pair,order,uncachedMs,warmMs,deltaMs:warmMs-uncachedMs,ratio:warmMs/uncachedMs};
  });
  const median=values=>{
    const sorted=[...values].sort((a,b)=>a-b),mid=sorted.length/2;
    return (sorted[mid-1]+sorted[mid])/2;
  };
  return {pairs,medianUncachedMs:median(pairs.map(p=>p.uncachedMs)),
    medianWarmMs:median(pairs.map(p=>p.warmMs)),medianPairedDeltaMs:median(pairs.map(p=>p.deltaMs)),
    medianPairedRatio:median(pairs.map(p=>p.ratio))};
}
