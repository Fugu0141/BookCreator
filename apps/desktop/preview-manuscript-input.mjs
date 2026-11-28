// Capture the exact immutable document projection at submission, not when
// a queued job starts. A delayed automatic reservation must still be current.
// Whole-book requests are allowed before any manuscript is selected.
export function capturePreviewManuscript(store,whole,requested){
  const current=store.getPreviewInput();
  if(requested!==undefined&&requested!==current)return null;
  if(!whole&&!current.file)return null;
  return current;
}
