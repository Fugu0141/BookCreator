import React,{useState,useRef,useEffect} from 'react';
import {defaultHeadingDesign,compileHeadingDesign} from '../../dist/index.js';
import {createPlainTextPagePreview} from '../../../BookCreator_LayoutEngine/dist/index.js';

// Immutable tree edits; IDs remain stable when wrapping or unwrapping a group.
const flatten=(children,depth=0)=>children.flatMap(n=>[{node:n,depth},...(n.type==='group'?flatten(n.children,depth+1):[])]);
const containsContent=n=>n.type==='content'||(n.type==='group'&&n.children.some(containsContent));
function locate(children,id,parent=null,depth=0){
  const index=children.findIndex(n=>n.id===id);
  if(index>=0)return {node:children[index],index,siblings:children,parent,depth};
  for(const n of children)if(n.type==='group'){const match=locate(n.children,id,n,depth+1);if(match)return match;}
  return null;
}
function editChildren(children,parentId,fn){
  if(parentId===null)return fn(children);
  return children.map(n=>n.type==='group'?n.id===parentId?{...n,children:fn(n.children)}:{...n,children:editChildren(n.children,parentId,fn)}:n);
}
const flex=n=>n.type==='content'||n.width==='fill';
function rowSafe(children){
  // When switching a column to a row, retain the source-containing flexible node first.
  const keep=children.find(n=>flex(n)&&containsContent(n))??children.find(flex);
  return children.map(n=>n!==keep&&n.type!=='content'&&n.width==='fill'?{...n,width:n.type==='rect'?2000:20000}:n);
}

