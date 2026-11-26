import React,{useEffect,useRef,useState} from 'react';
import * as core from '../../dist/index.js';
import {createPlainTextPagePreview} from '../../../BookCreator_LayoutEngine/dist/index.js';
import {catalogSampleOptions} from './catalog-sample.mjs';
import {measurementLane} from './measurement-lane.mjs';

let revision=0;
// Each mounted card retains its own successful immutable sample, but only
// intersecting cards may queue measurement. No fake specimen on failure.
export function CatalogSpecimen({card,typography,geometry,enabled,resolveImage}){
  const viewport=useRef(null),complete=useRef(false);
  const [visible,setVisible]=useState(false),[phase,setPhase]=useState('pending'),[message,setMessage]=useState('');
  useEffect(()=>{
    const node=viewport.current;if(!node)return;
    const observer=new IntersectionObserver(entries=>setVisible(entries.some(e=>e.isIntersecting)),{rootMargin:'40px'});
    observer.observe(node);return ()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    if(!enabled||!visible||complete.current||!geometry)return;
    let current=true;
    setPhase('pending');setMessage('');
    const id=String(++revision);
    void measurementLane.run(async()=>{
      const options=catalogSampleOptions(card,{typography,...geometry.content,revision:id},core);
      return createPlainTextPagePreview(document,{...options,resolveImage:id=>resolveImage(id,()=>current)});
    },{priority:'catalog',current:()=>current}).then(result=>{
      if(!current||!result||!viewport.current)return;
      result.element.inert=true;
      result.element.style.width='max-content';
      viewport.current.replaceChildren(result.element);
      complete.current=true;setPhase('ready');
    }).catch(error=>{if(current){setPhase('error');setMessage(String(error.message??error));}});
    return ()=>{current=false;};
  },[enabled,visible]);
  useEffect(()=>{
    const node=viewport.current;if(!node)return;
    const fit=()=>{
      const host=node.firstElementChild,page=host?.shadowRoot?.querySelector('[data-page]');
      if(!page)return;
      const width=page.offsetWidth;
      if(width>0&&node.clientWidth>0)host.style.zoom=String(Math.min(1,node.clientWidth/width));
    };
    fit();const resize=new ResizeObserver(fit),mutation=new MutationObserver(fit);
    resize.observe(node);mutation.observe(node,{childList:true});return ()=>{resize.disconnect();mutation.disconnect();};
  },[]);
  return <div className="catalog-measured" data-preview-phase={phase}><div className="catalog-measured-paper" ref={viewport} aria-label={card.name+'の実測見本'}/>{phase!=='ready'&&<small className="catalog-measured-state" title={message}>{!geometry?'用紙設定を確認してください':phase==='error'?'実測できませんでした':'実測待ち…'}</small>}</div>;
}
