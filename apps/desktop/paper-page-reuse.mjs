// Compare a retained inert paper and the next detached, fully decorated paper.
// This is a planning boundary: no mutation, event binding or publication.
const unsupported='[data-component],[data-list-item],[data-display-math],canvas,img,image,video,audio,iframe,object,embed,input,textarea,select,button,slot,script,style,link,[contenteditable]';
function directPages(root){
  const pages=Array.from(root.childNodes);
  // The current engine emits exactly one direct HTML div per zero-based page.
  // Unknown root content must use full host replacement instead.
  return pages.length&&pages.every((p,i)=>p.nodeType===1&&p.namespaceURI==='http://www.w3.org/1999/xhtml'&&p.localName==='div'&&p.getAttribute('data-page')===String(i))?pages:null;
}
function eligible(page){
  if(page.hasAttribute('contenteditable')||page.shadowRoot||page.querySelector(unsupported))return false;
  // isEqualNode cannot establish equality of nested shadow trees or custom
  // element state. Conservatively exclude custom/unknown interactive content.
  return Array.from(page.querySelectorAll('*')).every(node=>!node.shadowRoot&&!node.localName.includes('-')&&!node.hasAttribute('is'));
}
export function planPaperPageReuse(previousRoot,nextRoot){
  if(!previousRoot||!nextRoot||previousRoot===nextRoot||
    !previousRoot.ownerDocument||previousRoot.ownerDocument!==nextRoot.ownerDocument||
    previousRoot.host?.inert!==true||previousRoot.host?.isConnected!==true||
    nextRoot.host?.isConnected!==false)return null;
  const previous=directPages(previousRoot),next=directPages(nextRoot);
  if(!previous||!next)return null;
  const pages=next.map((candidate,index)=>{
    const old=previous[index];
    const reuse=!!old&&eligible(old)&&eligible(candidate)&&old.isEqualNode(candidate);
    return {index,previous:old??null,next:candidate,reuse};
  });
  return {pages,removed:previous.slice(next.length),reused:pages.filter(p=>p.reuse).length};
}