export function ComponentLab({design,typography,width,height,onApply,onCancel,busy,level,hasOverride,fontOptions}){
  const [draft,setDraft]=useState(()=>design?structuredClone(design):defaultHeadingDesign());
  const [sample,setSample]=useState('第1章　書籍制作をはじめよう');
  const [selected,setSelected]=useState(draft.children[0].id),[ready,setReady]=useState(false),[message,setMessage]=useState('未計測');
  const generation=useRef(0),target=useRef(null),nextId=useRef(0);
  const rows=flatten(draft.children),location=locate(draft.children,selected),node=location?.node;
  const siblings=location?.siblings??draft.children,parentId=location?.parent?.id??null,parentDirection=location?.parent?.direction??draft.direction;
  function invalidate(){generation.current++;target.current?.replaceChildren();setReady(false);setMessage('未計測');}
  useEffect(()=>()=>{generation.current++;},[]);
  function update(patch){invalidate();setDraft(d=>({...d,...patch}));}
  function updateNode(patch){update({children:editChildren(draft.children,parentId,a=>a.map(c=>c.id===selected?{...c,...patch}:c))});}
  function changeDirection(direction){update({direction,children:direction==='row'?rowSafe(draft.children):draft.children});}
  function changeGroupDirection(direction){
    if(direction===node.direction)return;
    if(direction==='canvas'){
      // Explicit conversion: coordinates are a starting draft, not an exact layout preservation.
      
      const children=node.children.map((c,i)=>({...c,x:0,y:i*12000,width:typeof c.width==='number'?c.width:Math.min(60000,Math.floor(width/2))}));
      updateNode({direction,gap:0,height:Math.min(100000,Math.max(50000,children.length*12000+20000)),children});setMessage('初期座標を設定しました。位置と高さを調整して再計測してください。');
    }else if(node.direction==='canvas'){
      if(!window.confirm('自動配置へ戻すと座標とCanvas高さは失われます。続けますか？'))return;
      const {height:oldHeight,...rest}=node;
      const children=node.children.map(c=>{const {x,y,...n}=c;if(n.type==='content'){const {width,...slot}=n;return slot;}return n;});
      update({children:editChildren(draft.children,parentId,a=>a.map(c=>c.id===selected?{...rest,direction,gap:1000,children:direction==='row'?rowSafe(children):children}:c))});
    }else updateNode({direction,children:direction==='row'?rowSafe(node.children):node.children});
  }
  function move(delta){const a=[...siblings],i=a.findIndex(c=>c.id===selected),j=i+delta;if(i<0||j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];update({children:editChildren(draft.children,parentId,()=>a)});}
  const targetChildren=node?.type==='group'?node.children:siblings;
  function newId(type){let id;do{id=type+'-'+(++nextId.current);}while(rows.some(r=>r.node.id===id));return id;}
  function add(type='rect'){if(targetChildren.length>=8||rows.length>=32)return;const id=newId(type),direction=node?.type==='group'?node.direction:parentDirection,targetId=node?.type==='group'?node.id:parentId;let child=type==='label'?{id,type:'label',width:direction==='column'?'fill':20000,text:'CHAPTER',fontSize:3000,lineHeight:1.5,color:'#315b86'}:{id,type:'rect',width:direction==='column'?'fill':2000,height:3000,color:'#315b86'};if(direction==='canvas')child={...child,x:0,y:0,width:type==='label'?20000:5000};update({children:editChildren(draft.children,targetId,a=>[...a,child])});setSelected(id);}
  function wrap(withNext=false){if(!location||parentDirection==='canvas'||rows.length>=32)return;const i=location.index,items=siblings.slice(i,i+(withNext?2:1));if(withNext&&items.length!==2)return;const id=newId('group');const width=items.some(flex)?'fill':Math.max(...items.map(n=>n.width));const group={id,type:'group',width,direction:'column',gap:1000,padding:0,background:'#ffffff',children:items};update({children:editChildren(draft.children,parentId,a=>[...a.slice(0,i),group,...a.slice(i+items.length)])});setSelected(id);}
  function unwrapGroup(){if(node?.type!=='group'||node.direction==='canvas'||parentDirection==='canvas'||siblings.length-1+node.children.length>8)return;const i=location.index;update({children:editChildren(draft.children,parentId,a=>[...a.slice(0,i),...node.children,...a.slice(i+1)])});setSelected(node.children[0].id);}
  function remove(){if(!node||containsContent(node)||siblings.length===1)return;const children=siblings.filter(c=>c.id!==selected);update({children:editChildren(draft.children,parentId,()=>children)});setSelected(children[0].id);}
  async function measure(){
    invalidate();const job=generation.current;
    try{
      const compiled=compileHeadingDesign(draft,typography.heading);
      const result=await createPlainTextPagePreview(document,{revision:String(job),fingerprint:'component-lab-'+job,width,height,blocks:[{origin:{documentId:'sample',revision:String(job),blockKey:'heading'},request:{text:sample,width,fontSize:compiled.fontSize,lineHeight:compiled.lineHeight,...compiled.textStyle},splitPolicy:'strict',component:compiled.component}]});
      if(job!==generation.current)return;
      target.current.append(result.element);setReady(true);
      setMessage('実測高さ '+(result.plan.pages[0].fragments[0].rect.height/1000).toFixed(2)+' mm');
    }catch(e){if(job===generation.current)setMessage(String(e.message??e));}
  }
  function setFont(target,font){
    if(target==='content'){
      const {font:old,...rest}=draft;invalidate();setDraft(font?{...rest,font}:rest);
    }else{
      const {font:old,...rest}=node;update({children:editChildren(draft.children,parentId,a=>a.map(c=>c.id===selected?(font?{...rest,font}:rest):c))});
    }
  }
  function fontControl(target,font){
    const weights=fontOptions.find(f=>f.id===font?.id)?.weights??[];
    return <div><label>フォント<select id={'lab-font-'+target} value={font?.id??''} disabled={busy} onChange={e=>{const f=fontOptions.find(f=>f.id===e.target.value);setFont(target,f?{id:f.id,weight:f.weights.includes(400)?400:f.weights[0]}:null);}}><option value="">見出しフォントを継承</option>{fontOptions.map(f=><option key={f.id} value={f.id} disabled={f.disabled}>{f.label}</option>)}</select></label>{font&&<label>ウェイト<select id={'lab-weight-'+target} value={font.weight} disabled={busy} onChange={e=>setFont(target,{...font,weight:Number(e.target.value)})}>{weights.map(w=><option key={w}>{w}</option>)}</select></label>}</div>;
  }
  const length=(label,value,change,id,min=0,max=100)=> <label>{label} (mm)<input id={id} type="number" min={min} max={max} step=".1" value={value/1000} disabled={busy} onChange={e=>change(Math.round(Number(e.target.value)*1000))}/></label>;
  return <div className="lab-overlay"><section className="component-lab" role="dialog" aria-modal="true" aria-label="Component Lab"><header><strong>Component Lab / {level==='default'?'共通見出し':'H'+level}</strong><button id="lab-cancel" disabled={busy} onClick={onCancel}>破棄して閉じる</button></header><div className="lab-grid"><section><h3>構造</h3><label>配置<select id="lab-direction" value={draft.direction} disabled={busy} onChange={e=>changeDirection(e.target.value)}><option value="row">行（横）</option><option value="column">列（縦）</option></select></label>{rows.map(({node:c,depth})=><button style={{paddingLeft:8+depth*16}} className={selected===c.id?'active':''} key={c.id} data-lab-node={c.id} disabled={busy} onClick={()=>setSelected(c.id)}>{c.type==='content'?'本文スロット':c.type==='label'?'固定テキスト':c.type==='group'?(c.direction==='canvas'?'Canvas':c.direction==='row'?'横グループ':'縦グループ'):'装飾矩形'} · {c.id}</button>)}<div className="lab-row"><button disabled={busy||siblings[0].id===selected} onClick={()=>move(-1)}>↑</button><button disabled={busy||siblings.at(-1).id===selected} onClick={()=>move(1)}>↓</button><button id="lab-add" disabled={busy||targetChildren.length>=8||rows.length>=32} onClick={()=>add()}>矩形追加</button><button id="lab-add-label" disabled={busy||targetChildren.length>=8||rows.length>=32} onClick={()=>add('label')}>文字追加</button><button disabled={busy||!node||containsContent(node)||siblings.length===1} onClick={remove}>削除</button><button id="lab-group" disabled={busy||!node||parentDirection==='canvas'||rows.length>=32} onClick={()=>wrap()}>グループ化</button><button id="lab-group-next" disabled={busy||!node||parentDirection==='canvas'||location.index===siblings.length-1||rows.length>=32} onClick={()=>wrap(true)}>次の要素とグループ化</button><button id="lab-ungroup" disabled={busy||node?.type!=='group'||node.direction==='canvas'||parentDirection==='canvas'||siblings.length-1+(node?.children?.length??0)>8} onClick={unwrapGroup}>グループ解除</button></div>{parentDirection==='canvas'&&node&&<><h3>自由配置座標</h3>{length('X',node.x,v=>updateNode({x:v}),'lab-canvas-x')}{length('Y',node.y,v=>updateNode({y:v}),'lab-canvas-y')}{node.type==='content'&&length('幅',node.width,v=>updateNode({width:v}),'lab-canvas-content-width',.1)}<small>左上からの距離。前後順はツリー順で、後の要素が手前です。</small></>}<h3>原稿スロットのスタイル</h3>{fontControl('content',draft.font)}{length('間隔',draft.gap,v=>update({gap:v}),'lab-gap')}{length('内側余白',draft.padding,v=>update({padding:v}),'lab-padding')}{length('文字サイズ',draft.fontSize,v=>update({fontSize:v}),'lab-font-size',2,30)}<label>行高倍率<input type="number" step=".05" min="1.25" max="4" value={draft.lineHeight} disabled={busy} onChange={e=>update({lineHeight:Number(e.target.value)})}/></label><label>文字色<input type="color" value={draft.textColor} disabled={busy} onChange={e=>update({textColor:e.target.value})}/></label><label>背景色<input type="color" value={draft.background} disabled={busy} onChange={e=>update({background:e.target.value})}/></label>{node?.type==='group'&&<><h3>選択したグループ</h3><label>配置<select id="lab-group-direction" value={node.direction} disabled={busy} onChange={e=>changeGroupDirection(e.target.value)}><option value="row">行（横）</option><option value="column">列（縦）</option><option value="canvas">Canvas（自由配置）</option></select></label>{parentDirection!=='canvas'&&<label><input type="checkbox" checked={node.width==='fill'} disabled={busy} onChange={e=>updateNode({width:e.target.checked?'fill':30000})}/>幅を領域に合わせる</label>}{node.width!=='fill'&&length('幅',node.width,v=>updateNode({width:v}),'lab-group-width',.1)}{node.direction==='canvas'?length('固定高さ',node.height,v=>updateNode({height:v}),'lab-canvas-height',.1):length('間隔',node.gap,v=>updateNode({gap:v}),'lab-group-gap')}{length('内側余白',node.padding,v=>updateNode({padding:v}),'lab-group-padding')}<label>背景色<input type="color" value={node.background} disabled={busy} onChange={e=>updateNode({background:e.target.value})}/></label></>}{node?.type==='rect'&&<><h3>選択した矩形</h3>{parentDirection==='column'&&<label><input type="checkbox" checked={node.width==='fill'} disabled={busy} onChange={e=>updateNode({width:e.target.checked?'fill':2000})}/>幅を領域に合わせる</label>}{node.width!=='fill'&&length('幅',node.width,v=>updateNode({width:v}),'lab-rect-width',.1)}{length('高さ',node.height,v=>updateNode({height:v}),'lab-rect-height',.1)}<label>色<input type="color" value={node.color} disabled={busy} onChange={e=>updateNode({color:e.target.value})}/></label></>}{node?.type==='label'&&<><h3>選択した固定テキスト</h3><label>文字列<input id="lab-label-text" maxLength={256} value={node.text} disabled={busy} onChange={e=>updateNode({text:e.target.value})}/></label>{parentDirection==='column'&&<label><input type="checkbox" checked={node.width==='fill'} disabled={busy} onChange={e=>updateNode({width:e.target.checked?'fill':20000})}/>幅を領域に合わせる</label>}{node.width!=='fill'&&length('幅',node.width,v=>updateNode({width:v}),'lab-label-width',.1)}{fontControl('label',node.font)}{length('文字サイズ',node.fontSize,v=>updateNode({fontSize:v}),'lab-label-size',2,30)}<label>行高倍率<input type="number" step=".05" min="1.25" max="4" value={node.lineHeight} disabled={busy} onChange={e=>updateNode({lineHeight:Number(e.target.value)})}/></label><label>文字色<input type="color" value={node.color} disabled={busy} onChange={e=>updateNode({color:e.target.value})}/></label></>}</section><section><h3>実測サンプル</h3><label>サンプル文字列<input id="lab-sample" value={sample} maxLength={1000} disabled={busy} onChange={e=>{invalidate();setSample(e.target.value);}}/></label><p>未指定のフォントは書籍の見出し設定を継承します。サンプル文字列は保存しません。固定テキストは部品定義に保存されます。</p><button id="lab-measure" disabled={busy} onClick={()=>void measure()}>実測プレビュー</button><div id="lab-status" role="status">{message}</div><div id="lab-preview" ref={target}/></section></div><footer><button id="lab-apply" disabled={busy||!ready} onClick={()=>onApply(draft)}>テーマへ適用・保存</button>{hasOverride&&<button id="lab-reset" disabled={busy} onClick={()=>{if(window.confirm("個別デザインを削除して継承に戻しますか？"))onApply(null);}}>登録解除・継承へ</button>}<span>見出し部品は分割しません。正式出版は未対応。</span></footer></section></div>;
}
