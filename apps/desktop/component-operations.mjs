// Session-local editing helpers. No lock metadata enters theme or Engine input.
function walk(children,visit,parents=[]){
  for(let i=0;i<children.length;i++){
    const n=children[i];visit(n,parents,children,i);
    if(n.type==='group')walk(n.children,visit,[...parents,n.id]);
  }
}
export function subtreeSize(node){return 1+(node.type==='group'?node.children.reduce((n,c)=>n+subtreeSize(c),0):0);}
export function hasContent(node){return node.type==='content'||node.type==='slot'||(node.type==='group'&&node.children.some(hasContent));}
export function duplicateComponentNode(node,existingIds,makeId){
  if(hasContent(node))throw Error('原稿スロットを含む部品は複製できません');
  const used=new Set(existingIds);
  function copy(n){
    const id=makeId(n.type);
    if(typeof id!=='string'||!/^[-A-Za-z0-9_]{1,64}$/.test(id)||id==='root'||used.has(id))throw Error('Duplicate component ID');
    used.add(id);
    const clone=structuredClone(n);clone.id=id;
    if(n.type==='group')clone.children=n.children.map(copy);
    return clone;
  }
  return copy(node);
}
function index(children){
  const out=new Map();walk(children,(n,parents,siblings,i)=>out.set(n.id,{node:n,parents,before:siblings.slice(0,i).map(c=>c.id),after:siblings.slice(i+1).map(c=>c.id)}));return out;
}
export function isComponentLocked(children,id,locks){
  const e=index(children).get(id);
  return !!e&&[id,...e.parents].some(v=>locks.has(v));
}
// Protect direct subtree data, ancestry and relative stacking order among surviving siblings.
// Other siblings may be edited/inserted and can indirectly affect automatic flow placement.
export function lockedChange(before,after,locks){
  const old=index(before),next=index(after);
  for(const id of locks){
    const a=old.get(id),b=next.get(id);
    if(!a||!b||JSON.stringify(a.node)!==JSON.stringify(b.node)||JSON.stringify(a.parents)!==JSON.stringify(b.parents))return id;
    if(a.before.some(v=>b.after.includes(v))||a.after.some(v=>b.before.includes(v)))return id;
  }
  return null;
}
