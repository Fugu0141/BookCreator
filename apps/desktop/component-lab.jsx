import React,{useState,useRef,useEffect} from 'react';
import {defaultHeadingDesign,compileHeadingDesign} from '../../dist/index.js';
import {createHistory,commitHistory,undoHistory,redoHistory} from './lab-history.mjs';
import {installCanvasDrag,highlightCanvasSelection,focusCanvasSelection} from './canvas-interaction.mjs';
import {duplicateComponentNode,subtreeSize,isComponentLocked,lockedChange} from './component-operations.mjs';
import {proportionalImageSize,emptyCrop,updateCrop} from './image-frame.mjs';
import {alignCanvasRects,measuredAlignment} from './canvas-alignment.mjs';
import {createPlainTextPagePreview} from '../../../BookCreator_LayoutEngine/dist/index.js';

// Immutable tree edits; IDs remain stable when wrapping or unwrapping a group.
const flatten=(children,depth=0)=>children.flatMap(n=>[{node:n,depth},...(n.type==='group'?flatten(n.children,depth+1):[])]);
const dynamicChoices=[['chapter-number','章番号'],['chapter-title','章タイトル'],['heading-number','階層見出し番号'],['heading-title','現在の見出し文字列'],['heading-level','見出しレベル']];
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

export function ComponentLab({design,typography,width,height,onApply,onCancel,busy,level,hasOverride,fontOptions,imageOptions=[],resolveImage,library,libraryEditable,libraryMessage,onLibraryAction}){
  const [libraryId,setLibraryId]=useState(''),[libraryName,setLibraryName]=useState('');
  const entries=library?.entries??[],libraryEntry=entries.find(e=>e.id===libraryId);
  const [history,setHistory]=useState(()=>createHistory(design?structuredClone(design):defaultHeadingDesign()));
  const historyRef=useRef(history),draft=history.present;
  const [dragging,setDragging]=useState(false),[alignmentIds,setAlignmentIds]=useState([]);
  const [locks,setLocks]=useState(()=>new Set()),locksRef=useRef(new Set());
  const [ratioLocks,setRatioLocks]=useState(()=>new Set()),ratioRef=useRef(new Set());
  const [smartSnap,setSmartSnap]=useState(true),smartSnapRef=useRef(true);
  const dragCleanup=useRef(null),selectionRef=useRef(null),alignmentRef=useRef([]);
  const [sample,setSample]=useState('第1章　書籍制作をはじめよう');
  const [selected,setSelected]=useState(draft.children[0].id),[ready,setReady]=useState(false),[message,setMessage]=useState('未計測');
  const generation=useRef(0),target=useRef(null),nextId=useRef(0);
  const rows=flatten(draft.children),location=locate(draft.children,selected),node=location?.node;
  const siblings=location?.siblings??draft.children,parentId=location?.parent?.id??null,parentDirection=location?.parent?.direction??draft.direction;
  const locked=id=>isComponentLocked(draft.children,id,locks);
  const selectedLocked=locked(selected);
  const inheritedLock=selectedLocked&&!locks.has(selected);
  function toggleLock(){if(!node||inheritedLock||dragging||busy)return;const next=new Set(locksRef.current);if(next.has(selected))next.delete(selected);else next.add(selected);locksRef.current=next;setLocks(next);setAlignment([]);}
  function invalidate(){generation.current++;dragCleanup.current?.();dragCleanup.current=null;target.current?.replaceChildren();setReady(false);setMessage('未計測');}
  useEffect(()=>()=>{generation.current++;dragCleanup.current?.();},[]);
  useEffect(()=>{selectionRef.current=selected;const root=target.current?.firstElementChild?.shadowRoot;if(root)highlightCanvasSelection(root,alignmentIds.length?alignmentIds:selected,id=>isComponentLocked(draft.children,id,locks));},[selected,alignmentIds,locks,draft]);
  function setAlignment(ids){alignmentRef.current=ids;setAlignmentIds(ids);}
  function selectSingle(id){setAlignment([]);selectionRef.current=id;setSelected(id);}
  function toggleAlignment(id,checked){
    if(parentDirection!=='canvas'||!siblings.some(c=>c.id===id)||id===selected||locked(id)||selectedLocked)return;
    const ids=alignmentRef.current.length?alignmentRef.current:[selected];
    setAlignment(checked?[...new Set([...ids,id])]:ids.filter(v=>v!==id));
  }
  async function align(mode){
    if(!ready||busy||dragging||alignmentRef.current.length<(mode.startsWith('distribute-')?3:2)||location?.parent?.direction!=='canvas')return;
    try{
      const root=target.current?.firstElementChild?.shadowRoot;
      if(!root)throw Error('Canvas not measured');
      const current=historyRef.current.present,parent=locate(current.children,selected)?.parent;
      if(!parent||parent.direction!=='canvas')throw Error('Canvas selection changed');
      const {rects,bounds}=measuredAlignment(root,parent,alignmentRef.current);
      const patches=new Map(alignCanvasRects(rects,mode,bounds).map(({id,...position})=>[id,position]));
      const next={...current,children:editChildren(current.children,parent.id,a=>a.map(n=>patches.has(n.id)?{...n,...patches.get(n.id)}:n))};
      if(commit(next,true))await measure(next);
    }catch(e){setMessage(String(e.message??e));}
  }
  function replaceHistory(next,keepAlignment=false){if(next===historyRef.current)return false;const blocked=lockedChange(historyRef.current.present.children,next.present.children,locksRef.current);if(blocked){setMessage('ロック中の部品を変更できません：'+blocked);return false;}if(!keepAlignment)setAlignment([]);invalidate();historyRef.current=next;setHistory(next);if(!locate(next.present.children,selectionRef.current))setSelected(next.present.children[0].id);return true;}
  function commit(next,keepAlignment=false){return replaceHistory(commitHistory(historyRef.current,next),keepAlignment);}
  function undo(){replaceHistory(undoHistory(historyRef.current));}
  function redo(){replaceHistory(redoHistory(historyRef.current));}
  function update(patch){return commit({...historyRef.current.present,...patch});}
  function keyboard(e){if(e.target.closest('input,textarea,select,[contenteditable=true]')||!(e.ctrlKey||e.metaKey)||e.altKey||busy||dragging)return;const k=e.key.toLowerCase();if(k==='z'||k==='y'){e.preventDefault();e.stopPropagation();if(k==='y'||e.shiftKey)redo();else undo();}}
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
  const canDuplicate=!!node&&!selectedLocked&&!containsContent(node)&&siblings.length<8&&rows.length+subtreeSize(node)<=32&&!(parentDirection==='row'&&node.width==='fill');
  function duplicate(){if(!canDuplicate)return;try{const copy=duplicateComponentNode(node,rows.map(r=>r.node.id),newId);const i=location.index;if(update({children:editChildren(draft.children,parentId,a=>[...a.slice(0,i+1),copy,...a.slice(i+1)])}))selectSingle(copy.id);}catch(e){setMessage(String(e.message??e));}}
  const imageRatioLocked=!!node&&node.type==='image'&&node.width!=='fill'&&ratioLocks.has(node.id);
  function toggleImageRatio(){if(node?.type!=='image'||node.width==='fill'||selectedLocked)return;const next=new Set(ratioRef.current);if(next.has(node.id))next.delete(node.id);else next.add(node.id);ratioRef.current=next;setRatioLocks(next);}
  function changeImageSize(axis,value){if(selectedLocked)return;try{updateNode(imageRatioLocked?proportionalImageSize(node,value,{minWidth:1,maxWidth:100000,minHeight:1,maxHeight:100000},axis):{[axis]:value});}catch(e){setMessage(String(e.message??e));}}
  function changeCrop(edge,value){if(selectedLocked)return;try{updateNode({crop:updateCrop(node.crop,edge,value)});}catch(e){setMessage(String(e.message??e));}}
  function addImage(){if(!imageOptions.length||targetChildren.length>=8||rows.length>=32||selectedLocked)return;const asset=imageOptions[0],id=newId('image'),direction=node?.type==='group'?node.direction:parentDirection,targetId=node?.type==='group'?node.id:parentId;const w=Math.max(100,Math.min(20000,Math.floor(width/4))),h=Math.max(100,Math.min(40000,Math.round(w*asset.height/asset.width)));const child={id,type:'image',assetId:asset.id,width:w,height:h,fit:'contain',alt:'',...(direction==='canvas'?{x:0,y:0}:{})};if(update({children:editChildren(draft.children,targetId,a=>[...a,child])}))selectSingle(id);}
  function loadLibrary(){if(!libraryEntry||locks.size||busy||dragging)return;if(commit(structuredClone(libraryEntry.design))){ratioRef.current=new Set();setRatioLocks(new Set());selectSingle(libraryEntry.design.children[0].id);setMessage('部品を作業案へコピーしました。再計測して適用してください。');}}
  function libraryAction(type){
    if(!libraryEditable||busy||dragging)return;
    if((type==='add'||type==='replace')&&!ready)return;
    if(type==='add'){if(!libraryName.trim())return;onLibraryAction({type,name:libraryName.trim(),design:draft});}
    else if(libraryEntry){
      if(type==='rename'){if(libraryName.trim())onLibraryAction({type,id:libraryId,name:libraryName.trim()});}
      else if(type==='replace'){if(window.confirm('登録済み部品を現在の作業案で上書きしますか？ 適用済みデザインには影響しません。'))onLibraryAction({type,id:libraryId,design:draft});}
      else if(type==='delete'){if(window.confirm('ライブラリから削除しますか？ 適用済みデザインには影響しません。')){onLibraryAction({type,id:libraryId});setLibraryId('');}}
    }
  }
  function addDynamic(){if(targetChildren.length>=8||rows.length>=32||selectedLocked)return;const id=newId('dynamic'),direction=node?.type==='group'?node.direction:parentDirection,targetId=node?.type==='group'?node.id:parentId;const child={id,type:'dynamic',width:direction==='column'?'fill':20000,field:'chapter-number',prefix:'第',suffix:'章',fallback:'—',fontSize:3000,lineHeight:1.5,color:'#315b86',...(direction==='canvas'?{x:0,y:0}:{})};if(update({children:editChildren(draft.children,targetId,a=>[...a,child])}))selectSingle(id);}
  function add(type='rect'){if(targetChildren.length>=8||rows.length>=32)return;const id=newId(type),direction=node?.type==='group'?node.direction:parentDirection,targetId=node?.type==='group'?node.id:parentId;let child=type==='label'?{id,type:'label',width:direction==='column'?'fill':20000,text:'CHAPTER',fontSize:3000,lineHeight:1.5,color:'#315b86'}:{id,type:'rect',width:direction==='column'?'fill':2000,height:3000,color:'#315b86'};if(direction==='canvas')child={...child,x:0,y:0,width:type==='label'?20000:5000};if(update({children:editChildren(draft.children,targetId,a=>[...a,child])}))selectSingle(id);}
  function wrap(withNext=false){if(!location||parentDirection==='canvas'||rows.length>=32)return;const i=location.index,items=siblings.slice(i,i+(withNext?2:1));if(withNext&&items.length!==2)return;const id=newId('group');const width=items.some(flex)?'fill':Math.max(...items.map(n=>n.width));const group={id,type:'group',width,direction:'column',gap:1000,padding:0,background:'#ffffff',children:items};if(update({children:editChildren(draft.children,parentId,a=>[...a.slice(0,i),group,...a.slice(i+items.length)])}))selectSingle(id);}
  function unwrapGroup(){if(node?.type!=='group'||node.direction==='canvas'||parentDirection==='canvas'||siblings.length-1+node.children.length>8)return;const i=location.index;if(update({children:editChildren(draft.children,parentId,a=>[...a.slice(0,i),...node.children,...a.slice(i+1)])}))selectSingle(node.children[0].id);}
  function remove(){if(!node||containsContent(node)||siblings.length===1)return;const children=siblings.filter(c=>c.id!==selected);if(update({children:editChildren(draft.children,parentId,()=>children)}))selectSingle(children[0].id);}
  async function measure(value=historyRef.current.present,focusId=null){
    invalidate();const job=generation.current;
    try{
      const sampleLevel=level==='default'?1:Number(level);
      const compiled=compileHeadingDesign(value,typography.heading,{'chapter-number':'3','chapter-title':sampleLevel===1?sample:'書籍制作の基礎','heading-number':[3,...Array.from({length:sampleLevel-1},(_,i)=>i===0?2:1)].join('.'),'heading-title':sample,'heading-level':String(sampleLevel)});
      const result=await createPlainTextPagePreview(document,{revision:String(job),fingerprint:'component-lab-'+job,width,height,resolveImage,blocks:[{origin:{documentId:'sample',revision:String(job),blockKey:'heading'},request:{text:sample,width,fontSize:compiled.fontSize,lineHeight:compiled.lineHeight,...compiled.textStyle},splitPolicy:'strict',component:compiled.component}]});
      if(job!==generation.current)return;
      target.current.append(result.element);
      const root=result.element.shadowRoot;
      dragCleanup.current=installCanvasDrag(root,{smartSnap:()=>smartSnapRef.current,ratioLocked:id=>ratioRef.current.has(id),isLocked:id=>isComponentLocked(historyRef.current.present.children,id,locksRef.current),lookup:id=>locate(value.children,id),onSelect:id=>{selectSingle(id);highlightCanvasSelection(root,id,id=>isComponentLocked(historyRef.current.present.children,id,locksRef.current));},onActive:setDragging,onCommit:(id,geometry)=>{
        if(job!==generation.current)return;
        const current=historyRef.current.present,where=locate(current.children,id);
        if(!where||where.parent?.direction!=='canvas')return;
        const next={...current,children:editChildren(current.children,where.parent.id,a=>a.map(c=>c.id===id?{...c,...geometry}:c))};
        if(commit(next))void measure(next,id);
      }});
      highlightCanvasSelection(root,alignmentRef.current.length?alignmentRef.current:selectionRef.current,id=>isComponentLocked(historyRef.current.present.children,id,locksRef.current));
      if(focusId&&document.activeElement===document.body)focusCanvasSelection(root,focusId);
      setReady(true);
      setMessage('実測高さ '+(result.plan.pages[0].fragments[0].rect.height/1000).toFixed(2)+' mm');
    }catch(e){if(job===generation.current)setMessage(String(e.message??e));}
  }
  function setFont(target,font){
    if(target==='content'){
      const {font:old,...rest}=historyRef.current.present;commit(font?{...rest,font}:rest);
    }else{
      const {font:old,...rest}=node;update({children:editChildren(draft.children,parentId,a=>a.map(c=>c.id===selected?(font?{...rest,font}:rest):c))});
    }
  }
  function fontControl(target,font){
    const weights=fontOptions.find(f=>f.id===font?.id)?.weights??[];
    return <div><label>フォント<select id={'lab-font-'+target} value={font?.id??''} disabled={busy} onChange={e=>{const f=fontOptions.find(f=>f.id===e.target.value);setFont(target,f?{id:f.id,weight:f.weights.includes(400)?400:f.weights[0]}:null);}}><option value="">見出しフォントを継承</option>{fontOptions.map(f=><option key={f.id} value={f.id} disabled={f.disabled}>{f.label}</option>)}</select></label>{font&&<label>ウェイト<select id={'lab-weight-'+target} value={font.weight} disabled={busy} onChange={e=>setFont(target,{...font,weight:Number(e.target.value)})}>{weights.map(w=><option key={w}>{w}</option>)}</select></label>}</div>;
  }
  const length=(label,value,change,id,min=0,max=100)=> <label>{label} (mm)<input id={id} type="number" min={min} max={max} step=".1" value={value/1000} disabled={busy} onChange={e=>change(Math.round(Number(e.target.value)*1000))}/></label>;
  return <div className="lab-overlay"><section className="component-lab" onKeyDown={keyboard} role="dialog" aria-modal="true" aria-label="Component Lab"><header><strong>Component Lab / {level==='default'?'共通見出し':'H'+level}</strong><div className="lab-row"><button id="lab-undo" disabled={busy||dragging||!history.past.length} onClick={undo}>元に戻す</button><button id="lab-redo" disabled={busy||dragging||!history.future.length} onClick={redo}>やり直す</button></div><button id="lab-cancel" disabled={busy} onClick={onCancel}>破棄して閉じる</button></header><div className="lab-grid"><section><h3>部品ライブラリ</h3><small>登録済みの見出し部品を独立コピーとして再利用します。</small><label>登録部品<select id="lab-library-select" value={libraryId} disabled={busy||dragging||!libraryEditable} onChange={e=>{setLibraryId(e.target.value);setLibraryName(entries.find(v=>v.id===e.target.value)?.name??'');}}><option value="">選択してください</option>{entries.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label><label>部品名<input id="lab-library-name" maxLength={80} value={libraryName} disabled={busy||dragging||!libraryEditable} onChange={e=>setLibraryName(e.target.value)}/></label><div className="lab-row"><button id="lab-library-load" disabled={busy||dragging||!libraryEditable||!libraryEntry||locks.size>0} onClick={loadLibrary}>作業案へコピー</button><button id="lab-library-add" disabled={busy||dragging||!libraryEditable||!ready||!libraryName.trim()||entries.length>=32} onClick={()=>libraryAction('add')}>新規登録</button><button id="lab-library-rename" disabled={busy||dragging||!libraryEditable||!libraryEntry||!libraryName.trim()} onClick={()=>libraryAction('rename')}>名前変更</button><button id="lab-library-replace" disabled={busy||dragging||!libraryEditable||!libraryEntry||!ready} onClick={()=>libraryAction('replace')}>上書き</button><button id="lab-library-delete" disabled={busy||dragging||!libraryEditable||!libraryEntry} onClick={()=>libraryAction('delete')}>登録削除</button></div><small id="lab-library-status" role="status">{libraryMessage||(!libraryEditable?'ライブラリ編集不可':entries.length+' / 32 部品')}</small><h3>構造</h3><label>配置<select id="lab-direction" value={draft.direction} disabled={busy} onChange={e=>changeDirection(e.target.value)}><option value="row">行（横）</option><option value="column">列（縦）</option></select></label>{rows.map(({node:c,depth})=><button style={{paddingLeft:8+depth*16}} className={selected===c.id||alignmentIds.includes(c.id)?'active':''} key={c.id} data-lab-node={c.id} disabled={busy} onClick={()=>selectSingle(c.id)}>{c.type==='content'?'本文スロット':c.type==='label'?'固定テキスト':c.type==='image'?'画像':c.type==='dynamic'?'動的テキスト':c.type==='group'?(c.direction==='canvas'?'Canvas':c.direction==='row'?'横グループ':'縦グループ'):'装飾矩形'} · {c.id}{locked(c.id)?' 🔒':''}</button>)}<div className="lab-row"><button disabled={busy||siblings[0].id===selected} onClick={()=>move(-1)}>↑</button><button disabled={busy||siblings.at(-1).id===selected} onClick={()=>move(1)}>↓</button><button id="lab-duplicate" disabled={busy||dragging||!canDuplicate} onClick={duplicate}>複製</button><button id="lab-lock" disabled={busy||dragging||!node||inheritedLock} aria-pressed={selectedLocked} onClick={toggleLock}>{inheritedLock?'親部品がロック中':selectedLocked?'ロック解除':'ロック'}</button><button id="lab-add" disabled={busy||targetChildren.length>=8||rows.length>=32} onClick={()=>add()}>矩形追加</button><button id="lab-add-image" disabled={busy||selectedLocked||!imageOptions.length||targetChildren.length>=8||rows.length>=32} onClick={addImage}>画像追加</button><button id="lab-add-dynamic" disabled={busy||selectedLocked||targetChildren.length>=8||rows.length>=32} onClick={addDynamic}>動的文字追加</button><button id="lab-add-label" disabled={busy||targetChildren.length>=8||rows.length>=32} onClick={()=>add('label')}>文字追加</button><button disabled={busy||!node||containsContent(node)||siblings.length===1} onClick={remove}>削除</button><button id="lab-group" disabled={busy||!node||parentDirection==='canvas'||rows.length>=32} onClick={()=>wrap()}>グループ化</button><button id="lab-group-next" disabled={busy||!node||parentDirection==='canvas'||location.index===siblings.length-1||rows.length>=32} onClick={()=>wrap(true)}>次の要素とグループ化</button><button id="lab-ungroup" disabled={busy||node?.type!=='group'||node.direction==='canvas'||parentDirection==='canvas'||siblings.length-1+(node?.children?.length??0)>8} onClick={unwrapGroup}>グループ解除</button></div>{parentDirection==='canvas'&&node&&<><h3>複数選択・整列</h3><p>同じCanvas内の部品を選択し、実測後に整列できます。</p><div id="lab-alignment-selection">{siblings.map(c=><label key={c.id}><input type="checkbox" data-lab-align-node={c.id} checked={c.id===selected||alignmentIds.includes(c.id)} disabled={busy||dragging||c.id===selected||locked(c.id)||selectedLocked} onChange={e=>toggleAlignment(c.id,e.target.checked)}/>{c.id}</label>)}</div><div className="lab-row">{[['left','左揃え'],['center','左右中央'],['right','右揃え'],['top','上揃え'],['middle','上下中央'],['bottom','下揃え'],['distribute-x','横均等配置'],['distribute-y','縦均等配置']].map(([mode,label])=><button key={mode} id={'lab-align-'+mode} disabled={busy||dragging||!ready||selectedLocked||alignmentIds.length<(mode.startsWith('distribute-')?3:2)} onClick={()=>void align(mode)}>{label}</button>)}<button id="lab-align-clear" disabled={busy||!alignmentIds.length} onClick={()=>setAlignment([])}>選択解除</button></div><h3>自由配置座標</h3>{length('X',node.x,v=>updateNode({x:v}),'lab-canvas-x')}{length('Y',node.y,v=>updateNode({y:v}),'lab-canvas-y')}{node.type==='content'&&length('幅',node.width,v=>updateNode({width:v}),'lab-canvas-content-width',.1)}<small>左上からの距離。前後順はツリー順で、後の要素が手前です。</small></>}{selectedLocked&&<p role="note">ロック中：部品の編集・移動・削除を保護します。解除するまで変更できません。</p>}<h3>原稿スロットのスタイル</h3>{fontControl('content',draft.font)}{length('間隔',draft.gap,v=>update({gap:v}),'lab-gap')}{length('内側余白',draft.padding,v=>update({padding:v}),'lab-padding')}{length('文字サイズ',draft.fontSize,v=>update({fontSize:v}),'lab-font-size',2,30)}<label>行高倍率<input type="number" step=".05" min="1.25" max="4" value={draft.lineHeight} disabled={busy} onChange={e=>update({lineHeight:Number(e.target.value)})}/></label><label>文字色<input type="color" value={draft.textColor} disabled={busy} onChange={e=>update({textColor:e.target.value})}/></label><label>背景色<input type="color" value={draft.background} disabled={busy} onChange={e=>update({background:e.target.value})}/></label>{node?.type==='group'&&<><h3>選択したグループ</h3><label>配置<select id="lab-group-direction" value={node.direction} disabled={busy} onChange={e=>changeGroupDirection(e.target.value)}><option value="row">行（横）</option><option value="column">列（縦）</option><option value="canvas">Canvas（自由配置）</option></select></label>{parentDirection!=='canvas'&&<label><input type="checkbox" checked={node.width==='fill'} disabled={busy} onChange={e=>updateNode({width:e.target.checked?'fill':30000})}/>幅を領域に合わせる</label>}{node.width!=='fill'&&length('幅',node.width,v=>updateNode({width:v}),'lab-group-width',.1)}{node.direction==='canvas'?length('固定高さ',node.height,v=>updateNode({height:v}),'lab-canvas-height',.1):length('間隔',node.gap,v=>updateNode({gap:v}),'lab-group-gap')}{length('内側余白',node.padding,v=>updateNode({padding:v}),'lab-group-padding')}<label>背景色<input type="color" value={node.background} disabled={busy} onChange={e=>updateNode({background:e.target.value})}/></label></>}{node?.type==='rect'&&<><h3>選択した矩形</h3>{parentDirection==='column'&&<label><input type="checkbox" checked={node.width==='fill'} disabled={busy} onChange={e=>updateNode({width:e.target.checked?'fill':2000})}/>幅を領域に合わせる</label>}{node.width!=='fill'&&length('幅',node.width,v=>updateNode({width:v}),'lab-rect-width',.1)}{length('高さ',node.height,v=>updateNode({height:v}),'lab-rect-height',.1)}<label>色<input type="color" value={node.color} disabled={busy} onChange={e=>updateNode({color:e.target.value})}/></label></>}{node?.type==='image'&&<><h3>選択した画像</h3><label>素材<select id="lab-image-asset" value={node.assetId} disabled={busy||selectedLocked} onChange={e=>updateNode({assetId:e.target.value,crop:emptyCrop()})}>{imageOptions.map(a=><option key={a.id} value={a.id}>{a.id.slice(0,12)} · {a.width}×{a.height}px</option>)}</select></label><img alt="選択素材" src={'bookcreator://app/project-images/'+node.assetId+'.png'} style={{maxWidth:'100%',maxHeight:96,objectFit:'contain'}}/>{parentDirection==='column'&&<label><input type="checkbox" checked={node.width==='fill'} disabled={busy||selectedLocked} onChange={e=>{if(e.target.checked&&ratioRef.current.has(node.id))toggleImageRatio();updateNode({width:e.target.checked?'fill':20000});}}/>幅を領域に合わせる</label>}{node.width!=='fill'&&length('幅',node.width,v=>changeImageSize('width',v),'lab-image-width',.001)}{length('高さ',node.height,v=>changeImageSize('height',v),'lab-image-height',.001)}<label><input id="lab-image-ratio" type="checkbox" checked={imageRatioLocked} disabled={busy||dragging||selectedLocked||node.width==='fill'} onChange={toggleImageRatio}/>表示枠の縦横比を固定（編集セッション内）</label><label>表示方式<select id="lab-image-fit" value={node.fit} disabled={busy||selectedLocked} onChange={e=>updateNode({fit:e.target.value})}><option value="contain">全体を表示</option><option value="cover">枠を埋める</option></select></label><label>代替テキスト<input id="lab-image-alt" maxLength={256} value={node.alt} disabled={busy||selectedLocked} onChange={e=>updateNode({alt:e.target.value})}/></label><small>空欄は装飾画像。元画像は変更しません。</small><h4>非破壊トリミング</h4><p>元画像に対する切り取り量（%）。実測プレビューに反映します。</p>{[['left','左'],['top','上'],['right','右'],['bottom','下']].map(([edge,label])=><label key={edge}>{label} (%)<input id={'lab-crop-'+edge} type="number" min="0" max="99" step=".01" value={(node.crop?.[edge]??0)/100} disabled={busy||dragging||selectedLocked} onChange={e=>changeCrop(edge,Number(e.target.value))}/></label>)}<button id="lab-crop-reset" disabled={busy||dragging||selectedLocked} onClick={()=>updateNode({crop:emptyCrop()})}>トリミングをリセット</button></>}{node?.type==='dynamic'&&<><h3>選択した動的テキスト</h3><label>参照する情報<select id="lab-dynamic-field" value={node.field} disabled={busy||selectedLocked} onChange={e=>updateNode({field:e.target.value,prefix:'',suffix:''})}>{dynamicChoices.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>{[['prefix','前置文字'],['suffix','後置文字'],['fallback','情報がない場合の文字']].map(([key,label])=><label key={key}>{label}<input id={'lab-dynamic-'+key} maxLength={64} value={node[key]} disabled={busy||selectedLocked} onChange={e=>updateNode({[key]:e.target.value})}/></label>)}{parentDirection==='column'&&<label><input type="checkbox" checked={node.width==='fill'} disabled={busy||selectedLocked} onChange={e=>updateNode({width:e.target.checked?'fill':20000})}/>幅を領域に合わせる</label>}{node.width!=='fill'&&length('幅',node.width,v=>updateNode({width:v}),'lab-dynamic-width',.1)}{fontControl('dynamic',node.font)}{length('文字サイズ',node.fontSize,v=>updateNode({fontSize:v}),'lab-dynamic-size',2,30)}<label>行高倍率<input type="number" step=".05" min="1.25" max="4" value={node.lineHeight} disabled={busy||selectedLocked} onChange={e=>updateNode({lineHeight:Number(e.target.value)})}/></label><label>文字色<input type="color" value={node.color} disabled={busy||selectedLocked} onChange={e=>updateNode({color:e.target.value})}/></label><small>サンプルは第3章を使用します。実際の番号は原稿構成から計算します。</small></>}{node?.type==='label'&&<><h3>選択した固定テキスト</h3><label>文字列<input id="lab-label-text" maxLength={256} value={node.text} disabled={busy} onChange={e=>updateNode({text:e.target.value})}/></label>{parentDirection==='column'&&<label><input type="checkbox" checked={node.width==='fill'} disabled={busy} onChange={e=>updateNode({width:e.target.checked?'fill':20000})}/>幅を領域に合わせる</label>}{node.width!=='fill'&&length('幅',node.width,v=>updateNode({width:v}),'lab-label-width',.1)}{fontControl('label',node.font)}{length('文字サイズ',node.fontSize,v=>updateNode({fontSize:v}),'lab-label-size',2,30)}<label>行高倍率<input type="number" step=".05" min="1.25" max="4" value={node.lineHeight} disabled={busy} onChange={e=>updateNode({lineHeight:Number(e.target.value)})}/></label><label>文字色<input type="color" value={node.color} disabled={busy} onChange={e=>updateNode({color:e.target.value})}/></label></>}</section><section><h3>実測サンプル</h3><label>サンプル文字列<input id="lab-sample" value={sample} maxLength={1000} disabled={busy} onChange={e=>{invalidate();setSample(e.target.value);}}/></label><p>未指定のフォントは書籍の見出し設定を継承します。サンプル文字列は保存しません。固定テキストは部品定義に保存されます。</p><button id="lab-measure" disabled={busy} onClick={()=>void measure()}>実測プレビュー</button><div id="lab-status" role="status">{dragging?'操作中（離すと再計測）':message}</div><small>実測後、Canvas内の要素をドラッグ、またはTabで選択して矢印キーで移動できます。0.1mm刻み（Shiftで1mm）、Escでドラッグ取消。選択部品の青いハンドルで幅（固定高さの部品は高さも）を変更できます。</small><label><input id="lab-smart-snap" type="checkbox" checked={smartSnap} disabled={busy||dragging} onChange={e=>{smartSnapRef.current=e.target.checked;setSmartSnap(e.target.checked);}}/>スマートガイド・吸着（Altで一時解除）</label><div id="lab-preview" ref={target}/></section></div><footer><button id="lab-apply" disabled={busy||dragging||!ready} onClick={()=>onApply(draft)}>テーマへ適用・保存</button>{hasOverride&&<button id="lab-reset" disabled={busy||locks.size>0} onClick={()=>{if(window.confirm("個別デザインを削除して継承に戻しますか？"))onApply(null);}}>登録解除・継承へ</button>}<span>見出し部品は分割しません。正式出版は未対応。</span></footer></section></div>;
}
