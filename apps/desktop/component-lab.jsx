import React,{useState,useRef,useEffect} from 'react';
import {defaultHeadingDesign,compileHeadingDesign} from '../../dist/index.js';
import {createPlainTextPagePreview} from '../../../BookCreator_LayoutEngine/dist/index.js';
export function ComponentLab({design,typography,width,height,onApply,onCancel,busy}){
  const [draft,setDraft]=useState(()=>design?structuredClone(design):defaultHeadingDesign());
  const [sample,setSample]=useState('第1章　書籍制作をはじめよう');
  const [selected,setSelected]=useState(draft.children[0].id),[ready,setReady]=useState(false),[message,setMessage]=useState('未計測');
  const generation=useRef(0),target=useRef(null),nextId=useRef(0);
  const node=draft.children.find(c=>c.id===selected);
  function invalidate(){generation.current++;target.current?.replaceChildren();setReady(false);setMessage('未計測');}
  useEffect(()=>()=>{generation.current++;},[]);
  function update(patch){invalidate();setDraft(d=>({...d,...patch}));}
  function updateNode(patch){update({children:draft.children.map(c=>c.id===selected?{...c,...patch}:c)});}
  function changeDirection(direction){update({direction,children:draft.children.map(c=>c.type==='rect'&&direction==='row'&&c.width==='fill'?{...c,width:2000}:c)});}
  function move(delta){const a=[...draft.children],i=a.findIndex(c=>c.id===selected),j=i+delta;if(i<0||j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];update({children:a});}
  function add(){if(draft.children.length>=8)return;let id;do{id='rect-'+(++nextId.current);}while(draft.children.some(c=>c.id===id));update({children:[...draft.children,{id,type:'rect',width:draft.direction==='column'?'fill':2000,height:3000,color:'#315b86'}]});setSelected(id);}
  function remove(){if(node?.type!=='rect')return;const children=draft.children.filter(c=>c.id!==selected);update({children});setSelected(children[0].id);}
  async function measure(){
    invalidate();const job=generation.current;
    try{
      const compiled=compileHeadingDesign(draft);
      const result=await createPlainTextPagePreview(document,{revision:String(job),fingerprint:'component-lab-'+job,width,height,blocks:[{origin:{documentId:'sample',revision:String(job),blockKey:'heading'},request:{text:sample,width,fontSize:compiled.fontSize,lineHeight:compiled.lineHeight,...typography.heading},splitPolicy:'strict',component:compiled.component}]});
      if(job!==generation.current)return;
      target.current.append(result.element);setReady(true);
      setMessage('実測高さ '+(result.plan.pages[0].fragments[0].rect.height/1000).toFixed(2)+' mm');
    }catch(e){if(job===generation.current)setMessage(String(e.message??e));}
  }
  const length=(label,value,change,id,min=0,max=100)=> <label>{label} (mm)<input id={id} type="number" min={min} max={max} step=".1" value={value/1000} disabled={busy} onChange={e=>change(Math.round(Number(e.target.value)*1000))}/></label>;
  return <div className="lab-overlay"><section className="component-lab" role="dialog" aria-modal="true" aria-label="Component Lab"><header><strong>Component Lab / 見出し部品</strong><button id="lab-cancel" disabled={busy} onClick={onCancel}>破棄して閉じる</button></header><div className="lab-grid"><section><h3>構造</h3><label>配置<select id="lab-direction" value={draft.direction} disabled={busy} onChange={e=>changeDirection(e.target.value)}><option value="row">行（横）</option><option value="column">列（縦）</option></select></label>{draft.children.map(c=><button className={selected===c.id?'active':''} key={c.id} data-lab-node={c.id} disabled={busy} onClick={()=>setSelected(c.id)}>{c.type==='content'?'本文スロット':'装飾矩形'} · {c.id}</button>)}<div className="lab-row"><button disabled={busy||draft.children[0].id===selected} onClick={()=>move(-1)}>↑</button><button disabled={busy||draft.children.at(-1).id===selected} onClick={()=>move(1)}>↓</button><button id="lab-add" disabled={busy||draft.children.length>=8} onClick={add}>矩形追加</button><button disabled={busy||node?.type!=='rect'} onClick={remove}>削除</button></div><h3>スタイル</h3>{length('間隔',draft.gap,v=>update({gap:v}),'lab-gap')}{length('内側余白',draft.padding,v=>update({padding:v}),'lab-padding')}{length('文字サイズ',draft.fontSize,v=>update({fontSize:v}),'lab-font-size',2,30)}<label>行高倍率<input type="number" step=".05" min="1.25" max="4" value={draft.lineHeight} disabled={busy} onChange={e=>update({lineHeight:Number(e.target.value)})}/></label><label>文字色<input type="color" value={draft.textColor} disabled={busy} onChange={e=>update({textColor:e.target.value})}/></label><label>背景色<input type="color" value={draft.background} disabled={busy} onChange={e=>update({background:e.target.value})}/></label>{node?.type==='rect'&&<><h3>選択した矩形</h3>{draft.direction==='column'&&<label><input type="checkbox" checked={node.width==='fill'} disabled={busy} onChange={e=>updateNode({width:e.target.checked?'fill':2000})}/>幅を領域に合わせる</label>}{node.width!=='fill'&&length('幅',node.width,v=>updateNode({width:v}),'lab-rect-width',.1)}{length('高さ',node.height,v=>updateNode({height:v}),'lab-rect-height',.1)}<label>色<input type="color" value={node.color} disabled={busy} onChange={e=>updateNode({color:e.target.value})}/></label></>}</section><section><h3>実測サンプル</h3><label>サンプル文字列<input id="lab-sample" value={sample} maxLength={1000} disabled={busy} onChange={e=>{invalidate();setSample(e.target.value);}}/></label><p>フォントは書籍の見出し設定を継承します。サンプル文字列は保存しません。</p><button id="lab-measure" disabled={busy} onClick={()=>void measure()}>実測プレビュー</button><div id="lab-status" role="status">{message}</div><div id="lab-preview" ref={target}/></section></div><footer><button id="lab-apply" disabled={busy||!ready} onClick={()=>onApply(draft)}>テーマへ適用・保存</button><span>見出し部品は分割しません。正式出版は未対応。</span></footer></section></div>;
}
