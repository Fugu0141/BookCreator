// The editor owns its edit generation; rendering has an independent lifetime.
// A new request or an input/target invalidation supersedes every earlier result.
export function createLayoutRequestGate(){
  let current=0;
  return {
    begin(){return ++current;},
    invalidate(){++current;},
    isCurrent(request){return request===current;}
  };
}
