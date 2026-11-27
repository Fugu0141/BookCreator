// Small in-memory log of cancelled retained jobs for the next successful
// publication of the same target. No source, path or target ID is exported.
// Take transfers ownership; all supplied records must be fresh numeric data.
export function createCancelledPreviewLog(limit=8){
  if(!Number.isSafeInteger(limit)||limit<1)throw RangeError('Invalid cancelled preview log limit');
  let target=null,jobs=[],dropped=0;
  function reset(next){target=next;jobs=[];dropped=0;}
  return {
    record(key,entry){
      if(key!==target)reset(key);
      if(jobs.length===limit){jobs.shift();dropped++;}
      jobs.push(entry);
    },
    take(key){
      if(key!==target)reset(key);
      const result={jobs,dropped};reset(null);return result;
    }
  };
}
