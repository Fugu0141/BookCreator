// Engine sparse output is not a complete preview. Resolve it against the
// exact previous host only after the caller verifies its snapshot lease.
const html='http://www.w3.org/1999/xhtml';
function readPages(root){
  if(!root||!root.ownerDocument)return null;
  const nodes=Array.from(root.childNodes),pages=new Map();
  let last=-1;
  for(const node of nodes){
    if(node.nodeType!==1||node.namespaceURI!==html||node.localName!=='div')return null;
    const raw=node.getAttribute('data-page'),index=Number(raw);
    if(raw===null||!Number.isSafeInteger(index)||index<0||String(index)!==raw||index<=last)return null;
    pages.set(index,node);last=index;
  }
  return pages;
}
/** Returns ordered actual nodes and the changed/reused partition. Never
 * moves nodes, changes navigation or grants publication authority. */
export function prepareSparsePaperAssembly(previousRoot,result){
  const nextRoot=result?.changedElement?.shadowRoot,plan=result?.plan,delta=result?.pageDelta;
  if(!nextRoot||nextRoot.host!==result.changedElement||nextRoot.host.isConnected!==false||
    !Array.isArray(plan?.pages)||!plan.pages.length||
    !plan.pages.every((p,i)=>p.index===i)||!Array.isArray(result.slices)||
    !Array.isArray(delta?.reusedPageIndices)||!delta.snapshot)return null;
  const generated=readPages(nextRoot);
  if(!generated)return null;
  const omitted=new Set(delta.reusedPageIndices);
  if(omitted.size!==delta.reusedPageIndices.length||[...omitted].some(i=>!Number.isSafeInteger(i)||i<0||i>=plan.pages.length))return null;
  if(generated.size+omitted.size!==plan.pages.length)return null;
  let previous=new Map();
  if(omitted.size){
    if(!previousRoot||previousRoot===nextRoot||previousRoot.ownerDocument!==nextRoot.ownerDocument||
      previousRoot.host?.isConnected!==true||previousRoot.host?.inert!==true)return null;
    previous=readPages(previousRoot);
    if(!previous||[...previous.keys()].some((index,i)=>index!==i))return null;
  }
  const pages=[];
  for(let index=0;index<plan.pages.length;index++){
    const reuse=omitted.has(index),node=reuse?previous.get(index):generated.get(index);
    if(!node||reuse&&generated.has(index))return null;
    pages.push({index,node,reuse});
  }
  // Each rendered fragment must correspond to the current plan and slice.
  // No dependence on the previous source revision or raw offsets.
  let cursor=0;
  for(const page of pages){
    const fragments=Array.from(page.node.querySelectorAll('[data-block]'));
    // Borrow the validated fragment order for the same synchronous publish transaction.
    page.fragments=fragments;
    const expected=plan.pages[page.index].fragments;
    if(!Array.isArray(expected)||fragments.length!==expected.length)return null;
    for(let i=0;i<fragments.length;i++){
      const el=fragments[i],slice=result.slices[cursor++],origin=expected[i].origin;
      if(!origin||!slice||slice.pageIndex!==page.index||
        slice.origin?.documentId!==origin.documentId||slice.origin?.blockKey!==origin.blockKey||
        el.getAttribute('data-document')!==origin.documentId||el.getAttribute('data-block')!==origin.blockKey)return null;
    }
  }
  if(cursor!==result.slices.length)return null;
  return {pages,reused:omitted.size,removed:[...previous].filter(([i])=>i>=pages.length).map(([,node])=>node)};
}
