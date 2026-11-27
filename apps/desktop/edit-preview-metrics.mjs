// Numeric, local-only samples. No source, file IDs, or DOM references in the store.
const modes=['full','partial','sparse','retained','fallback'];
export function createEditPreviewMetrics(limit=200){
  if(!Number.isInteger(limit)||limit<1||limit>1000)throw RangeError('Invalid edit preview metrics limit');
  let rows=[],epoch=0;
  return {
    epoch:()=>epoch,
    record({scope,mode,domMs,frameMs},expectedEpoch){
      if(expectedEpoch!==epoch||!['book','manuscript'].includes(scope)||!modes.includes(mode)||
         !Number.isFinite(domMs)||!Number.isFinite(frameMs)||domMs<0||frameMs<domMs)return false;
      rows.push({scope,mode,domMs,frameMs});
      if(rows.length>limit)rows.shift();
      return true;
    },
    snapshot:()=>rows.map(row=>({...row})),
    clear(){rows=[];epoch++;}
  };
}
export function summarizeEditPreviewMetrics(rows){
  const groups=new Map();
  for(const row of rows){
    const key=row.scope+':'+row.mode;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(row);
  }
  return [...groups.values()].map(group=>{
    const {scope,mode}=group[0];
    const stats=key=>{
      const values=group.map(r=>r[key]).sort((a,b)=>a-b),mid=Math.floor(values.length/2);
      return {median:values.length%2?values[mid]:(values[mid-1]+values[mid])/2,p95:values[Math.ceil(values.length*.95)-1]};
    };
    return {scope,mode,count:group.length,dom:stats('domMs'),frame:stats('frameMs')};
  });
}
export const editPreviewMetrics=createEditPreviewMetrics();

// Two successive animation callbacks are a frame-opportunity proxy, not a
// guarantee that pixels were presented. Observe only the latest visible edit.
export function createEditPreviewTracker({
  metrics=editPreviewMetrics,now=()=>performance.now(),
  schedule=cb=>requestAnimationFrame(cb),cancel=id=>cancelAnimationFrame(id)
}={}){
  let pending=null,frame=null,version=0;
  function reset(){
    version++;pending=null;
    if(frame!==null){cancel(frame);frame=null;}
  }
  return {
    reset,
    mark(started=now()){
      reset();
      pending={started,epoch:metrics.epoch()};
    },
    publish({scope,mode,current,visible}){
      const ticket=pending;
      pending=null;
      if(!ticket||!current()||!visible()||ticket.epoch!==metrics.epoch())return;
      const id=version,domMs=now()-ticket.started;
      const valid=()=>id===version&&current()&&visible()&&ticket.epoch===metrics.epoch();
      frame=schedule(()=>{
        if(id!==version)return;
        frame=null;
        if(!valid())return;
        frame=schedule(()=>{
          if(id!==version)return;
          frame=null;
          if(valid())metrics.record({scope,mode,domMs,frameMs:now()-ticket.started},ticket.epoch);
        });
      });
    }
  };
}
