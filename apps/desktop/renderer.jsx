import React,{useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {prepareBrowserPreview,prepareBookBrowserPreview} from '../../dist/index.js';
import {scanDocument,validateScannedBlocks,indexBlockIds} from '../../../BookCreator_Markdown/dist/index.js';
import {createPlainTextPagePreview} from '../../../BookCreator_LayoutEngine/dist/index.js';
import {ComponentLab} from './component-lab.jsx';
import {paperGeometry} from './book-settings.mjs';
const deps={scan:scanDocument,validate:validateScannedBlocks,index:indexBlockIds};
const api=window.bookcreator;
const noto='BCFont_NotoSansJP';
const choices=[{id:noto,label:'Noto Sans JP'},{id:'serif',label:'システム明朝・セリフ'},{id:'sans-serif',label:'システムゴシック'},{id:'monospace',label:'等幅'}];
const idsByFamily={'BCFont_NotoSansJP':'noto-sans-jp','serif':'system-serif','sans-serif':'system-sans','monospace':'system-monospace'};
const familiesById=Object.fromEntries(Object.entries(idsByFamily).map(([family,id])=>[id,family]));
function fromRoles(roles){return roles?Object.fromEntries(Object.entries(roles).map(([role,v])=>[role,{fontFamily:familiesById[v.font]??('BCFont_'+v.font.slice(5)),fontWeight:v.weight}])):initialTypography;}
function toRoles(typography){return Object.fromEntries(Object.entries(typography).map(([role,v])=>[role,{font:idsByFamily[v.fontFamily]??('font-'+v.fontFamily.slice(7)),weight:v.fontWeight}]));}
const initialTypography={body:{fontFamily:noto,fontWeight:400},heading:{fontFamily:noto,fontWeight:700}};
function FontChoice({id,value,onChange,disabled,options=choices}){return <select id={id} value={value} onChange={e=>onChange(e.target.value)} disabled={disabled}>{options.map(c=><option key={c.id} value={c.id} disabled={c.disabled}>{c.label}</option>)}</select>;}
function WeightChoice({id,value,onChange,disabled,weights=[400,500,600,700]}){return <select id={id} value={value} onChange={e=>onChange(Number(e.target.value))} disabled={disabled}>{weights.map(w=><option key={w} value={w}>{w}</option>)}</select>;}
const loadedFaces=new Map();
async function registerProjectFonts(fonts){
  for(const [alias,face] of loadedFaces){if(!fonts.some(f=>f.alias===alias)){document.fonts.delete(face);loadedFaces.delete(alias);}}
  const result=[];
  for(const f of fonts){
    try{
      if(!loadedFaces.has(f.alias)){
        const face=new FontFace(f.alias,'url("bookcreator://app/project-fonts/'+f.sha256+'")',{weight:String(f.weight),style:'normal'});
        await face.load();document.fonts.add(face);loadedFaces.set(f.alias,face);
      }
      result.push({...f,loaded:true});
    }catch{result.push({...f,loaded:false});}
  }
  return result;
}
async function resolveImage(id){if(!/^[a-f0-9]{64}$/.test(id))throw Error('Invalid image ID');const bytes=await unwrap(api.readImage(id));return new Blob([bytes],{type:'image/png'});}
async function unwrap(p){const r=await p;if(!r.ok)throw Error(r.error.code+': '+r.error.message);return r.value;}
function validPaper(page){try{return page?paperGeometry(page):null;}catch{return null;}}
function App(){
  const [book,setBook]=useState(null),[file,setFile]=useState(null),[text,setText]=useState(''),[status,setStatus]=useState('book.yaml を開いてください。'),[busy,setBusy]=useState(false),[measuring,setMeasuring]=useState(false);
  const [typography,setTypography]=useState(initialTypography),[editorFont,setEditorFont]=useState(noto);
  const [theme,setTheme]=useState(null),[creating,setCreating]=useState(false),[newBook,setNewBook]=useState({title:'新しい書籍',folder:'new-book',size:'A5'});
  const [savedSettings,setSavedSettings]=useState(null),[page,setPage]=useState(null),[order,setOrder]=useState([]),[showSettings,setShowSettings]=useState(false);
  const settingsDirty=!!savedSettings&&JSON.stringify({page,sections:order})!==JSON.stringify({page:savedSettings.page,sections:savedSettings.sections.filter(s=>s.editable).map(s=>({id:s.id,startOn:s.startOn}))});
  function applySettings(s){setSavedSettings(s);setPage(s.page);setOrder(s.sections.filter(x=>x.editable).map(x=>({id:x.id,startOn:x.startOn})));setBook(b=>b?{...b,sections:s.sections,pageSettings:s.page}:b);}
  function saveBookSettings(){void io(async()=>{const s=await unwrap(api.saveBookSettings(savedSettings.revision,{page,sections:order}));invalidate();applySettings(s);setStatus('書籍設定を保存しました。');});}
  function changePage(key,value){setPage(p=>({...p,[key]:value}));invalidate();}
  function moveSection(i,delta){setOrder(prev=>{const a=[...prev],j=i+delta;if(j<0||j>=a.length)return prev;[a[i],a[j]]=[a[j],a[i]];return a;});invalidate();}
  function setStart(id,startOn){setOrder(prev=>prev.map(s=>s.id===id?{...s,startOn}:s));invalidate();}
  function discardSettings(){if(savedSettings){applySettings(savedSettings);invalidate();}}
  const [fonts,setFonts]=useState([]),[fontManager,setFontManager]=useState(false),[rights,setRights]=useState({license:'',licenseText:'',copyAllowed:false,embedAllowed:false});
  const fontChoices=[...choices,...fonts.map(f=>({id:f.alias,label:f.family+' '+f.style+' · '+f.sha256.slice(0,8)+(f.loaded?'':'（読込失敗）'),disabled:!f.loaded}))];
  const weightsFor=family=>{const f=fonts.find(f=>f.alias===family);return f?[f.weight]:[400,500,600,700];};
  function importFont(){void io(async()=>{const result=await unwrap(api.importFont(rights));if(!result)return;setRights({license:'',licenseText:'',copyAllowed:false,embedAllowed:false});const registered=await registerProjectFonts(result.fonts);setFonts(registered);invalidate();setStatus(result.duplicate?'同じフォントは登録済みです。':registered.some(f=>f.id===result.id&&!f.loaded)?'登録しましたがブラウザ読込失敗。出版不可。':'フォントを登録しました。');});}
  const [imageManager,setImageManager]=useState(false),[images,setImages]=useState([]),[imageAllowed,setImageAllowed]=useState(false);
  function toggleImages(){if(imageManager){setImageManager(false);return;}void io(async()=>{setImages(await unwrap(api.listImages()));setImageManager(true);});}
  function importImage(){void io(async()=>{const result=await unwrap(api.importImage(imageAllowed));if(!result)return;setImages(result.images);setImageAllowed(false);setStatus(result.duplicate?'同じ画像は登録済みです。':'PNG素材を登録しました。');});}
  const [labOpen,setLabOpen]=useState(false),[labLevel,setLabLevel]=useState('default');
  const componentFonts=fontChoices.map(c=>({id:idsByFamily[c.id]??('font-'+c.id.slice(7)),label:c.label,weights:weightsFor(c.id),disabled:c.disabled}));
  function applyHeadingDesign(design){void io(async()=>{const next=await unwrap(api.saveHeadingDesign(theme.revision,design,labLevel));setTheme(next);setLabOpen(false);invalidate();setStatus('見出し部品をテーマに保存しました。');});}
  const themeDirty=!!theme&&JSON.stringify(typography)!==JSON.stringify(fromRoles(theme.roles));
  async function applyBook(next){invalidate();setImages([]);setImageManager(false);setImageAllowed(false);setFonts(await registerProjectFonts(next.fonts??[]));setEditorFont(noto);setRights({license:'',licenseText:'',copyAllowed:false,embedAllowed:false});setBook(next);applySettings(next.settings);setShowSettings(false);setFile(null);setText('');setTheme(next.typography);setTypography(fromRoles(next.typography.roles));setCreating(false);setLabOpen(false);setLabLevel("default");setStatus(next.typography.message??'原稿を選択してください。');}
  function create(){if(!confirmProjectDiscard())return;void io(async()=>{const next=await unwrap(api.create(newBook));if(next)await applyBook(next);});}
  function saveTheme(){if(!theme?.editable||!themeDirty)return;void io(async()=>{const next=await unwrap(api.saveTypography(theme.revision,toRoles(typography)));setTheme(next);setStatus('テーマを保存しました。');});}
  function setRole(role,key,value){setTypography(t=>({...t,[role]:{...t[role],[key]:value,...(key==='fontFamily'&&fonts.some(f=>f.alias===value)?{fontWeight:weightsFor(value)[0]}:key==='fontFamily'&&![400,500,600,700].includes(t[role].fontWeight)?{fontWeight:400}:{})}}));invalidate();setStatus('書籍プレビューのフォント設定を変更しました（未保存）。');}
  const textarea=useRef(null),preview=useRef(null),generation=useRef(0),working=useRef(false);
  const dirty=!!file&&text!==file.text;
  const invalidate=()=>{generation.current++;preview.current?.replaceChildren();setMeasuring(false);};
  const confirmDiscard=()=>!dirty||window.confirm('未保存の変更を破棄しますか？');
  const confirmProjectDiscard=()=>!(dirty||themeDirty||settingsDirty)||window.confirm('未保存の原稿・テーマ・書籍設定を破棄しますか？');
  async function io(fn){if(working.current)return;working.current=true;setBusy(true);try{await fn();}catch(e){setStatus(String(e.message??e));}finally{working.current=false;setBusy(false);}}
  function open(){if(!confirmProjectDiscard())return;void io(async()=>{const next=await unwrap(api.open());if(next)await applyBook(next);});}
  function select(id){if(!confirmDiscard())return;void io(async()=>{const next=await unwrap(api.read(id));invalidate();setFile(next);setText(next.text);setStatus(next.editable?'原稿を読み込みました。':'混在改行のため読み取り専用です。');});}
  function save(){if(!file?.editable||!dirty)return;void io(async()=>{const saved=await unwrap(api.save(file.id,file.revision,text));setFile({...file,text,revision:saved.revision});setStatus('保存しました。');});}
  function edit(value){setText(value);invalidate();setStatus('未保存の変更があります。');}
  async function render(whole=false){
    if(!book||(!whole&&!file)||busy)return;invalidate();const job=generation.current;setMeasuring(true);setStatus('実測組版中…');
    const raw=text;
    try{
      if(theme?.componentMessage)throw Error('部品定義が未対応です: '+theme.componentMessage);
      if(!page)throw Error(savedSettings?.message??'用紙設定が未対応です。');
      const geometry=paperGeometry(page);
      if(Object.values(typography).some(v=>v.fontFamily.startsWith('BCFont_')&&v.fontFamily!==noto&&!fonts.some(f=>f.alias===v.fontFamily&&f.loaded)))throw Error('登録フォントを読み込めません。');
      const rev=String(job),fingerprint='desktop-poc-'+job+'-'+__BUNDLED_FONT_FINGERPRINT__+'-'+JSON.stringify(typography)+'-'+fonts.map(f=>f.sha256).join(',')+'-'+JSON.stringify({page,order,headingDesign:theme?.headingDesign,headingLevels:theme?.headingLevels});
      let documents;
      if(whole){
        const snapshot=await unwrap(api.readBook());
        if(job!==generation.current)return;
        const byId=new Map(snapshot.map(d=>[d.documentId,d]));
        documents=order.map(s=>{
          const d=byId.get(s.id);if(!d)throw Error('原稿構成が変わりました。');
          if(file?.id===s.id&&file.revision!==d.revision)throw Error('原稿が外部変更されました。再読込してください。');
          return {...d,startOn:s.startOn,...(file?.id===s.id?{source:raw,revision:rev}:{})};
        });
      }else{
        const section=order.find(s=>s.id===file.id);
        if(!section||!['page','continuous'].includes(section.startOn))throw Error('このセクションの開始面はプレビュー未対応です。');
        documents=[{documentId:file.id,revision:rev,source:raw,startOn:section.startOn}];
      }
      const prepared=prepareBookBrowserPreview(documents,rev,fingerprint,geometry.content,deps,typography,theme?.headingDesign,theme?.headingLevels);
      if(!prepared.options)throw Error(prepared.diagnostics.map(d=>d.code+' '+d.message).join('\n'));
      const result=await createPlainTextPagePreview(document,{...prepared.options,paper:geometry.paper,resolveImage});
      if(job!==generation.current)return;
      preview.current.append(result.element);
      [...result.element.shadowRoot.querySelectorAll('[data-block]')].forEach((el,i)=>{
        const slice=result.slices[i],range=slice?.sourceSlice;if(!range)return;
        el.tabIndex=0;el.style.cursor='pointer';
        const focus=()=>{if(job!==generation.current)return;if(slice.origin.documentId!==file?.id){setStatus('この断片は '+slice.origin.documentId+' の原稿です。左の原稿一覧から開いてください。');return;}textarea.current.focus();textarea.current.setSelectionRange(range.start,range.end);};
        el.addEventListener('click',focus);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();focus();}});
      });
      setStatus(result.plan.pages.length+' ページ · '+(whole?'書籍全体':'選択原稿')+' · 実測プレビュー（出版不可）');
    }catch(e){if(job===generation.current)setStatus(String(e.message??e));}
    finally{if(job===generation.current)setMeasuring(false);}
  }
  return <><header><div><strong>BookCreator</strong><span> / Desktop PoC</span></div><div><button id="new-project" disabled={busy} onClick={()=>setCreating(v=>!v)}>新規書籍</button><button id="open" disabled={busy} onClick={open}>プロジェクトを開く</button><button id="save" disabled={busy||!dirty||!file?.editable} onClick={save}>原稿を保存</button></div></header>
    <main><aside><h2>{book?.title??'プロジェクト'}</h2>{creating&&<div className="new-book"><h3>新規書籍の作成</h3><label>書名<input id="new-title" maxLength={200} value={newBook.title} disabled={busy} onChange={e=>setNewBook(v=>({...v,title:e.target.value}))}/></label><label>フォルダ名<input id="new-folder" maxLength={64} value={newBook.folder} disabled={busy} onChange={e=>setNewBook(v=>({...v,folder:e.target.value}))}/></label><label>用紙<select id="new-size" value={newBook.size} disabled={busy} onChange={e=>setNewBook(v=>({...v,size:e.target.value}))}>{['A4','A5','B5'].map(s=><option key={s}>{s}</option>)}</select></label><button id="create-project" disabled={busy||!newBook.title.trim()||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(newBook.folder)} onClick={create}>保存先を選択して作成</button><small>既存のフォルダは上書きしません。</small></div>}<button id="font-manager" disabled={busy||!book} onClick={()=>setFontManager(v=>!v)}>フォント管理</button>{fontManager&&book&&<div className="font-manager"><h3>プロジェクトフォント</h3><small>TTF/OTF・静的・正立書体。再配布可能なフォントのみ。</small>{fonts.map(f=><div key={f.id} data-project-font={f.id} data-loaded={f.loaded}><strong>{f.family} {f.style}</strong><small>{f.weight} · {f.license} · {f.loaded?'読込済み':'読込失敗'}</small><div style={{fontFamily:f.loaded?f.alias:'sans-serif',fontWeight:f.weight}}>日本語 ABC 123</div><details><summary>ライセンス情報</summary><pre>{f.licenseText}</pre><small>埋込許可申告: {f.embedAllowed?'あり':'なし'} / fsType: {f.fsType}</small></details></div>)}<label>ライセンス名<input id="font-license" maxLength={120} value={rights.license} onChange={e=>setRights(v=>({...v,license:e.target.value}))} disabled={busy}/></label><label>ライセンス本文<textarea id="font-license-text" maxLength={16000} value={rights.licenseText} onChange={e=>setRights(v=>({...v,licenseText:e.target.value}))} disabled={busy}/></label><label><input id="font-copy" type="checkbox" checked={rights.copyAllowed} onChange={e=>setRights(v=>({...v,copyAllowed:e.target.checked}))} disabled={busy}/>プロジェクトへのコピー・共有が許可されている</label><label><input type="checkbox" checked={rights.embedAllowed} onChange={e=>setRights(v=>({...v,embedAllowed:e.target.checked}))} disabled={busy}/>PDF埋め込みが許可されている（申告）</label><button id="import-font" disabled={busy||!rights.copyAllowed||!rights.license.trim()||!rights.licenseText.trim()} onClick={importFont}>TTF / OTFを選択</button></div>}<button id="image-manager" disabled={busy||!book} onClick={toggleImages}>画像素材管理</button>{imageManager&&book&&<div className="font-manager"><h3>プロジェクト画像</h3><small>静止PNG・16MB以下・1600万画素以下。紙面配置は次の段階です。</small>{images.map(i=><div key={i.id} data-project-image={i.id}><img alt="登録画像" src={'bookcreator://app/project-images/'+i.id+'.png'} style={{display:'block',maxWidth:'100%',maxHeight:96,objectFit:'contain'}} onError={e=>{e.currentTarget.hidden=true;e.currentTarget.nextElementSibling.textContent='画像のデコードに失敗しました。';}}/><small>{i.width} × {i.height} px · {i.id.slice(0,12)}</small></div>)}<label><input id="image-copy" type="checkbox" checked={imageAllowed} disabled={busy} onChange={e=>setImageAllowed(e.target.checked)}/>プロジェクトへのコピー・共有が許可されている</label><button id="import-image" disabled={busy||!imageAllowed} onClick={importImage}>PNG素材を選択</button></div>}<label>見出し部品<select id="lab-level" disabled={busy||!book||labOpen} value={labLevel} onChange={e=>setLabLevel(e.target.value)}><option value="default">共通見出し</option>{[1,2,3,4,5,6].map(n=><option key={n} value={String(n)}>H{n} {theme?.headingLevels?.[n]?"（個別）":"（継承）"}</option>)}</select></label><button id="component-lab" disabled={busy||!theme?.componentEditable||!validPaper(page)||themeDirty} onClick={()=>void io(async()=>{setImages(await unwrap(api.listImages()));setLabOpen(true);})}>Component Lab</button><button id="book-settings" disabled={busy||!book} onClick={()=>setShowSettings(v=>!v)}>書籍設定</button>{showSettings&&book&&<div className="new-book"><h3>用紙と原稿構成</h3>{page?<><label>用紙<select id="page-size" value={page.size} disabled={busy} onChange={e=>changePage('size',e.target.value)}>{['A4','A5','B5'].map(s=><option key={s}>{s}</option>)}</select></label><label>最初の内頁<select value={page.firstSide} disabled={busy} onChange={e=>changePage('firstSide',e.target.value)}><option value="right">右</option><option value="left">左</option></select></label>{[['top','上'],['bottom','下'],['inner','内側'],['outer','外側']].map(([k,label])=><label key={k}>{label}余白 (mm)<input type="number" min="0" max="300" step=".1" value={page.margin[k]/1000} disabled={busy} onChange={e=>changePage('margin',{...page.margin,[k]:Math.round(Number(e.target.value)*1000)})}/></label>)}</>:<small>{savedSettings?.message}</small>}{order.map((s,i)=><div key={s.id} className="section-order"><strong>{s.id}</strong><div><button aria-label="上へ" disabled={busy||i===0} onClick={()=>moveSection(i,-1)}>↑</button><button aria-label="下へ" disabled={busy||i===order.length-1} onClick={()=>moveSection(i,1)}>↓</button></div><select value={s.startOn} disabled={busy||!['page','continuous'].includes(s.startOn)} onChange={e=>setStart(s.id,e.target.value)}>{!['page','continuous'].includes(s.startOn)&&<option value={s.startOn}>{s.startOn}（未対応）</option>}<option value="page">新しいページ</option><option value="continuous">続ける</option></select></div>)}<button id="save-book-settings" disabled={busy||!page||!settingsDirty||order.some(s=>!['page','continuous'].includes(s.startOn))} onClick={saveBookSettings}>書籍設定を保存</button><button disabled={busy||!settingsDirty} onClick={discardSettings}>変更を破棄</button><small>{settingsDirty?'● 未保存の書籍設定':'保存済み書籍設定'}</small></div>}<p className="muted">原稿構成</p>{book?.sections.map(s=><button key={s.id} data-section={s.id} className={file?.id===s.id?'selected':''} disabled={busy||!s.editable} onClick={()=>select(s.id)}><span>{s.id}</span><small>{s.path??s.type+'（未対応）'}</small></button>)}</aside>
    <section className="editor"><h2>BCM 原稿 {dirty&&<span className="dirty">● 未保存</span>}</h2><label className="font-control">原稿エディタ <FontChoice id="editor-font" options={fontChoices} value={editorFont} onChange={setEditorFont} disabled={busy}/></label><textarea id="source" style={{fontFamily:editorFont,fontWeight:fonts.find(f=>f.alias===editorFont)?.weight??400}} ref={textarea} value={text} disabled={busy||!file} readOnly={!file?.editable} onChange={e=>edit(e.target.value)} spellCheck={false}/><p className="muted">原文を正本として保存。書籍フォントはテーマに保存します。</p></section>
    <section className="paper"><h2>紙面プレビュー</h2><div className="controls"><strong>{page?.size??'用紙未対応'}</strong><button id="preview-button" disabled={busy||measuring||!file||!page} onClick={()=>void render()}>原稿を組版</button><button id="preview-book" disabled={busy||measuring||!book||!page} onClick={()=>void render(true)}>書籍全体を組版</button></div><div className="typography"><label>本文 <FontChoice id="body-font" options={fontChoices} value={typography.body.fontFamily} onChange={v=>setRole('body','fontFamily',v)} disabled={busy}/><WeightChoice id="body-weight" weights={weightsFor(typography.body.fontFamily)} value={typography.body.fontWeight} onChange={v=>setRole('body','fontWeight',v)} disabled={busy}/></label><label>見出し <FontChoice id="heading-font" options={fontChoices} value={typography.heading.fontFamily} onChange={v=>setRole('heading','fontFamily',v)} disabled={busy}/><WeightChoice id="heading-weight" weights={weightsFor(typography.heading.fontFamily)} value={typography.heading.fontWeight} onChange={v=>setRole('heading','fontWeight',v)} disabled={busy}/></label><button id="save-theme" disabled={busy||!theme?.editable||!themeDirty} onClick={saveTheme}>テーマを保存</button><small>{themeDirty?'● 未保存のフォント設定':theme?.editable?'テーマ設定を反映済み':'試し設定のみ（テーマ保存不可）'}</small><small>用紙・余白は書籍設定を反映します。</small></div><div ref={preview} id="preview"/></section></main><footer id="status" role="status">{status}</footer>{labOpen&&page&&<ComponentLab key={labLevel} level={labLevel} design={(labLevel==="default"?theme.headingDesign:theme.headingLevels?.[labLevel]??theme.headingDesign)} hasOverride={labLevel==="default"?!!theme.headingDesign:!!theme.headingLevels?.[labLevel]} fontOptions={componentFonts} imageOptions={images} resolveImage={resolveImage} typography={typography} width={paperGeometry(page).content.width} height={paperGeometry(page).content.height} busy={busy} onCancel={()=>setLabOpen(false)} onApply={applyHeadingDesign}/>}</>;
}
createRoot(document.getElementById('root')).render(<App/>);
