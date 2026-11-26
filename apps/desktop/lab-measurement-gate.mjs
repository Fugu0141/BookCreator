// Shared measurement validity contract; a successful automatic measurement
// is equivalent to a successful explicit retry, never to a pending draft.
export function createLabMeasurementGate(){
  let generation=0,requested=null,accepted=null;
  return {
    invalidate(){generation++;requested=null;accepted=null;},
    begin(key){generation++;requested=key;accepted=null;return generation;},
    isCurrent(job){return job===generation;},
    matches(key){return requested===key;},
    accept(job,key){if(job!==generation||requested!==key)return false;accepted=key;return true;},
    isReady(key){return accepted!==null&&accepted===key&&requested===key;}
  };
}
