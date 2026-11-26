import test from 'node:test';
import assert from 'node:assert/strict';
import {benchmarkPaperSignature} from '../benchmark-paper-signature.mjs';
const attr=(name,value,namespaceURI=null)=>({name,value,namespaceURI});
const textNode=value=>({nodeType:3,nodeName:'#text',nodeValue:value,childNodes:[]});
const element=(attributes,childNodes=[],namespaceURI='http://www.w3.org/1999/xhtml',nodeName='DIV')=>({nodeType:1,nodeName,namespaceURI,attributes,childNodes});
const signature=(...pages)=>benchmarkPaperSignature({querySelectorAll:selector=>{assert.equal(selector,'[data-page]');return pages;}});
test('attribute order alone does not change the paper signature',()=>{
  const attrs=[attr('data-block','941'),attr('tabindex','0'),attr('style','color: black; width: 5px;')];
  assert.equal(signature(element(attrs,[textNode('本文')])),signature(element([...attrs].reverse(),[textNode('本文')])));
});
test('attribute values, CSS order, text, structure, namespaces and page order remain significant',()=>{
  const attrs=[attr('tabindex','0'),attr('style','color: black; width: 5px;')];
  const a=element(attrs,[textNode('本文'),element([])]);
  const baseline=signature(a);
  for(const other of [
    element([attr('tabindex','1'),attrs[1]],a.childNodes),
    element([attrs[0],attr('style','width: 5px; color: black;')],a.childNodes),
    element([attrs[1]],a.childNodes),
    element(attrs,[textNode('別文'),element([])]),
    element(attrs,[...a.childNodes].reverse()),
    element(attrs,a.childNodes,'http://www.w3.org/1998/Math/MathML'),
    element([attr('tabindex','0','urn:test'),attrs[1]],a.childNodes),
    element(attrs,a.childNodes,'http://www.w3.org/1999/xhtml','SPAN')
  ])assert.notEqual(signature(other),baseline);
  const b=element([],[textNode('次ページ')]);
  assert.notEqual(signature(a,b),signature(b,a));
  assert.notEqual(signature(a,b),baseline);
});
