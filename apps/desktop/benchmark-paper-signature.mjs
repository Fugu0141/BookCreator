// Attribute insertion order is not part of DOM equivalence. Keep namespace,
// attribute names and exact values, node kinds, text and child order. Do not
// normalize CSS declaration order or omit navigation attributes.
export function benchmarkPaperSignature(root){
  function encode(node){
    if(node.nodeType===1){
      const attrs=Array.from(node.attributes,a=>[a.namespaceURI,a.name,a.value]);
      attrs.sort((a,b)=>{
        const left=JSON.stringify(a.slice(0,2)),right=JSON.stringify(b.slice(0,2));
        return left<right?-1:left>right?1:0;
      });
      return [node.nodeType,node.namespaceURI,node.nodeName,attrs,Array.from(node.childNodes,encode)];
    }
    return [node.nodeType,node.nodeName,node.nodeValue,Array.from(node.childNodes,encode)];
  }
  return JSON.stringify(Array.from(root.querySelectorAll('[data-page]'),p=>JSON.stringify(encode(p))));
}
