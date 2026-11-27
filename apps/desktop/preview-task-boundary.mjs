// A real task boundary between independent host/Engine stages. The lane is
// not acquired until the caller has rechecked the latest generation.
export async function yieldCurrentPreview(current,yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0))){
  if(!current())return false;
  await yieldTask();
  return current();
}
