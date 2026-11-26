import React,{useState,useRef,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {parsePreviewInline,prepareBrowserPreview,prepareBookBrowserPreview,previewSourceRange,planInlineFormat,planListFormat,planListIndent,planListBatch,inspectDisplayMath,planDisplayMath,inspectInlineMath,planInlineMath,inspectComponentDisplayMath,planComponentDisplayMath,equationReferenceTargets,planEquationReference,planEquationNumbering,planNumberedComponentDisplayMath,hasDynamicLabels,hasStudyNumbering,studyTemplate,studyKinds,defaultStudyDesign,customStudyTemplate,isCustomComponentId,linkedStudyTemplate,slottedStudyTemplate,namedSlotDefinitions} from '../../dist/index.js';
import {scanDocument,validateScannedBlocks,indexBlockIds,applyPatches,parseReferenceToken} from '../../../BookCreator_Markdown/dist/index.js';
import {createPlainTextPagePreview,parsePreviewMath,parseDisplayMath,createPreviewMath} from '../../../BookCreator_LayoutEngine/dist/index.js';
import {ParagraphLab} from './paragraph-lab.jsx';
import {ComponentLab} from './component-lab.jsx';
import {paperGeometry} from './book-settings.mjs';
import {usePaperViewport,PaperViewControls,paperThumbnail,PaperThumbnail} from './paper-viewport.jsx';
import {PublicationPanel} from './publication-panel.jsx';
import {DiagnosticList,diagnosticRecords} from './diagnostic-list.jsx';
import {StructuredEditor} from './structured-editor.jsx';
import {planStructuredEdit} from './structured-blocks.mjs';
import {planStudyEdit} from './structured-study.mjs';
import {planBlockOperation} from './structured-operations.mjs';
const parseStructuredInline=value=>parsePreviewInline(value,0,parsePreviewMath);
const deps={scan:scanDocument,validate:validateScannedBlocks,index:indexBlockIds,validateDisplayMath:parseDisplayMath,validateInlineMath:parsePreviewMath,parseReference:parseReferenceToken};
const api=window.bookcreator;
const studyNames={note:'補足',tip:'ポイント',warning:'注意',important:'重要',example:'例題',exercise:'練習問題',explanation:'解説'};
const noto='BCFont_NotoSansJP',stix='BCFont_STIXTwoMath';
const choices=[{id:noto,label:'Noto Sans JP'},{id:'serif',label:'システム明朝・セリフ'},{id:'sans-serif',label:'システムゴシック'},{id:'monospace',label:'等幅'}];
const idsByFamily={'BCFont_NotoSansJP':'noto-sans-jp','serif':'system-serif','sans-serif':'system-sans','monospace':'system-monospace'};
const familiesById=Object.fromEntries(Object.entries(idsByFamily).map(([family,id])=>[id,family]));
function fromRoles(roles){
  if(!roles)return initialTypography;
  const text=Object.fromEntries(['body','heading'].map(role=>{const v=roles[role];return [role,{fontFamily:familiesById[v.font]??('BCFont_'+v.font.slice(5)),fontWeight:v.weight}];}));
  return {...text,...(roles.math&&roles.math.font!=='auto'?{mathFontFamily:roles.math.font==='stix-two-math'?stix:'BCFont_'+roles.math.font.slice(5)}:{})};
}
function toRoles(typography){
  const text=Object.fromEntries(['body','heading'].map(role=>{const v=typography[role];return [role,{font:idsByFamily[v.fontFamily]??('font-'+v.fontFamily.slice(7)),weight:v.fontWeight}];}));
  return {...text,...(typography.mathFontFamily&&typography.mathFontFamily!=='auto'?{math:{font:typography.mathFontFamily===stix?'stix-two-math':'font-'+typography.mathFontFamily.slice(7),weight:400}}:{})};
}
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
  const [mode,setMode]=useState('home'),[showPaper,setShowPaper]=useState(false);
  const [outlineOpen,setOutlineOpen]=useState(true),[pageListOpen,setPageListOpen]=useState(true),[pageInfoOpen,setPageInfoOpen]=useState(true),[shortcutHelp,setShortcutHelp]=useState(false);
  const [writingPanel,setWritingPanel]=useState(null);
  const [editorView,setEditorView]=useState('source'),[structuredDraft,setStructuredDraft]=useState(null);
  const [structuredComposing,setStructuredComposing]=useState(false);
  const [structuredHistory,setStructuredHistory]=useState(null);
  const [designTab,setDesignTab]=useState('styles');
  const [componentSearch,setComponentSearch]=useState(''),[componentFilter,setComponentFilter]=useState('all'),[initialLibraryEntry,setInitialLibraryEntry]=useState(null);
  const [projects,setProjects]=useState([]),[catalogError,setCatalogError]=useState(''),[homeTab,setHomeTab]=useState('projects'),[projectSearch,setProjectSearch]=useState(''),[favoritesOnly,setFavoritesOnly]=useState(false),[projectSort,setProjectSort]=useState('recent');
  const [layoutState,setLayoutState]=useState({phase:'idle',scope:null,pages:0});
  const [layoutDiagnostics,setLayoutDiagnostics]=useState([]),[showDiagnostics,setShowDiagnostics]=useState(false);
  const [layoutPages,setLayoutPages]=useState([]),[activePage,setActivePage]=useState(1),[pageJump,setPageJump]=useState('1');
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
  const mathFontChoices=[{id:'auto',label:'自動（システム数式フォント）'},{id:stix,label:'STIX Two Math（同梱）'},...fontChoices.filter(c=>fonts.some(f=>f.alias===c.id&&f.hasMathTable&&f.weight===400))];
  function setMathFont(value){
    if(!mathFontChoices.some(c=>c.id===value&&!c.disabled))return;
    setTypography(t=>{const {mathFontFamily:_,...text}=t;return value==='auto'?text:{...text,mathFontFamily:value};});
    invalidate();setStatus('数式フォントを変更しました（未保存）。');
  }
  const weightsFor=family=>{const f=fonts.find(f=>f.alias===family);return f?[f.weight]:[400,500,600,700];};
  function importFont(){void io(async()=>{const result=await unwrap(api.importFont(rights));if(!result)return;setRights({license:'',licenseText:'',copyAllowed:false,embedAllowed:false});const registered=await registerProjectFonts(result.fonts);setFonts(registered);invalidate();setStatus(result.duplicate?'同じフォントは登録済みです。':registered.some(f=>f.id===result.id&&!f.loaded)?'登録しましたがブラウザ読込失敗。出版不可。':'フォントを登録しました。');});}
  const [imageManager,setImageManager]=useState(false),[images,setImages]=useState([]),[imageAllowed,setImageAllowed]=useState(false);
  function toggleImages(){if(imageManager){setImageManager(false);return;}void io(async()=>{setImages(await unwrap(api.listImages()));setImageManager(true);});}
  function importImage(){void io(async()=>{const result=await unwrap(api.importImage(imageAllowed));if(!result)return;setImages(result.images);setImageAllowed(false);setStatus(result.duplicate?'同じ画像は登録済みです。':'PNG素材を登録しました。');});}
  const [studyOpen,setStudyOpen]=useState(false),[studyTarget,setStudyTarget]=useState('example');
  function applyStudy(design){void io(async()=>{const next=await unwrap(api.saveStudyDesign(theme.revision,design,studyTarget));setTheme(next);setStudyOpen(false);invalidate();setStatus('参考書部品を保存しました。');});}
  const [paragraphOpen,setParagraphOpen]=useState(false);
  function applyParagraph(design){void io(async()=>{const next=await unwrap(api.saveParagraphDesign(theme.revision,design));setTheme(next);setParagraphOpen(false);invalidate();setStatus(design?.componentId?'共有本文部品を割り当てました。':'本文フレームを保存しました。');});}
  const [labOpen,setLabOpen]=useState(false),[labLevel,setLabLevel]=useState('default');
  const [libraryNotice,setLibraryNotice]=useState('');
  function changeLibrary(action){void io(async()=>{try{if(action.type==='delete'&&text.includes(action.id))throw Error('現在の原稿に部品IDが含まれています。参照を解除してから削除してください。');const next=await unwrap(api.changeComponentLibrary(theme.revision,action));setTheme(next);invalidate();setLibraryNotice('部品ライブラリを保存しました。');}catch(e){setLibraryNotice(String(e.message??e));}});}
  const componentFonts=fontChoices.map(c=>({id:idsByFamily[c.id]??('font-'+c.id.slice(7)),label:c.label,weights:weightsFor(c.id),disabled:c.disabled}));
  function applyHeadingDesign(design){void io(async()=>{const next=await unwrap(api.saveHeadingDesign(theme.revision,design,labLevel));setTheme(next);setLabOpen(false);invalidate();setStatus(design?.componentId?'共有部品を見出しに割り当てました。':'見出し部品をテーマに保存しました。');});}
  const themeDirty=!!theme&&JSON.stringify(typography)!==JSON.stringify(fromRoles(theme.roles));
  async function applyBook(next){invalidate();setLayoutState({phase:'idle',scope:null,pages:0});setImages([]);setImageManager(false);setImageAllowed(false);setFonts(await registerProjectFonts(next.fonts??[]));setEditorFont(noto);setRights({license:'',licenseText:'',copyAllowed:false,embedAllowed:false});setBook(next);if(next.recent)setProjects(next.recent);setCatalogError(next.catalogWarning??'');setMode('writing');setWritingPanel(null);setEditorView('source');setStructuredDraft(null);setStructuredHistory(null);setStructuredComposing(false);setOutlineOpen(true);setPageListOpen(true);setPageInfoOpen(true);setShortcutHelp(false);setDesignTab('styles');setComponentSearch('');setComponentFilter('all');setInitialLibraryEntry(null);setShowPaper(false);setFontManager(false);setStudyInstanceId('');setAnswerTo('');setStudyChoice('example');applySettings(next.settings);setShowSettings(false);setFile(null);setText('');setTheme(next.typography);setTypography(fromRoles(next.typography.roles));setCreating(false);setLabOpen(false);setParagraphOpen(false);setStudyOpen(false);setLabLevel("default");setStatus(next.typography.message??'原稿を選択してください。');}
  useEffect(()=>{void refreshProjects();},[]);
  async function refreshProjects(){await io(async()=>{try{setProjects(await unwrap(api.listProjects()));setCatalogError('');}catch(e){setCatalogError(String(e.message??e));}});}
  function openRegistered(id){if(!confirmProjectDiscard())return;void io(async()=>{const next=await unwrap(api.openRegisteredProject(id));await applyBook(next);});}
  function favoriteProject(id,value){void io(async()=>{setProjects(await unwrap(api.favoriteProject(id,value)));});}
  function forgetProject(id){if(!window.confirm('一覧から登録を解除しますか？ 書籍ファイルは削除されません。'))return;void io(async()=>{setProjects(await unwrap(api.forgetProject(id)));});}
  function create(){if(!confirmProjectDiscard())return;void io(async()=>{const next=await unwrap(api.create(newBook));if(next)await applyBook(next);});}
  function saveTheme(){if(!theme?.editable||!themeDirty)return;void io(async()=>{const next=await unwrap(api.saveTypography(theme.revision,toRoles(typography)));setTheme(next);setStatus('テーマを保存しました。');});}
  function setRole(role,key,value){setTypography(t=>({...t,[role]:{...t[role],[key]:value,...(key==='fontFamily'&&fonts.some(f=>f.alias===value)?{fontWeight:weightsFor(value)[0]}:key==='fontFamily'&&![400,500,600,700].includes(t[role].fontWeight)?{fontWeight:400}:{})}}));invalidate();setStatus('書籍プレビューのフォント設定を変更しました（未保存）。');}
  const textarea=useRef(null),preview=useRef(null),generation=useRef(0),working=useRef(false);
  const paperView=usePaperViewport(preview,mode==='layout',activePage,layoutState.phase==='ready');
  const [hasSelection,setHasSelection]=useState(false);
  const pendingDiagnostic=useRef(null),pendingSource=useRef(null);
  function syncSelection(){const node=textarea.current;setHasSelection(!!node&&node.selectionEnd>node.selectionStart);}
  useEffect(()=>{
    const node=textarea.current;
    if(!node)return;
    node.addEventListener('selectionchange',syncSelection);
    document.addEventListener('selectionchange',syncSelection);
    return ()=>{node.removeEventListener('selectionchange',syncSelection);document.removeEventListener('selectionchange',syncSelection);};
  },[]);
  useEffect(()=>{textarea.current?.setSelectionRange(0,0);setHasSelection(false);},[file?.id]);
  useEffect(()=>{syncSelection();},[text,mode]);
  const dirty=!!file&&text!==file.text;
  const invalidate=()=>{generation.current++;pendingDiagnostic.current=null;pendingSource.current=null;preview.current?.replaceChildren();setLayoutDiagnostics([]);setShowDiagnostics(false);setLayoutPages([]);setActivePage(1);setPageJump('1');setMeasuring(false);setLayoutState(previous=>previous.phase==='idle'?previous:{...previous,phase:'stale',pages:0});};
  const confirmDiscard=()=>!dirty||window.confirm('未保存の変更を破棄しますか？');
  const confirmProjectDiscard=()=>!(dirty||themeDirty||settingsDirty)||window.confirm('未保存の原稿・テーマ・書籍設定を破棄しますか？');
  async function io(fn){if(working.current)return;working.current=true;setBusy(true);try{await fn();}catch(e){setStatus(String(e.message??e));}finally{working.current=false;setBusy(false);}}
  function open(){if(!confirmProjectDiscard())return;void io(async()=>{const next=await unwrap(api.open());if(next)await applyBook(next);});}
  function select(id){if(file?.id===id)return;if(routeBlockRef.current||composing.current){setStatus('現在の操作を完了または取り消してから原稿を切り替えてください。');return;}if(!confirmDiscard())return;void io(async()=>{const next=await unwrap(api.read(id));invalidate();setStructuredHistory(null);setFile(next);setText(next.text);setWritingPanel(null);setStatus(next.editable?'原稿を読み込みました。':'混在改行のため読み取り専用です。');});}
  function save(){if(composing.current||routeBlockRef.current||!file?.editable||!dirty)return;void io(async()=>{const saved=await unwrap(api.save(file.id,file.revision,text));setFile({...file,text,revision:saved.revision});setStatus('保存しました。');});}
  const [includeOptionalSlots,setIncludeOptionalSlots]=useState(false);
  const [studyChoice,setStudyChoice]=useState('example'),[studyInstanceId,setStudyInstanceId]=useState(''),[answerTo,setAnswerTo]=useState('');
  const canLink=studyChoice==='explanation'||isCustomComponentId(studyChoice);
  function edit(value,fromStructured=false){if(!fromStructured)setStructuredHistory(null);setText(value);invalidate();setStatus('未保存の変更があります。');}
  const composing=useRef(false),[isComposing,setIsComposing]=useState(false);
  const [mathDraft,setMathDraft]=useState(null),mathPreview=useRef(null),mathComposing=useRef(false);
  const MathField=mathDraft?.kind==='display'?'textarea':'input';
  const mathStale=!!mathDraft&&(mathDraft.fileId!==file?.id||mathDraft.revision!==file?.revision||mathDraft.job!==generation.current||mathDraft.source!==text);
  let mathError='';
  if(mathDraft)try{(mathDraft.kind==='inline'?parsePreviewMath:parseDisplayMath)(mathDraft.formula);if(mathDraft.kind==='inline'&&mathDraft.formula.trim()!==mathDraft.formula)throw Error('本文内数式の前後に空白を置けません。');}catch(e){mathError=String(e.message??e);}
  useEffect(()=>{
    const target=mathPreview.current;
    if(!target)return;
    target.replaceChildren();
    if(mathDraft&&!mathError)target.append(createPreviewMath(document,mathDraft.formula,mathDraft.kind==='inline'?'inline':'block',typography.mathFontFamily));
  },[mathDraft,mathError,typography.mathFontFamily]);
  function openMath(kind='display'){
    const node=textarea.current;
    if(busy||working.current||!file?.editable||!node||composing.current)return;
    const start=node.selectionStart,end=node.selectionEnd,job=generation.current;
    const open=context=>{
      if(generation.current!==job||node.value!==text||composing.current||node.selectionStart!==start||node.selectionEnd!==end)throw Error('原稿の編集状態が変わりました。');
      const target=kind==='inline'?inspectInlineMath(text,start,end,deps,context):(inspectComponentDisplayMath(text,start,end,deps,context)??inspectDisplayMath(text,start,end,scanDocument));
      mathComposing.current=false;
      setMathDraft({kind,start,end,component:target.component===true,formula:target.formula,mode:target.mode,numbered:kind==='display'&&!!target.numbered,equationId:kind==='display'?target.equationId:undefined,source:text,fileId:file.id,revision:file.revision,job:generation.current});
    };
    try{
      if(node.value!==text)throw Error('原稿の編集状態が変わりました。');
      const nested=kind==='display'&&scanDocument(text).blocks.some(b=>b.kind==='directive'&&b.header.name!=='layout'&&start>=b.range.start&&start<b.range.end&&end<=b.range.end);
      if(nested||kind==='inline')void io(async()=>{try{open({documents:await referenceDocuments(text),documentId:file.id});}catch(e){setStatus('数式編集不可：'+String(e.message??e));}});
      else open();
    }catch(e){setStatus('数式編集不可：'+String(e.message??e));}
  }
  function applyMath(){
    const node=textarea.current;
    if(!mathDraft||busy||working.current||!file?.editable||!node||composing.current||mathComposing.current)return;
    const apply=context=>{
      if(mathStale||generation.current!==mathDraft.job||node.value!==mathDraft.source||composing.current||mathComposing.current)throw Error('原稿が変更されました。数式エディタを開き直してください。');
      const plan=mathDraft.kind==='inline'?planInlineMath(text,mathDraft.start,mathDraft.end,mathDraft.formula,deps,context):mathDraft.component?(mathDraft.mode==='insert'&&mathDraft.numbered?planNumberedComponentDisplayMath(context.documents,context.documentId,mathDraft.start,mathDraft.end,mathDraft.formula,mathDraft.equationId,deps):planComponentDisplayMath(text,mathDraft.start,mathDraft.end,mathDraft.formula,deps,context)):planDisplayMath(text,mathDraft.start,mathDraft.end,mathDraft.formula,scanDocument,parseDisplayMath,mathDraft.mode==='insert'&&mathDraft.numbered?mathDraft.equationId:undefined);
      const next=applyPatches(text,[plan.patch]);
      setMathDraft(null);edit(next);setStatus((mathDraft.kind==='inline'?'本文内数式':'独立数式')+'を'+(plan.action==='apply'?'挿入':'更新')+'しました（未保存）。');
      const job=generation.current;
      requestAnimationFrame(()=>{if(textarea.current===node&&generation.current===job&&node.value===next){node.focus();node.setSelectionRange(plan.selection.start,plan.selection.end);}});
    };
    try{
      if(mathStale||node.value!==mathDraft.source)throw Error('原稿が変更されました。数式エディタを開き直してください。');
      if(mathDraft.component||mathDraft.kind==='inline')void io(async()=>{try{apply({documents:await referenceDocuments(text),documentId:file.id});}catch(e){setStatus('数式編集不可：'+String(e.message??e));}});
      else apply();
    }catch(e){setStatus('数式編集不可：'+String(e.message??e));}
  }
  const [referenceDraft,setReferenceDraft]=useState(null);
  const referenceStale=!!referenceDraft&&(referenceDraft.fileId!==file?.id||referenceDraft.revision!==file?.revision||referenceDraft.job!==generation.current||referenceDraft.source!==text);
  async function referenceDocuments(raw){
    const snapshot=await unwrap(api.readBook()),byId=new Map(snapshot.map(d=>[d.documentId,d]));
    return order.map(s=>{
      const d=byId.get(s.id);if(!d)throw Error('原稿構成が変わりました。');
      if(file.id===s.id&&file.revision!==d.revision)throw Error('原稿が外部変更されました。再読込してください。');
      return {...d,startOn:s.startOn,...(file.id===s.id?{source:raw}:{})};
    });
  }
  function toggleEquationNumbering(){
    const node=textarea.current;
    if(busy||working.current||!file?.editable||!node||composing.current||node.value!==text)return;
    const start=node.selectionStart,end=node.selectionEnd,job=generation.current;
    void io(async()=>{
      const documents=await referenceDocuments(text);
      if(generation.current!==job||node.value!==text||composing.current||node.selectionStart!==start||node.selectionEnd!==end)throw Error('原稿が変更されました。');
      const target=inspectComponentDisplayMath(text,start,end,deps,{documents,documentId:file.id})??inspectDisplayMath(text,start,end,scanDocument);
      if(target.mode!=='edit')throw Error('既存の独立数式を選択してください。');
      const enabled=!target.numbered;
      const plan=planEquationNumbering(documents,file.id,start,end,enabled,enabled&&!target.equationId?'eq-'+crypto.randomUUID():undefined,deps);
      const next=applyPatches(text,[plan.patch]);
      setMathDraft(null);setReferenceDraft(null);edit(next);setStatus(enabled?'数式の採番を有効にしました（未保存）。':'数式の採番を解除しました（未保存）。');
      const changed=generation.current;
      requestAnimationFrame(()=>{if(textarea.current===node&&generation.current===changed&&node.value===next){node.focus();node.setSelectionRange(plan.selection.start,plan.selection.end);}});
    });
  }
  function openReference(){
    const node=textarea.current;
    if(busy||working.current||!file?.editable||!node||composing.current||node.value!==text)return;
    const start=node.selectionStart,end=node.selectionEnd,job=generation.current;
    if(start!==end){setStatus('参照挿入位置にカーソルを置いてください。');return;}
    void io(async()=>{
      const documents=await referenceDocuments(text);
      if(generation.current!==job||node.value!==text||composing.current)throw Error('原稿が変更されました。');
      const targets=equationReferenceTargets(documents,deps);
      if(!targets.length)throw Error('ID付きの番号付き数式がありません。');
      planEquationReference(documents,file.id,start,end,targets[0].id,'label-number',deps);
      setReferenceDraft({start,end,job,fileId:file.id,revision:file.revision,source:text,documents,targets,targetId:targets[0].id,format:'label-number'});
    });
  }
  function applyReference(){
    const node=textarea.current,draft=referenceDraft;
    if(!draft||busy||working.current||!file?.editable||!node||composing.current)return;
    void io(async()=>{
      if(referenceStale||node.value!==draft.source)throw Error('原稿が変更されました。参照選択を開き直してください。');
      const documents=await referenceDocuments(text);
      if(generation.current!==draft.job||node.value!==draft.source||composing.current||JSON.stringify(documents)!==JSON.stringify(draft.documents))throw Error('書籍が変更されました。参照選択を開き直してください。');
      const plan=planEquationReference(documents,file.id,draft.start,draft.end,draft.targetId,draft.format,deps);
      const next=applyPatches(text,[plan.patch]);
      setReferenceDraft(null);edit(next);setStatus('数式参照を挿入しました（未保存）。');
      const job=generation.current;
      requestAnimationFrame(()=>{if(textarea.current===node&&generation.current===job&&node.value===next){node.focus();node.setSelectionRange(plan.selection.start,plan.selection.end);}});
    });
  }
  const [inlineColor,setInlineColor]=useState('#c2410c'),[inlineFamily,setInlineFamily]=useState('monospace'),[inlineWeight,setInlineWeight]=useState(400),[inlineSize,setInlineSize]=useState('4.2');
  function formatSelection(format){
    const node=textarea.current;
    if(busy||working.current||!file?.editable||!node||composing.current||mathDraft||referenceDraft)return;
    const start=node.selectionStart,end=node.selectionEnd,job=generation.current;
    if(start===end){setStatus('書式を変更する文字を選択してください。');return;}
    const apply=context=>{
      if(generation.current!==job||node.value!==text||node.selectionStart!==start||node.selectionEnd!==end||composing.current)throw Error('原稿の編集状態が変わりました。再選択してください。');
      const planned=planInlineFormat(text,start,end,format,scanDocument,context);
      const next=applyPatches(text,[planned.patch]);
      edit(next);setStatus((planned.action==='remove'?'書式を解除':planned.action==='replace'?'書式を変更':'書式を適用')+'しました（未保存）。');
      const currentGeneration=generation.current;
      requestAnimationFrame(()=>{if(textarea.current===node&&generation.current===currentGeneration&&node.value===next){node.focus();node.setSelectionRange(planned.selection.start,planned.selection.end);}});
    };
    try{
      if(node.value!==text)throw Error('原稿の編集状態が変わりました。再選択してください。');
      // Keep the legacy local formatting path for plain source; richer markup
      // requires a validated book snapshot and semantic source ranges.
      if(text.includes(':ref{')||text.includes('$'))void io(async()=>{try{apply({documents:await referenceDocuments(text),documentId:file.id,deps});}catch(e){setStatus('書式変更不可：'+String(e.message??e));}});
      else apply();
    }catch(e){setStatus('書式変更不可：'+String(e.message??e));}
  }
  function formatList(kind){
    const node=textarea.current;
    if(busy||!file?.editable||!node||composing.current)return;
    try{
      if(node.value!==text)throw Error('原稿の編集状態が変わりました。再選択してください。');
      const plan=kind==='indent'||kind==='outdent'?planListIndent(text,node.selectionStart,node.selectionEnd,kind,scanDocument):/[\r\n]/.test(node.value.slice(node.selectionStart,node.selectionEnd).replace(/(?:\r\n|\n)$/,''))?planListBatch(text,node.selectionStart,node.selectionEnd,kind,scanDocument):planListFormat(text,node.selectionStart,node.selectionEnd,kind,scanDocument);
      const next=applyPatches(text,[plan.patch]);
      edit(next);setStatus('リスト書式を変更しました（未保存）。');
      const job=generation.current;
      requestAnimationFrame(()=>{if(textarea.current===node&&generation.current===job&&node.value===next){node.focus();node.setSelectionRange(plan.selection.start,plan.selection.end);}});
    }catch(e){setStatus('リスト変更不可：'+String(e.message??e));}
  }
  function applyInlineFont(){
    const choice=fontChoices.find(f=>f.id===inlineFamily&&!f.disabled);
    if(!choice||!weightsFor(inlineFamily).includes(inlineWeight)){setStatus('利用可能なフォントとウェイトを選択してください。');return;}
    formatSelection({font:idsByFamily[inlineFamily]??('font-'+inlineFamily.slice(7)),weight:inlineWeight});
  }
  function appendStudy(){
    if(busy||!file?.editable)return;
    try{
      if(isCustomComponentId(studyChoice)&&!theme?.library?.entries.some(e=>e.id===studyChoice&&e.usage==='study'))throw Error('登録部品が見つかりません。');
      const definition=isCustomComponentId(studyChoice)?theme?.library?.entries.find(e=>e.id===studyChoice)?.design:theme?.studyDesigns?.[studyChoice];
      const names=namedSlotDefinitions(definition).filter(n=>!n.optional||includeOptionalSlots).map(n=>n.name),template=slottedStudyTemplate(studyChoice,studyInstanceId.trim()||undefined,canLink?answerTo.trim()||undefined:undefined,names),separator=!text||text.endsWith('\n\n')?'':text.endsWith('\n')?'\n':'\n\n',start=text.length+separator.length;
      const next=applyPatches(text,[{range:{start:text.length,end:text.length},expected:'',replacement:separator+template}]);
      const parsed=scanDocument(next),last=parsed.blocks.at(-1);
      if(!last||last.kind!=='directive'||!last.closed||last.range.start!==start||last.range.end!==next.length||parsed.diagnostics.length)throw Error('末尾が未閉鎖のブロック内にあるか、原稿の構文を確認してください。');
      if(indexBlockIds([{documentId:file.id,revision:file.revision,parsed}]).diagnostics.length)throw Error('原稿内で部品IDが重複しています。');
      edit(next);setStudyInstanceId('');setAnswerTo('');setStatus('参考書部品を原稿末尾へ追加しました（未保存）。');
      requestAnimationFrame(()=>{if(textarea.current){const lines=template.split('\n'),line=names.length?2:1,p=start+lines.slice(0,line).join('\n').length+1;textarea.current.focus();textarea.current.setSelectionRange(p,p+lines[line].length);}});
    }catch(e){setStatus(String(e.message??e));}
  }
  async function render(whole=false){
    if(!book||(!whole&&!file)||busy)return;setShowPaper(true);invalidate();const job=generation.current,scope=whole?'book':'manuscript';setMeasuring(true);setLayoutState({phase:'running',scope,pages:0});setStatus('実測組版中…');
    const raw=text;let diagnostics=[],documents=[];
    try{
      if(theme?.componentMessage||theme?.paragraphMessage||theme?.studyMessage)throw Error('部品定義が未対応です: '+(theme.componentMessage??theme.paragraphMessage??theme.studyMessage));
      if(!page)throw Error(savedSettings?.message??'用紙設定が未対応です。');
      const geometry=paperGeometry(page);
      if([typography.body,typography.heading].some(v=>v.fontFamily.startsWith('BCFont_')&&v.fontFamily!==noto&&!fonts.some(f=>f.alias===v.fontFamily&&f.loaded)))throw Error('登録フォントを読み込めません。');
      if(typography.mathFontFamily&&typography.mathFontFamily!==stix&&!fonts.some(f=>f.alias===typography.mathFontFamily&&f.loaded&&f.hasMathTable&&f.weight===400))throw Error('登録数式フォントを読み込めません。');
      const rev=String(job),fingerprint='desktop-poc-'+job+'-'+__BUNDLED_FONT_FINGERPRINT__+'-'+JSON.stringify(typography)+'-'+fonts.map(f=>f.sha256).join(',')+'-'+JSON.stringify({page,order,headingDesign:theme?.headingDesign,headingLevels:theme?.headingLevels,paragraphDesign:theme?.paragraphDesign,studyDesigns:theme?.studyDesigns,library:theme?.library});
      const needsContext=raw.includes(':ref{')||/:::layout\{/.test(raw)||raw.includes('answer-to')||hasDynamicLabels(theme?.headingDesign)||Object.values(theme?.headingLevels??{}).some(hasDynamicLabels)||Object.values(theme?.studyDesigns??{}).some(hasStudyNumbering)||(theme?.library?.entries??[]).some(e=>e.usage==='study'&&hasStudyNumbering(e.design));
      if(whole||needsContext){
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
      for(const [id,message] of Object.entries(theme?.studyResourceErrors??{}))if(documents.some(d=>d.source.includes(id)))throw Error('登録部品の素材が利用できません: '+message);
      const prepared=prepareBookBrowserPreview(documents,rev,fingerprint,geometry.content,deps,typography,theme?.headingDesign,theme?.headingLevels,theme?.paragraphDesign,theme?.studyDesigns,theme?.library);
      diagnostics=prepared.diagnostics;
      if(!prepared.options)throw Error(prepared.diagnostics.map(d=>d.code+' '+d.message).join('\n'));
      const options=!whole&&needsContext?{...prepared.options,sections:prepared.options.sections.filter(s=>s.id===file.id)}:prepared.options;
      for(const section of options.sections)for(const block of section.blocks){
        if('kind' in block)continue;
        for(const request of [block.request,...(block.namedSlots??[]).map(s=>s.request)])for(const run of request.inlineStyles??[]){
          const family=run.fontFamily??request.fontFamily,weight=run.fontWeight??request.fontWeight;
          if(family.startsWith('BCFont_')&&family!==noto&&!fonts.some(f=>f.alias===family&&f.loaded&&f.weight===weight))throw Error('インライン書式の登録フォントまたは指定ウェイトを利用できません。');
        }
      }
      const result=await createPlainTextPagePreview(document,{...options,paper:geometry.paper,resolveImage});
      if(job!==generation.current)return;
      preview.current.append(result.element);
      const pageNodes=[...result.element.shadowRoot.querySelectorAll('[data-page]')];
      const sourceIds=new Map(pageNodes.map(node=>[node,new Set()]));
      const sourceBlocks=new Map(options.sections.flatMap(s=>s.blocks.filter(b=>!('kind' in b)).map(b=>[JSON.stringify([b.origin.documentId,b.origin.blockKey]),b])));
      [...result.element.shadowRoot.querySelectorAll('[data-block]')].forEach((el,i)=>{
        const slice=result.slices[i];if(!slice)return;
        sourceIds.get(el.closest('[data-page]'))?.add(slice.origin.documentId);
        const bind=(node,range)=>{if(!range)return;node.tabIndex=0;node.style.cursor='pointer';
          const focus=()=>{if(job!==generation.current)return;if(slice.origin.documentId!==file?.id){setStatus('この断片は '+slice.origin.documentId+' の原稿です。左の原稿一覧から開いてください。');return;}const reveal=()=>{if(job!==generation.current)return;textarea.current.focus();textarea.current.setSelectionRange(range.start,range.end);};if(!textarea.current.getClientRects().length){if(routeBlockRef.current||composing.current){setStatus('編集中の操作を完了してから原稿に戻ってください。');return;}setMode('writing');setEditorView('source');setShowSettings(false);setShowPaper(true);requestAnimationFrame(reveal);}else reveal();};
          node.addEventListener('click',e=>{e.stopPropagation();focus();});node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();focus();}});
        };
        const block=sourceBlocks.get(JSON.stringify([slice.origin.documentId,slice.origin.blockKey]));
        bind(el,previewSourceRange(block,slice));
        for(const node of el.querySelectorAll('[data-inline-math],[data-slot-display-math]')){
          const textStart=Number(node.dataset.mathStart),textEnd=Number(node.dataset.mathEnd);
          const name=node.closest('[data-named-slot]')?.dataset.namedSlot;
          const local=name===undefined?slice:slice.namedSlots?.find(s=>s.name===name);
          if(local&&textStart>=local.textStart&&textEnd<=local.textEnd&&textEnd===textStart+1)bind(node,previewSourceRange(block,{textStart,textEnd},name));
        }
        for(const node of el.querySelectorAll('[data-named-slot]')){
          const named=slice.namedSlots?.find(s=>s.name===node.dataset.namedSlot);
          if(named)bind(node,previewSourceRange(block,named,named.name));
        }
      });
      setLayoutPages(pageNodes.map((node,index)=>({number:index+1,documents:[...sourceIds.get(node)],blocks:node.querySelectorAll('[data-block]').length,thumbnail:paperThumbnail(node)})));
      setActivePage(1);setPageJump('1');preview.current.scrollTop=0;preview.current.scrollLeft=0;
      setLayoutState({phase:'ready',scope,pages:result.plan.pages.length});
      setStatus(result.plan.pages.length+' ページ · '+(whole?'書籍全体':'選択原稿')+' · 実測プレビュー（出版不可）');
    }catch(e){if(job===generation.current){setLayoutState({phase:'failed',scope,pages:0});setLayoutDiagnostics(diagnosticRecords(diagnostics,documents,e));setStatus(String(e.message??e));}}
    finally{if(job===generation.current)setMeasuring(false);}
  }
  function navigatePage(number){
    if(layoutState.phase!=='ready'||!Number.isInteger(number)||number<1||number>layoutPages.length)return;
    const viewport=preview.current,node=viewport?.firstElementChild?.shadowRoot?.querySelectorAll('[data-page]')[number-1];
    if(!node)return;
    setActivePage(number);setPageJump(String(number));
    // Scroll only the paper viewport; never the surrounding application.
    viewport.scrollTop+=node.getBoundingClientRect().top-viewport.getBoundingClientRect().top-8;
  }
  function trackPage(){
    if(mode!=='layout'||layoutState.phase!=='ready'||!layoutPages.length)return;
    const viewport=preview.current,nodes=[...viewport.firstElementChild?.shadowRoot?.querySelectorAll('[data-page]')??[]];
    const top=viewport.getBoundingClientRect().top;
    // Select the first page intersecting the top reading line, not an arbitrary block.
    const atEnd=viewport.scrollHeight>viewport.clientHeight&&viewport.scrollTop+viewport.clientHeight>=viewport.scrollHeight-2;
    const index=atEnd?nodes.length-1:nodes.findIndex(node=>node.getBoundingClientRect().bottom>top+12);
    if(index>=0){setActivePage(index+1);setPageJump(String(index+1));}
  }
  useEffect(()=>{if(mode==='layout'&&layoutState.phase==='ready'){const frame=requestAnimationFrame(trackPage);return ()=>cancelAnimationFrame(frame);}},[mode,layoutState.phase]);
  const selectedPage=layoutPages[activePage-1];
  const routeBlocked=busy||isComposing||structuredComposing||!!structuredDraft||!!mathDraft||!!referenceDraft||labOpen||paragraphOpen||studyOpen;
  const routeBlockRef=useRef(false);routeBlockRef.current=routeBlocked;
  const formatDisabled=routeBlocked||!file?.editable||!hasSelection;
  const unsaved=[dirty&&'原稿',themeDirty&&'テーマ',settingsDirty&&'書籍設定'].filter(Boolean);
  const saveLabel=!book?'書籍未選択':unsaved.length?'未保存：'+unsaved.join('・'):'保存済み';
  const layoutLabel=layoutState.phase==='ready'?(layoutState.scope==='book'?'全冊':'選択原稿')+' '+layoutState.pages+'ページ（試作）':({idle:'未組版',stale:'組版の更新が必要',running:'組版中…',failed:'組版できませんでした'})[layoutState.phase];
  function navigate(next){
    if(next===mode)return;
    if(busy||composing.current||structuredComposing||structuredDraft||mathDraft||referenceDraft||labOpen||paragraphOpen||studyOpen){setStatus('現在の操作を完了または取り消してから画面を切り替えてください。');return;}
    if(next!=='home'&&!book)return;
    setCreating(false);setMode(next);setWritingPanel(null);if(next==='home')setHomeTab('projects');setShowSettings(next==='settings');
  }
  function workspaceKey(event){
    // Leave native input undo/redo, IME and active modal interactions alone.
    if(event.defaultPrevented||event.nativeEvent.isComposing||composing.current||event.keyCode===229||routeBlocked)return;
    if(event.key==='Escape'&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
      if(shortcutHelp){event.preventDefault();setShortcutHelp(false);return;}
      if(mode==='writing'&&writingPanel){event.preventDefault();setWritingPanel(null);textarea.current?.focus();return;}
    }
    if(mode==='writing'&&editorView==='structured'&&!event.altKey&&(event.ctrlKey||event.metaKey)&&!event.repeat&&!['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)){
      const key=event.key.toLowerCase();if(key==='z'||key==='y'){event.preventDefault();restoreStructured(key==='y'||event.shiftKey?'redo':'undo');return;}
    }
    if(event.altKey||event.shiftKey||!(event.ctrlKey||event.metaKey)||event.repeat)return;
    const key=event.key.toLowerCase();
    if(key==='s'&&book&&mode!=='home'){
      event.preventDefault();save();return;
    }
    const target=({'1':'writing','2':'design','3':'layout','4':'publication'})[key];
    if(target&&book){event.preventDefault();navigate(target);}
  }
  function canOpenDiagnostic(d){
    return !!d.range&&typeof d.source==='string'&&!!book?.sections.some(s=>s.id===d.documentId&&s.editable);
  }
  function openDiagnostic(d){
    if(routeBlockRef.current||composing.current||layoutState.phase!=='failed'||!layoutDiagnostics.includes(d)||!canOpenDiagnostic(d))return;
    const job=generation.current;
    const reveal=()=>{
      pendingDiagnostic.current={job:generation.current,id:d.documentId,source:d.source,range:d.range};
      setMode('writing');setEditorView('source');setWritingPanel(null);setShowSettings(false);setShowPaper(false);setOutlineOpen(true);setShowDiagnostics(false);
    };
    if(file?.id===d.documentId){
      if(text!==d.source){setStatus('診断後に原稿が変更されました。再組版してください。');return;}
      reveal();return;
    }
    if(!confirmDiscard())return;
    void io(async()=>{
      const next=await unwrap(api.read(d.documentId));
      if(job!==generation.current)return;
      if(next.text!==d.source){setStatus('診断後に対象原稿が変更されました。再組版してください。');return;}
      invalidate();setStructuredHistory(null);setFile(next);setText(next.text);reveal();
    });
  }
  useEffect(()=>{
    const p=pendingDiagnostic.current;
    if(!p||busy||mode!=='writing')return;
    pendingDiagnostic.current=null;
    if(p.job!==generation.current||p.id!==file?.id||p.source!==text)return;
    const node=textarea.current;if(!node||node.value!==p.source)return;
    node.focus();node.setSelectionRange(p.range.start,p.range.end);syncSelection();
    setStatus('診断箇所を選択しました。修正後に再組版してください。');
  },[mode,file?.id,text,busy,showDiagnostics,editorView]);
  function switchEditorView(next){if(routeBlocked||!file)return;setEditorView(next);setWritingPanel(null);setHasSelection(false);}
  function openStructuredSource(range){if(routeBlocked||!file)return;pendingSource.current={job:generation.current,id:file.id,range};switchEditorView('source');}
  useEffect(()=>{const p=pendingSource.current;if(!p||editorView!=='source'||mode!=='writing')return;pendingSource.current=null;if(p.job!==generation.current||p.id!==file?.id)return;textarea.current?.focus();textarea.current?.setSelectionRange(p.range.start,p.range.end);syncSelection();},[editorView,mode,file?.id]);
  const currentHistory=structuredHistory&&structuredHistory.fileId===file?.id&&structuredHistory.current===text?structuredHistory:null;
  function commitStructured(next){if(next===text)return;const past=[...(currentHistory?.past??[]),text].slice(-20);while(past.reduce((sum,s)=>sum+s.length,0)>1000000&&past.length)past.shift();setStructuredHistory({fileId:file.id,current:next,past,future:[]});edit(next,true);}
  function restoreStructured(action){if(routeBlocked||!file?.editable||!currentHistory)return;const {past,future}=currentHistory;const next=action==='undo'?past.at(-1):future[0];if(next===undefined)return;setStructuredHistory({fileId:file.id,current:next,past:action==='undo'?past.slice(0,-1):[...past,text],future:action==='undo'?[text,...future]:future.slice(1)});edit(next,true);setStatus(action==='undo'?'構造編集を元に戻しました。':'構造編集をやり直しました。');}
  function performBlockOperation(request){if(routeBlocked||!file?.editable||editorView!=='structured'||mode!=='writing')return;try{const next=planBlockOperation(text,request,{scan:scanDocument,parseInline:parseStructuredInline,applyPatches,validateMath:parseDisplayMath,theme});commitStructured(next);setStatus('ブロック操作を反映しました。');}catch(e){setStatus(String(e.message??e));}}
  function applyStructured(draft){if(busy||structuredComposing||!file?.editable||draft!==structuredDraft||draft.inlineEdit||draft.source!==text)return;try{const next=draft.study?planStudyEdit(text,draft.study,draft.values,{scan:scanDocument,applyPatches}):planStructuredEdit(text,draft.row,draft.value,{scan:scanDocument,applyPatches,validateMath:parseDisplayMath,parseInline:parseStructuredInline,level:draft.level});if(next===text)return;commitStructured(next);setStructuredDraft(null);setStatus('ブロックの変更を反映しました（未保存）。');}catch(e){setStatus(String(e.message??e));}}
  const componentBaseDisabled=routeBlocked||!validPaper(page)||themeDirty;
  const headingDisabled=componentBaseDisabled||!theme?.componentEditable;
  const paragraphDisabled=componentBaseDisabled||!theme?.paragraphEditable;
  const studyDisabled=componentBaseDisabled||!theme?.studyEditable;
  function openHeading(level=labLevel,entry=null){
    if(headingDisabled||(entry&&!theme?.libraryEditable))return;
    void io(async()=>{setImages(await unwrap(api.listImages()));setLibraryNotice('');setInitialLibraryEntry(entry);setLabLevel(level);setLabOpen(true);});
  }
  function openParagraph(entry=null){
    if(paragraphDisabled||(entry&&!theme?.libraryEditable))return;
    setLibraryNotice('');setInitialLibraryEntry(entry);setParagraphOpen(true);
  }
  function openStudy(kind=studyTarget,entry=null){
    if(studyDisabled||(kind==='custom'&&!theme?.libraryEditable))return;
    void io(async()=>{setImages(await unwrap(api.listImages()));setLibraryNotice('');setInitialLibraryEntry(entry);setStudyTarget(kind);setStudyOpen(true);});
  }
  const headingCards=['default','1','2','3','4','5','6'].map(level=>{
    const own=level==='default'?theme?.headingDesign:theme?.headingLevels?.[level];
    const binding=theme?.bindings?.[level]??(!own&&level!=='default'?theme?.bindings?.default:undefined);
    return {key:'heading-'+level,category:'heading',name:level==='default'?'共通見出し':'見出し H'+level,description:binding?'共有参照：'+((theme?.library?.entries??[]).find(e=>e.id===binding)?.name??'登録部品'):own?'個別デザイン':level==='default'?'標準デザイン':'共通見出しを継承',sample:level==='default'||level==='1'?'第1章　はじめに':'1.'+level+'　学習のポイント',design:own??theme?.headingDesign,disabled:headingDisabled,open:()=>openHeading(level)};
  });
  const builtinCards=[...headingCards,{key:'paragraph',category:'paragraph',name:'本文段落',description:theme?.paragraphBinding?'共有参照：'+((theme?.library?.entries??[]).find(e=>e.id===theme.paragraphBinding)?.name??'登録部品'):theme?.paragraphDesign?'個別デザイン':'標準デザイン',sample:'文章を読みながら、内容を理解していきましょう。',design:theme?.paragraphDesign,disabled:paragraphDisabled,open:()=>openParagraph()},...studyKinds.map(kind=>({key:'study-'+kind,category:'study',name:studyNames[kind],description:theme?.studyBindings?.[kind]?'共有参照：'+((theme?.library?.entries??[]).find(e=>e.id===theme.studyBindings[kind])?.name??'登録部品'):theme?.studyDesigns?.[kind]?'個別デザイン':'標準デザイン',sample:kind==='exercise'?'次の問いに答えなさい。':kind==='example'?'問題の解き方を確認しましょう。':'学習内容を確認しましょう。',design:theme?.studyDesigns?.[kind]??defaultStudyDesign(kind),disabled:studyDisabled,open:()=>openStudy(kind)}))];
  const registeredCards=(theme?.library?.entries??[]).map(entry=>({key:'registered-'+entry.id,category:entry.usage,registered:true,name:entry.name,description:({heading:'登録済み見出し',paragraph:'登録済み本文',study:'登録済み教材部品'})[entry.usage]??'登録済み部品',sample:entry.usage==='heading'?'第1章　はじめに':'本文のサンプルです。',design:entry.design,disabled:!theme?.libraryEditable||(entry.usage==='heading'?headingDisabled:entry.usage==='paragraph'?paragraphDisabled:studyDisabled),open:()=>entry.usage==='heading'?openHeading('default',entry):entry.usage==='paragraph'?openParagraph(entry):openStudy('custom',entry)}));
  const componentQuery=componentSearch.trim().toLocaleLowerCase();
  const shownComponents=[...builtinCards,...registeredCards].filter(c=>(componentFilter==='all'||(componentFilter==='registered'?c.registered:c.category===componentFilter))&&(!componentQuery||(c.name+' '+c.description).toLocaleLowerCase().includes(componentQuery)));
  const query=projectSearch.trim().toLocaleLowerCase();
  const shownProjects=projects.filter(p=>(!favoritesOnly||p.favorite)&&(!query||(p.title+' '+p.path).toLocaleLowerCase().includes(query))).sort((a,b)=>projectSort==='title'?a.title.localeCompare(b.title,'ja'):b.lastOpened.localeCompare(a.lastOpened));
  return <div className="workspace-shell" data-workspace-mode={mode} onKeyDown={workspaceKey}><header className="workspace-header"><div><strong>BookCreator</strong><span> / {book?.title??'開発プレビュー'}</span></div><div className="workspace-actions"><span id="workspace-save-state" className="save-indicator" data-dirty={unsaved.length>0} title={saveLabel}>{saveLabel}</span><button id="save" hidden={!book||mode==='home'} disabled={routeBlocked||!dirty||!file?.editable} title="選択原稿のみ保存（Ctrl / Cmd + S）。テーマと書籍設定は各画面で保存してください。" aria-keyshortcuts="Control+S Meta+S" onClick={save}>原稿を保存</button><button id="book-settings" hidden={!book||mode==='home'} disabled={routeBlocked} onClick={()=>navigate(mode==='settings'?'writing':'settings')} aria-pressed={mode==='settings'}>書籍設定</button><button id="shortcut-help-toggle" type="button" disabled={routeBlocked} aria-expanded={shortcutHelp} aria-controls="shortcut-help" onClick={()=>setShortcutHelp(v=>!v)}>キー操作</button></div></header>
  <nav className="workspace-nav" aria-label="制作工程" hidden={mode==='home'}>{[['home','ホーム'],['writing','執筆'],['design','デザイン'],['layout','レイアウト'],['publication','出版']].map(([id,label])=><button key={id} id={'mode-'+id} type="button" aria-current={mode===id?'page':undefined} disabled={routeBlocked||(id!=='home'&&!book)} onClick={()=>navigate(id)}>{label}</button>)}</nav>
  <section id="shortcut-help" className="workspace-shortcuts" hidden={!shortcutHelp} aria-label="キーボードショートカット"><div><strong>キーボード操作</strong><button type="button" className="secondary-action" onClick={()=>setShortcutHelp(false)}>閉じる</button></div><dl><dt>Ctrl / Cmd + S</dt><dd>選択原稿を保存（テーマ・書籍設定は各画面で保存）</dd><dt>Ctrl / Cmd + 1 / 2 / 3 / 4</dt><dd>執筆 / デザイン / レイアウト / 出版</dd><dt>Ctrl / Cmd + B / I / U</dt><dd>執筆の選択文字を太字 / 斜体 / 下線</dd><dt>Esc</dt><dd>キー操作案内・執筆ツールを閉じる</dd></dl></section>
  <section className="workspace-home project-hub" hidden={mode!=='home'}><nav className="hub-sidebar" aria-label="書籍管理"><strong>BookCreator</strong><button id="hub-projects" aria-current={homeTab==='projects'?'page':undefined} disabled={busy} onClick={()=>{setHomeTab('projects');setCreating(false);}}>プロジェクト</button><button id="new-project" aria-current={homeTab==='new'?'page':undefined} disabled={busy} onClick={()=>{setHomeTab('new');setCreating(true);}}>新規書籍</button><button id="open" disabled={busy} onClick={open}>既存の書籍を開く</button>{book&&<button disabled={routeBlocked} onClick={()=>navigate('writing')}>編集中の書籍に戻る</button>}<small>開発プレビュー</small></nav>
  <div className="hub-content">
    {homeTab==='projects'&&<><div className="hub-heading"><div><h1>書籍プロジェクト</h1><p className="muted">書籍の作成・再開・整理をここから行います。</p></div><button id="hub-create" disabled={busy} onClick={()=>{setHomeTab('new');setCreating(true);}}>＋ 新しい書籍</button></div><div className="hub-toolbar"><label>検索<input id="project-search" type="search" placeholder="書籍名・保存場所" value={projectSearch} onChange={e=>setProjectSearch(e.target.value)}/></label><label><input type="checkbox" id="project-favorites-only" checked={favoritesOnly} onChange={e=>setFavoritesOnly(e.target.checked)}/>お気に入りのみ</label><label>並び順<select id="project-sort" value={projectSort} onChange={e=>setProjectSort(e.target.value)}><option value="recent">最近開いた順</option><option value="title">名前順</option></select></label><button className="secondary-action" disabled={busy} onClick={()=>void refreshProjects()}>一覧を更新</button></div>
    {catalogError&&<p role="alert" className="workspace-hint">書籍一覧を読み込めません：{catalogError}。書籍は「既存の書籍を開く」から開けます。</p>}
    <div className="hub-list" role="region" aria-label="登録済み書籍"><div className="hub-list-header"><span>書籍名 / 保存場所</span><span>最終アクセス</span><span>操作</span></div>{shownProjects.map(p=><div className="hub-project-row" key={p.id} data-project-id={p.id}><button className="hub-project-open" disabled={busy} onClick={()=>openRegistered(p.id)} title={p.path}><strong>{p.title}</strong><small>{p.path}</small></button><time dateTime={p.lastOpened}>{new Date(p.lastOpened).toLocaleString('ja-JP')}</time><div className="hub-row-actions"><button type="button" className="secondary-action" aria-pressed={p.favorite} aria-label={p.title+'のお気に入り'+(p.favorite?'解除':'登録')} disabled={busy} onClick={()=>favoriteProject(p.id,!p.favorite)}>{p.favorite?'★':'☆'}</button><button className="secondary-action" disabled={busy} onClick={()=>forgetProject(p.id)}>登録解除</button></div></div>)}{!shownProjects.length&&<div className="hub-empty"><h2>{projects.length?'該当する書籍がありません':'まだ書籍が登録されていません'}</h2><p>{projects.length?'検索条件を変更してください。':'新しい書籍を作成するか、既存の書籍を開くと一覧に追加されます。'}</p></div>}</div></>}
    {homeTab==='new'&&<div className="new-book"><h2>白紙の書籍</h2><p className="muted">基本設定を選んで新しい書籍を作成します。</p><label>書名<input id="new-title" maxLength={200} value={newBook.title} disabled={busy} onChange={e=>setNewBook(v=>({...v,title:e.target.value}))}/></label><label>フォルダ名<input id="new-folder" maxLength={64} value={newBook.folder} disabled={busy} onChange={e=>setNewBook(v=>({...v,folder:e.target.value}))}/></label><label>用紙<select id="new-size" value={newBook.size} disabled={busy} onChange={e=>setNewBook(v=>({...v,size:e.target.value}))}>{['A4','A5','B5'].map(s=><option key={s}>{s}</option>)}</select></label><button id="create-project" disabled={busy||!newBook.title.trim()||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(newBook.folder)} onClick={create}>保存先を選択して作成</button><small>既存のフォルダは上書きしません。</small><button type="button" className="secondary-action" disabled={busy} onClick={()=>{setHomeTab('projects');setCreating(false);}}>キャンセル</button></div>}
  </div></section>
  <div className="workspace-tools" hidden={!['writing','layout'].includes(mode)}><strong>{mode==='writing'?'執筆':'レイアウト'}</strong><div className="controls"><strong>{page?.size??'用紙未対応'}</strong><button id="preview-button" className={mode==='layout'?'secondary-action':undefined} disabled={routeBlocked||measuring||!file||!page} onClick={()=>void render()}>{mode==='layout'?'選択原稿のみ確認':'原稿を組版'}</button><button id="preview-book" disabled={routeBlocked||measuring||!book||!page} onClick={()=>void render(true)}>書籍全体を組版</button></div><div className="workspace-panel-actions"><button id="toggle-outline" hidden={mode!=='writing'} type="button" aria-expanded={outlineOpen} aria-controls="workspace-outline" onClick={()=>setOutlineOpen(v=>!v)}>{outlineOpen?'原稿一覧を隠す':'原稿一覧を表示'}</button><button id="toggle-page-list" hidden={mode!=='layout'} type="button" aria-expanded={pageListOpen} aria-controls="layout-page-list" onClick={()=>setPageListOpen(v=>!v)}>{pageListOpen?'ページ一覧を隠す':'ページ一覧を表示'}</button><button id="toggle-page-info" hidden={mode!=='layout'} type="button" aria-expanded={pageInfoOpen} aria-controls="layout-page-info" onClick={()=>setPageInfoOpen(v=>!v)}>{pageInfoOpen?'ページ情報を隠す':'ページ情報を表示'}</button><button id="toggle-paper" hidden={mode!=='writing'} type="button" aria-pressed={showPaper} onClick={()=>setShowPaper(v=>!v)}>{showPaper?'紙面を閉じる':'紙面を表示'}</button></div></div>
  <main className={'workspace-main mode-'+mode+(showPaper?' with-paper':'')+(!outlineOpen?' outline-collapsed':'')+(!pageListOpen?' page-list-collapsed':'')+(!pageInfoOpen?' page-info-collapsed':'')} hidden={mode==='home'}>
    <aside id="workspace-outline" hidden={mode!=='writing'||!outlineOpen} className="workspace-outline"><h2>原稿</h2><p className="muted">原稿構成</p>{book?.sections.map(s=><button key={s.id} data-section={s.id} className={file?.id===s.id?'selected':''} disabled={routeBlocked||!s.editable} onClick={()=>select(s.id)}><span>{s.id}</span><small>{s.path??s.type+'（未対応）'}</small></button>)}</aside>
    <section className="editor" hidden={mode!=='writing'}><h2>{file?file.id+' — 原稿（'+(editorView==='source'?'ソース':'構造編集・試作')+'）':'原稿'} {dirty&&<span className="dirty">● 未保存</span>}</h2>{!file&&<p className="workspace-hint">原稿一覧から原稿を選択すると執筆を開始できます。</p>}<div className="editor-view-switch" hidden={!file} role="group" aria-label="原稿編集方式"><button id="editor-view-source" type="button" aria-pressed={editorView==='source'} disabled={routeBlocked} onClick={()=>switchEditorView('source')}>ソース編集</button><button id="editor-view-structured" type="button" aria-pressed={editorView==='structured'} disabled={routeBlocked} onClick={()=>switchEditorView('structured')}>構造編集（試作）</button></div><div className="writing-toolbar-wrap" hidden={!file||editorView!=='source'} onKeyDown={event=>{if(event.key==='Escape'&&writingPanel&&!mathDraft&&!referenceDraft&&!event.nativeEvent.isComposing){event.preventDefault();setWritingPanel(null);textarea.current?.focus();}}}><div role="toolbar" aria-label="執筆ツール" className="writing-toolbar"><button id="source-bold" type="button" title="太字（Ctrl / Cmd + B）" disabled={formatDisabled} onMouseDown={e=>e.preventDefault()} onClick={()=>formatSelection('bold')}><strong>太字</strong></button><button id="source-italic" type="button" title="斜体（Ctrl / Cmd + I）" disabled={formatDisabled} onMouseDown={e=>e.preventDefault()} onClick={()=>formatSelection('italic')}><em>斜体</em></button><button id="source-underline" type="button" disabled={formatDisabled} onMouseDown={e=>e.preventDefault()} onClick={()=>formatSelection('underline')}><u>下線</u></button><span className="writing-tool-separator" aria-hidden="true"/><button id="writing-panel-list" type="button" className="writing-panel-toggle" aria-expanded={writingPanel==='list'} aria-controls="writing-tools-list" disabled={busy||isComposing||!!mathDraft||!!referenceDraft} onMouseDown={e=>e.preventDefault()} onClick={()=>setWritingPanel(v=>v==='list'?null:'list')}>リスト ▾</button><button id="writing-panel-math" type="button" className="writing-panel-toggle" aria-expanded={writingPanel==='math'} aria-controls="writing-tools-math" disabled={busy||isComposing||!!mathDraft||!!referenceDraft} onMouseDown={e=>e.preventDefault()} onClick={()=>setWritingPanel(v=>v==='math'?null:'math')}>数式・参照 ▾</button><button id="writing-panel-study" type="button" className="writing-panel-toggle" aria-expanded={writingPanel==='study'} aria-controls="writing-tools-study" disabled={busy||isComposing||!!mathDraft||!!referenceDraft} onMouseDown={e=>e.preventDefault()} onClick={()=>setWritingPanel(v=>v==='study'?null:'study')}>教材部品 ▾</button><button id="writing-panel-format" type="button" className="writing-panel-toggle" aria-expanded={writingPanel==='format'} aria-controls="writing-tools-format" disabled={busy||isComposing||!!mathDraft||!!referenceDraft} onMouseDown={e=>e.preventDefault()} onClick={()=>setWritingPanel(v=>v==='format'?null:'format')}>詳細書式 ▾</button><button id="writing-panel-view" type="button" className="writing-panel-toggle" aria-expanded={writingPanel==='view'} aria-controls="writing-tools-view" disabled={busy||isComposing||!!mathDraft||!!referenceDraft} onMouseDown={e=>e.preventDefault()} onClick={()=>setWritingPanel(v=>v==='view'?null:'view')}>表示 ▾</button></div><section id="writing-tools-list" className="writing-tool-panel" hidden={writingPanel!=='list'} aria-label="リスト"><div className="writing-tool-heading"><strong>リスト</strong><button type="button" className="secondary-action" aria-label="リストを閉じる" onMouseDown={e=>e.preventDefault()} onClick={()=>{setWritingPanel(null);textarea.current?.focus();}}>閉じる</button></div><div className="controls"><button id="source-list-bullet" type="button" title="独立した一行または全行選択を箇条書きに変更・解除" disabled={busy||!file?.editable} onMouseDown={e=>e.preventDefault()} onClick={()=>formatList('bullet')}>• 箇条書き</button><button id="source-list-ordered" type="button" title="独立した一行または全行選択を番号付き項目に変更・解除" disabled={busy||!file?.editable} onMouseDown={e=>e.preventDefault()} onClick={()=>formatList('ordered')}>1. 番号付き</button><button id="source-list-indent" type="button" title="選択したリスト項目を一段下げる" disabled={busy||!file?.editable} onMouseDown={e=>e.preventDefault()} onClick={()=>formatList('indent')}>インデント増</button><button id="source-list-outdent" type="button" title="選択したリスト項目を一段上げる" disabled={busy||!file?.editable} onMouseDown={e=>e.preventDefault()} onClick={()=>formatList('outdent')}>インデント減</button></div></section>
<section id="writing-tools-math" className="writing-tool-panel" hidden={writingPanel!=='math'} aria-label="数式・参照"><div className="writing-tool-heading"><strong>数式・参照</strong><button type="button" className="secondary-action" aria-label="数式・参照を閉じる" onMouseDown={e=>e.preventDefault()} onClick={()=>{setWritingPanel(null);textarea.current?.focus();}}>閉じる</button></div><div className="controls"><p className="muted writing-tool-note">カーソル位置に数式を挿入するか、既存の数式を選択して編集します。</p><button id="source-math" type="button" title="空行・末尾に数式を挿入、または既存の独立数式を編集" disabled={busy||!file?.editable} onMouseDown={e=>e.preventDefault()} onClick={()=>openMath('display')}>∑ 独立数式</button><button id="source-inline-math" type="button" title="本文のカーソル位置に数式を挿入、または既存の本文内数式を編集" disabled={busy||!file?.editable} onMouseDown={e=>e.preventDefault()} onClick={()=>openMath('inline')}>ƒ 本文内数式</button><button id="source-equation-numbering" type="button" title="既存の独立数式を選択して採番を有効化・解除" disabled={busy||!file?.editable} onMouseDown={e=>e.preventDefault()} onClick={toggleEquationNumbering}>数式採番切替</button><button id="source-equation-reference" type="button" disabled={busy||!file?.editable} onMouseDown={e=>e.preventDefault()} onClick={openReference}>数式参照</button></div></section>
<section id="writing-tools-study" className="writing-tool-panel" hidden={writingPanel!=='study'} aria-label="教材部品"><div className="writing-tool-heading"><strong>教材部品</strong><button type="button" className="secondary-action" aria-label="教材部品を閉じる" onMouseDown={e=>e.preventDefault()} onClick={()=>{setWritingPanel(null);textarea.current?.focus();}}>閉じる</button></div><div className="controls"><p className="muted writing-tool-note">部品の種類を選んで現在の原稿末尾に追加します。</p><div className="controls"><label>参考書部品<select id="study-kind" value={studyChoice} disabled={busy||!file?.editable} onChange={e=>{setStudyChoice(e.target.value);setStudyInstanceId('');setAnswerTo('');}}>{studyKinds.map(k=><option key={k} value={k}>{studyNames[k]}</option>)}{(theme?.library?.entries??[]).filter(e=>e.usage==='study').map(e=><option key={e.id} value={e.id}>自作：{e.name}</option>)}</select></label><details id="study-insertion-details" className="insertion-details" key={file?.id}><summary>詳細設定（ID・解答先・スロット）</summary><div className="controls"><label>部品ID（任意）<input id="study-instance-id" maxLength={128} value={studyInstanceId} disabled={busy||!file?.editable} onChange={e=>setStudyInstanceId(e.target.value)} placeholder="ex-01"/></label><button id="study-generate-id" disabled={busy||!file?.editable} onClick={()=>setStudyInstanceId('q-'+crypto.randomUUID())}>ID生成</button>{canLink&&<label>解答先の問題ID（任意）<input id="study-answer-to" maxLength={128} value={answerTo} disabled={busy||!file?.editable} onChange={e=>setAnswerTo(e.target.value)} placeholder="ex-01"/></label>}<label><input id="study-include-optional" type="checkbox" checked={includeOptionalSlots} disabled={busy||!file?.editable} onChange={e=>setIncludeOptionalSlots(e.target.checked)}/>任意スロットもひな型に含める</label></div></details><button id="study-append" disabled={busy||!file?.editable} onClick={appendStudy}>原稿末尾に追加</button></div></div></section>
<section id="writing-tools-format" className="writing-tool-panel" hidden={writingPanel!=='format'} aria-label="詳細書式"><div className="writing-tool-heading"><strong>詳細書式</strong><button type="button" className="secondary-action" aria-label="詳細書式を閉じる" onMouseDown={e=>e.preventDefault()} onClick={()=>{setWritingPanel(null);textarea.current?.focus();}}>閉じる</button></div><p id="format-selection-hint" className="muted writing-tool-note">{hasSelection?'選択範囲の個別書式です。書籍共通のフォントはデザイン画面で変更できます。':'原稿内の文字を選択すると個別の書式を変更できます。'}</p><div id="format-selection-controls" className="controls" hidden={!hasSelection}><button id="source-combined" type="button" disabled={formatDisabled} onMouseDown={e=>e.preventDefault()} onClick={()=>formatSelection('combined')}><strong><em>太字＋斜体</em></strong></button><label>文字色<input id="source-color" type="color" value={inlineColor} disabled={formatDisabled} onChange={e=>setInlineColor(e.target.value)}/></label><button id="source-apply-color" type="button" disabled={formatDisabled} onMouseDown={e=>e.preventDefault()} onClick={()=>formatSelection({color:inlineColor})}>色を適用</button><button id="source-clear-color" type="button" disabled={formatDisabled} onMouseDown={e=>e.preventDefault()} onClick={()=>formatSelection({color:null})}>色を継承</button><label>部分フォント<FontChoice id="source-font" options={fontChoices} value={inlineFamily} onChange={v=>{setInlineFamily(v);setInlineWeight(weightsFor(v)[0]);}} disabled={formatDisabled}/><WeightChoice id="source-font-weight" weights={weightsFor(inlineFamily)} value={inlineWeight} onChange={setInlineWeight} disabled={formatDisabled}/></label><button id="source-apply-font" type="button" disabled={formatDisabled||!fontChoices.some(f=>f.id===inlineFamily&&!f.disabled)} onMouseDown={e=>e.preventDefault()} onClick={applyInlineFont}>フォントを適用</button><button id="source-clear-font" type="button" disabled={formatDisabled} onMouseDown={e=>e.preventDefault()} onClick={()=>formatSelection({font:null})}>フォントを継承</button><label>部分文字サイズ (mm)<input id="source-font-size" type="number" min="1" max="30" step=".1" value={inlineSize} disabled={formatDisabled} onChange={e=>setInlineSize(e.target.value)}/></label><button id="source-apply-size" type="button" disabled={formatDisabled||!inlineSize||!Number.isFinite(Number(inlineSize))||Number(inlineSize)<1||Number(inlineSize)>30} onMouseDown={e=>e.preventDefault()} onClick={()=>formatSelection({fontSize:Math.round(Number(inlineSize)*1000)})}>サイズを適用</button><button id="source-clear-size" type="button" disabled={formatDisabled} onMouseDown={e=>e.preventDefault()} onClick={()=>formatSelection({fontSize:null})}>サイズを継承</button><button id="source-super" type="button" disabled={formatDisabled} onMouseDown={e=>e.preventDefault()} onClick={()=>formatSelection({baseline:'super'})}>上付き x<sup>2</sup></button><button id="source-sub" type="button" disabled={formatDisabled} onMouseDown={e=>e.preventDefault()} onClick={()=>formatSelection({baseline:'sub'})}>下付き H<sub>2</sub>O</button><button id="source-clear-baseline" type="button" disabled={formatDisabled} onMouseDown={e=>e.preventDefault()} onClick={()=>formatSelection({baseline:null})}>基準位置</button></div></section>
<section id="writing-tools-view" className="writing-tool-panel" hidden={writingPanel!=='view'} aria-label="表示"><div className="writing-tool-heading"><strong>表示</strong><button type="button" className="secondary-action" aria-label="表示を閉じる" onMouseDown={e=>e.preventDefault()} onClick={()=>{setWritingPanel(null);textarea.current?.focus();}}>閉じる</button></div><div className="controls"><p className="muted writing-tool-note">ここで変更するフォントは原稿エディタの表示だけに適用されます。</p><label className="font-control">原稿エディタ <FontChoice id="editor-font" options={fontChoices} value={editorFont} onChange={setEditorFont} disabled={busy}/></label></div></section></div>{referenceDraft&&<section id="equation-reference-editor" aria-label="数式参照" style={{border:'1px solid #888',padding:8,marginBottom:8}}><strong>数式参照の挿入</strong><label>参照先<select id="equation-reference-target" value={referenceDraft.targetId} disabled={busy||referenceStale} onChange={e=>setReferenceDraft(d=>({...d,targetId:e.target.value}))}>{referenceDraft.targets.map(t=><option key={t.id} value={t.id}>{t.number} · {t.documentId} · {t.formula.slice(0,80)} · {t.id}</option>)}</select></label><label>表示形式<select id="equation-reference-format" value={referenceDraft.format} disabled={busy||referenceStale} onChange={e=>setReferenceDraft(d=>({...d,format:e.target.value}))}><option value="label-number">式 (章.番号)</option><option value="number">章.番号</option></select></label><small>{referenceStale?'原稿が変更されました。開き直してください。':'番号は書籍順で自動更新されます。原稿にはIDを保存します。'}</small><div className="controls"><button id="equation-reference-apply" type="button" disabled={busy||referenceStale} onClick={applyReference}>挿入</button><button id="equation-reference-cancel" type="button" disabled={busy} onClick={()=>setReferenceDraft(null)}>キャンセル</button></div></section>}{mathDraft&&<section id="math-editor" aria-label={mathDraft.kind==='inline'?'本文内数式エディタ':'独立数式エディタ'} style={{border:'1px solid #888',padding:8,marginBottom:8}}><strong>{(mathDraft.kind==='inline'?'本文内数式':'独立数式')+(mathDraft.mode==='edit'?'の編集':'の挿入')}</strong><div className="controls">{[['分数','\\frac{a}{b}'],['平方根','\\sqrt{x}'],['添字・指数','x_1^2'],['総和','\\sum_{k=1}^{n}k'],['三角関数','\\sin x+\\cos x'],['極限','\\lim_{x\\to0}\\frac{\\sin x}{x}'],['対数','\\log_2 x'],['ベクトル','\\vec{a}\\cdot\\vec{b}'],['累乗根','\\sqrt[3]{x}'],['可変括弧','\\left(\\frac{a}{b}\\right)^2'],['偏微分','\\frac{\\partial f}{\\partial x}'],['行列','\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}'],['場合分け','\\begin{cases}x&x\\geq0\\\\-x&x<0\\end{cases}'],['途中式','\\begin{aligned}(x+1)^2&=(x+1)(x+1)\\\\&=x^2+2x+1\\end{aligned}']].map(([name,formula])=><button key={name} type="button" disabled={busy||mathStale} onClick={()=>{if(!mathComposing.current)setMathDraft(d=>({...d,formula}));}}>{name}</button>)}</div><label>数式（対応LaTeX記法）<MathField id="math-formula" autoFocus {...(mathDraft.kind==='display'?{rows:5}:{type:'text'})} maxLength={2048} value={mathDraft.formula} disabled={busy||mathStale} spellCheck={false} onCompositionStart={()=>{mathComposing.current=true;}} onCompositionEnd={()=>{mathComposing.current=false;}} onChange={e=>setMathDraft(d=>({...d,formula:e.target.value}))} style={{width:'100%',fontFamily:'monospace'}}/></label>{mathDraft.component&&<small>参考書部品内の独立数式</small>}{mathDraft.kind==='display'&&<div><label><input id="math-numbered" type="checkbox" checked={mathDraft.numbered} disabled={busy||mathStale||mathDraft.mode==='edit'} onChange={e=>{const numbered=e.target.checked;setMathDraft(d=>({...d,numbered,equationId:numbered?(d.equationId??'eq-'+crypto.randomUUID()):d.equationId}));}}/>章別の数式番号を付ける</label>{(mathDraft.mode==='edit'||mathDraft.numbered)&&mathDraft.equationId&&<details className="insertion-details" id="math-id-details"><summary>詳細設定（数式ID）</summary><small id="math-equation-id">数式ID：{mathDraft.equationId}</small></details>}{mathDraft.mode==='edit'&&<small>既存の採番設定とIDは保持します。</small>}</div>}<div ref={mathPreview} id="math-draft-preview" style={{fontFamily:'math, serif',fontSize:'20px',overflowX:'auto',minHeight:32,textAlign:'center'}}/><small id="math-error" role="status">{mathStale?'原稿が変更されました。閉じて開き直してください。':mathError?'未対応または不正な数式：'+mathError:'ひな型ボタンは式全体を置換します。プレビューは参考表示です。'}</small><div className="controls"><button id="math-apply" type="button" disabled={busy||mathStale||!!mathError} onClick={applyMath}>{mathDraft.mode==='edit'?'更新':'挿入'}</button><button id="math-cancel" type="button" onClick={()=>{mathComposing.current=false;setMathDraft(null);}}>キャンセル</button></div></section>}<textarea id="source" hidden={editorView!=='source'} onSelect={syncSelection} style={{fontFamily:editorFont,fontWeight:fonts.find(f=>f.alias===editorFont)?.weight??400}} ref={textarea} value={text} disabled={busy||!file} readOnly={!file?.editable} onCompositionStart={()=>{composing.current=true;setIsComposing(true);}} onCompositionEnd={()=>{composing.current=false;setIsComposing(false);}} onKeyDown={e=>{if(e.nativeEvent.isComposing||composing.current||e.altKey||e.shiftKey||!(e.ctrlKey||e.metaKey))return;const k=e.key.toLowerCase();if(k==='b'||k==='i'||k==='u'){e.preventDefault();formatSelection(k==='b'?'bold':k==='i'?'italic':'underline');}}} onChange={e=>edit(e.target.value)} spellCheck={false}/>{file&&editorView==='structured'&&<StructuredEditor source={text} editable={file.editable} blocked={busy||structuredComposing} draft={structuredDraft} setDraft={setStructuredDraft} onApply={applyStructured} onSource={openStructuredSource} scan={scanDocument} applyPatches={applyPatches} validateMath={parseDisplayMath} parseInline={parseStructuredInline} planFormat={planInlineFormat} mathFamily={typography.mathFontFamily} library={theme?.library} theme={theme} history={{undo:!!currentHistory?.past.length,redo:!!currentHistory?.future.length}} onHistory={restoreStructured} onOperation={performBlockOperation} onComposition={setStructuredComposing} fontFamily={editorFont}/>}<p className="muted">原稿を選択して執筆します。共通フォントや部品は「デザイン」で変更できます。</p></section>
    <aside id="layout-page-list" className="layout-page-list" hidden={mode!=='layout'||!pageListOpen} aria-label="ページ一覧"><h2>ページ一覧</h2><p id="layout-page-scope" className="muted">{layoutState.phase==='ready'?(layoutState.scope==='book'?'書籍全体':'選択原稿のみ')+' · '+layoutPages.length+' ページ':'最新の組版結果はありません'}</p>{layoutState.phase==='ready'&&layoutPages.length>0?<div id="layout-pages" aria-label="ページ一覧（配置の簡易見本）">{layoutPages.map(p=><button type="button" key={p.number} data-layout-page={p.number} className={activePage===p.number?'selected':''} aria-current={activePage===p.number?'page':undefined} onClick={()=>navigatePage(p.number)}><PaperThumbnail shape={p.thumbnail}/><span className="layout-thumbnail-label"><strong>ページ {p.number}</strong><small>{p.documents.join(' / ')||'原稿断片なし'}</small></span></button>)}</div>:<p className="muted">「書籍全体を組版」でページ一覧を表示します。</p>}</aside>
    <section className="paper" hidden={mode!=='layout'&&(mode!=='writing'||!showPaper)}><h2>{mode==='layout'?'紙面':'参考プレビュー'}</h2><div className="layout-page-toolbar" hidden={mode!=='layout'||layoutState.phase!=='ready'||!layoutPages.length}><button id="layout-prev" type="button" disabled={activePage<=1} onClick={()=>navigatePage(activePage-1)}>前へ</button><form onSubmit={e=>{e.preventDefault();navigatePage(Number(pageJump));}}><label>ページ <input id="layout-page-jump" type="number" min={1} max={layoutPages.length||1} value={pageJump} onChange={e=>setPageJump(e.target.value)}/></label><span> / {layoutPages.length}</span><button id="layout-jump" type="submit" disabled={!Number.isInteger(Number(pageJump))||Number(pageJump)<1||Number(pageJump)>layoutPages.length}>移動</button></form><button id="layout-next" type="button" disabled={activePage>=layoutPages.length} onClick={()=>navigatePage(activePage+1)}>次へ</button></div><div hidden={mode!=='layout'||layoutState.phase!=='ready'||!layoutPages.length}><PaperViewControls view={paperView}/></div>{layoutState.phase!=='ready'&&<p className="workspace-hint">{layoutState.phase==='running'?'組版中です。完了するとここに紙面が表示されます。':layoutState.phase==='failed'?'下部の診断を確認してから組版し直してください。':mode==='layout'?'「書籍全体を組版」で全冊の紙面を確認できます。':'「原稿を組版」で現在の原稿を確認できます。'}</p>}<div ref={preview} id="preview" onScroll={trackPage}/></section>
    <aside id="layout-page-info" className="layout-page-info" hidden={mode!=='layout'||!pageInfoOpen} aria-label="ページ情報"><h2>ページ情報</h2>{layoutState.phase==='ready'&&selectedPage?<><h3 id="layout-current-page">ページ {activePage} / {layoutPages.length}</h3><p className="muted">組版結果の物理順（印刷番号ではありません）</p><dl><dt>対象</dt><dd>{layoutState.scope==='book'?'書籍全体':'選択原稿のみ'}</dd><dt>原稿</dt><dd>{selectedPage.documents.join(' / ')||'原稿断片なし'}</dd><dt>表示ブロック数</dt><dd>{selectedPage.blocks}</dd></dl><p className="muted">現在開いている原稿の断片を選ぶと、執筆画面の対応範囲へ移動します。他の原稿は執筆画面から開いてください。</p></>:<p className="muted">組版後にページ情報を表示します。</p>}<button id="layout-to-publication" type="button" disabled={routeBlocked} onClick={()=>navigate('publication')}>出版の準備へ</button></aside>
    <section className="workspace-design" hidden={mode!=='design'}><h1>デザイン</h1><p className="muted">書籍全体の見た目を設定します。原稿の文章は変更しません。</p><nav className="design-nav" aria-label="デザインのカテゴリ">{[['styles','スタイル'],['components','部品ライブラリ'],['assets','素材'],['fonts','フォント']].map(([id,label])=><button key={id} id={'design-tab-'+id} type="button" aria-current={designTab===id?'page':undefined} aria-controls={'design-panel-'+id} disabled={routeBlocked} onClick={()=>setDesignTab(id)}>{label}</button>)}</nav><div className="design-grid design-categories"><section id="design-panel-styles" hidden={designTab!=='styles'} aria-labelledby="design-tab-styles"><h2>共通スタイル</h2><p className="muted">本文・見出し・数式に適用する書籍共通のフォント設定です。エディタの表示フォントには影響しません。</p><div className="typography"><label>本文 <FontChoice id="body-font" options={fontChoices} value={typography.body.fontFamily} onChange={v=>setRole('body','fontFamily',v)} disabled={busy}/><WeightChoice id="body-weight" weights={weightsFor(typography.body.fontFamily)} value={typography.body.fontWeight} onChange={v=>setRole('body','fontWeight',v)} disabled={busy}/></label><label>見出し <FontChoice id="heading-font" options={fontChoices} value={typography.heading.fontFamily} onChange={v=>setRole('heading','fontFamily',v)} disabled={busy}/><WeightChoice id="heading-weight" weights={weightsFor(typography.heading.fontFamily)} value={typography.heading.fontWeight} onChange={v=>setRole('heading','fontWeight',v)} disabled={busy}/></label><label>数式 <FontChoice id="math-font" options={mathFontChoices} value={typography.mathFontFamily??'auto'} onChange={setMathFont} disabled={busy}/></label><button id="save-theme" disabled={busy||!theme?.editable||!themeDirty} onClick={saveTheme}>テーマを保存</button><small>{themeDirty?'● 未保存のフォント設定':theme?.editable?'テーマ設定を反映済み':'試し設定のみ（テーマ保存不可）'}</small><small>用紙・余白は書籍設定を反映します。</small></div><div className="design-style-sample"><small>文字の見本（組版結果ではありません）</small><h3 style={{fontFamily:typography.heading.fontFamily,fontWeight:typography.heading.fontWeight}}>第1章　はじめに</h3><p style={{fontFamily:typography.body.fontFamily,fontWeight:typography.body.fontWeight}}>この書籍で学ぶ内容を、順番に見ていきましょう。ABC 123</p></div>{themeDirty&&<button className="secondary-action" id="discard-theme-roles" disabled={busy} onClick={()=>{setTypography(fromRoles(theme.roles));invalidate();setStatus('フォント設定の変更を取り消しました。');}}>フォント設定の変更を取り消す</button>}</section><section id="design-panel-fonts" className="design-controls" hidden={designTab!=='fonts'} aria-labelledby="design-tab-fonts"><h2>フォント</h2><p className="muted">書籍に追加するフォントを登録し、ライセンスと読込状態を確認します。使用先はスタイルや部品エディタで選択します。</p><p>Noto Sans JP・STIX Two Math（同梱） ／ 登録フォント {fonts.length} 件</p><button id="font-manager" aria-expanded={fontManager} disabled={busy||!book} onClick={()=>setFontManager(v=>!v)}>{fontManager?'フォント管理を閉じる':'登録フォントの確認・追加'}</button>{fontManager&&book&&<div className="font-manager"><h3>プロジェクトフォント</h3><small>TTF/OTF・静的・正立書体。数式用はRegularのOpenType MATH対応。再配布可能なフォントのみ。</small>{fonts.map(f=><div key={f.id} data-project-font={f.id} data-loaded={f.loaded}><strong>{f.family} {f.style}</strong><small>{f.weight} · {f.license} · {f.loaded?'読込済み':'読込失敗'}</small><div style={{fontFamily:f.loaded?f.alias:'sans-serif',fontWeight:f.weight}}>日本語 ABC 123</div><details><summary>ライセンス情報</summary><pre>{f.licenseText}</pre><small>埋込許可申告: {f.embedAllowed?'あり':'なし'} / fsType: {f.fsType}</small></details></div>)}<label>ライセンス名<input id="font-license" maxLength={120} value={rights.license} onChange={e=>setRights(v=>({...v,license:e.target.value}))} disabled={busy}/></label><label>ライセンス本文<textarea id="font-license-text" maxLength={16000} value={rights.licenseText} onChange={e=>setRights(v=>({...v,licenseText:e.target.value}))} disabled={busy}/></label><label><input id="font-copy" type="checkbox" checked={rights.copyAllowed} onChange={e=>setRights(v=>({...v,copyAllowed:e.target.checked}))} disabled={busy}/>プロジェクトへのコピー・共有が許可されている</label><label><input type="checkbox" checked={rights.embedAllowed} onChange={e=>setRights(v=>({...v,embedAllowed:e.target.checked}))} disabled={busy}/>PDF埋め込みが許可されている（申告）</label><button id="import-font" disabled={busy||!rights.copyAllowed||!rights.license.trim()||!rights.licenseText.trim()} onClick={importFont}>TTF / OTFを選択</button></div>}</section><section id="design-panel-assets" className="design-controls" hidden={designTab!=='assets'} aria-labelledby="design-tab-assets"><h2>素材</h2><p className="muted">部品で使用する画像素材を登録・確認します。</p><button id="image-manager" aria-expanded={imageManager} disabled={busy||!book} onClick={toggleImages}>{imageManager?'画像素材管理を閉じる':'登録画像の確認・追加'}</button>{imageManager&&book&&<div className="font-manager"><h3>プロジェクト画像</h3><small>静止PNG・16MB以下・1600万画素以下。紙面配置は次の段階です。</small>{images.map(i=><div key={i.id} data-project-image={i.id}><img alt="登録画像" src={'bookcreator://app/project-images/'+i.id+'.png'} style={{display:'block',maxWidth:'100%',maxHeight:96,objectFit:'contain'}} onError={e=>{e.currentTarget.hidden=true;e.currentTarget.nextElementSibling.textContent='画像のデコードに失敗しました。';}}/><small>{i.width} × {i.height} px · {i.id.slice(0,12)}</small></div>)}<label><input id="image-copy" type="checkbox" checked={imageAllowed} disabled={busy} onChange={e=>setImageAllowed(e.target.checked)}/>プロジェクトへのコピー・共有が許可されている</label><button id="import-image" disabled={busy||!imageAllowed} onClick={importImage}>PNG素材を選択</button></div>}</section><section id="design-panel-components" className="design-controls" hidden={designTab!=='components'} aria-labelledby="design-tab-components"><h2>部品ライブラリ</h2><p className="muted">編集する部品を選びます。変更は共通デザインに適用され、原稿本文は変わりません。</p>{themeDirty&&<p className="workspace-hint">未保存の共通フォント設定があります。<button type="button" className="secondary-action" onClick={()=>setDesignTab('styles')}>スタイルで保存または取消</button></p>}<div className="component-catalog-toolbar"><label>検索<input id="component-search" type="search" placeholder="部品名・設定状態" value={componentSearch} onChange={e=>setComponentSearch(e.target.value)}/></label><label>種類<select id="component-filter" value={componentFilter} onChange={e=>setComponentFilter(e.target.value)}>{[['all','すべて'],['heading','見出し'],['paragraph','本文'],['study','教材部品'],['registered','登録済み部品']].map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><button id="catalog-custom-new" disabled={studyDisabled||!theme?.libraryEditable} onClick={()=>openStudy('custom')}>＋ 自作教材部品</button></div><p className="muted">簡易見本：文字色・背景色の参考表示です。実際の配置や寸法は部品エディタで確認してください。</p><div className="design-component-grid" id="component-catalog">{shownComponents.map(c=><article className="design-component-card catalog-card" data-component-key={c.key} key={c.key}><div className="catalog-specimen" style={{color:c.design?.textColor??'#263c50',background:c.design?.background??'#f7f9fb',fontFamily:c.category==='heading'?typography.heading.fontFamily:typography.body.fontFamily,fontWeight:c.category==='heading'?typography.heading.fontWeight:typography.body.fontWeight}}>{c.category==='study'&&<strong>{c.name}</strong>}<span>{c.sample}</span></div><h3>{c.name}</h3><p className="muted">{c.description}</p><button type="button" data-catalog-edit={c.key} disabled={c.disabled} onClick={c.open}>{c.registered?'登録部品を編集':'編集'}</button></article>)}</div>{!shownComponents.length&&<p id="component-catalog-empty" className="workspace-hint">条件に一致する部品がありません。</p>}<details id="component-quick-select" className="insertion-details"><summary>編集対象を直接指定（一覧選択）</summary><div className="design-component-grid"><div className="design-component-card"><h3>見出し</h3><p className="muted">章・節の見出しデザイン</p><label>見出し部品<select id="lab-level" disabled={busy||!book||labOpen} value={labLevel} onChange={e=>setLabLevel(e.target.value)}><option value="default">共通見出し</option>{[1,2,3,4,5,6].map(n=><option key={n} value={String(n)}>H{n} {theme?.headingLevels?.[n]?"（個別）":"（継承）"}</option>)}</select></label><button id="component-lab" disabled={busy||!theme?.componentEditable||!validPaper(page)||themeDirty} onClick={()=>openHeading()}>見出し部品を編集</button></div><div className="design-component-card"><h3>本文</h3><p className="muted">段落・余白・背景・文字</p><button id="paragraph-lab" disabled={busy||!theme?.paragraphEditable||!validPaper(page)||themeDirty} onClick={()=>openParagraph()}>本文部品を編集</button></div><div className="design-component-card"><h3>教材部品・自作部品</h3><p className="muted">例題・練習問題・解説など</p><label>参考書デザイン<select id="study-design-kind" value={studyTarget} disabled={busy||!book||studyOpen} onChange={e=>setStudyTarget(e.target.value)}>{studyKinds.map(k=><option key={k} value={k}>{studyNames[k]}{theme?.studyDesigns?.[k]?'（個別）':'（既定）'}</option>)}<option value="custom">独自部品の作成・管理</option></select></label><button id="study-design-lab" disabled={busy||!theme?.studyEditable||!validPaper(page)||themeDirty||(studyTarget==='custom'&&!theme?.libraryEditable)} onClick={()=>openStudy()}>参考書部品編集</button></div></div></details></section></div></section>
    <section className="workspace-settings" hidden={mode!=='settings'}><h1>書籍設定</h1>{showSettings&&book&&<div className="new-book"><h3>用紙と原稿構成</h3>{page?<><label>用紙<select id="page-size" value={page.size} disabled={busy} onChange={e=>changePage('size',e.target.value)}>{['A4','A5','B5'].map(s=><option key={s}>{s}</option>)}</select></label><label>最初の内頁<select value={page.firstSide} disabled={busy} onChange={e=>changePage('firstSide',e.target.value)}><option value="right">右</option><option value="left">左</option></select></label>{[['top','上'],['bottom','下'],['inner','内側'],['outer','外側']].map(([k,label])=><label key={k}>{label}余白 (mm)<input type="number" min="0" max="300" step=".1" value={page.margin[k]/1000} disabled={busy} onChange={e=>changePage('margin',{...page.margin,[k]:Math.round(Number(e.target.value)*1000)})}/></label>)}</>:<small>{savedSettings?.message}</small>}{order.map((s,i)=><div key={s.id} className="section-order"><strong>{s.id}</strong><div><button aria-label="上へ" disabled={busy||i===0} onClick={()=>moveSection(i,-1)}>↑</button><button aria-label="下へ" disabled={busy||i===order.length-1} onClick={()=>moveSection(i,1)}>↓</button></div><select value={s.startOn} disabled={busy||!['page','continuous'].includes(s.startOn)} onChange={e=>setStart(s.id,e.target.value)}>{!['page','continuous'].includes(s.startOn)&&<option value={s.startOn}>{s.startOn}（未対応）</option>}<option value="page">新しいページ</option><option value="continuous">続ける</option></select></div>)}<button id="save-book-settings" disabled={busy||!page||!settingsDirty||order.some(s=>!['page','continuous'].includes(s.startOn))} onClick={saveBookSettings}>書籍設定を保存</button><button disabled={busy||!settingsDirty} onClick={discardSettings}>変更を破棄</button><small>{settingsDirty?'● 未保存の書籍設定':'保存済み書籍設定'}</small></div>}</section>
    <PublicationPanel visible={mode==='publication'} saveLabel={saveLabel} dirty={dirty} themeDirty={themeDirty} settingsDirty={settingsDirty} layout={layoutState} diagnostics={layoutDiagnostics} canOpenDiagnostic={canOpenDiagnostic} onOpenDiagnostic={openDiagnostic} blocked={routeBlocked} canRender={!!book&&!!validPaper(page)} onNavigate={navigate} onRender={()=>{navigate('layout');void render(true);}}/>
  </main>
  <section id="workspace-diagnostics" className="workspace-diagnostics" hidden={!showDiagnostics||layoutState.phase!=='failed'} aria-label="組版診断"><div className="diagnostic-heading"><strong>組版診断 · {layoutDiagnostics.length}件</strong><button type="button" className="secondary-action" onClick={()=>setShowDiagnostics(false)}>閉じる</button></div><DiagnosticList id="workspace-diagnostic-list" diagnostics={layoutDiagnostics} blocked={routeBlocked} canOpen={canOpenDiagnostic} onOpen={openDiagnostic}/></section>
   <div className="workspace-statusbar"><span id="workspace-layout-state" data-phase={layoutState.phase} data-scope={layoutState.scope??'none'}>{layoutLabel}</span><button id="toggle-diagnostics" type="button" hidden={layoutState.phase!=='failed'} className="secondary-action" aria-expanded={showDiagnostics} aria-controls="workspace-diagnostics" disabled={routeBlocked} onClick={()=>setShowDiagnostics(v=>!v)}>診断 {layoutDiagnostics.length}件</button><footer id="status" role="status">{status}</footer></div>{paragraphOpen&&page&&<ParagraphLab initialEntry={initialLibraryEntry} design={theme.paragraphDesign} library={theme.library} binding={theme.paragraphBinding} libraryEditable={theme.libraryEditable} libraryMessage={theme.libraryMessage??libraryNotice} onLibraryAction={changeLibrary} bodyFont={typography.body} mathFontFamily={typography.mathFontFamily} fontOptions={componentFonts} width={paperGeometry(page).content.width} height={paperGeometry(page).content.height} busy={busy} onCancel={()=>setParagraphOpen(false)} onApply={applyParagraph}/>}{studyOpen&&page&&<ComponentLab initialEntry={initialLibraryEntry} key={'study-'+studyTarget} usage="study" customOnly={studyTarget==='custom'} level={studyTarget} studyName={studyTarget==='custom'?'独自部品ライブラリ':studyNames[studyTarget]} design={studyTarget==='custom'?defaultStudyDesign('note'):theme.studyDesigns?.[studyTarget]??defaultStudyDesign(studyTarget)} hasOverride={!!theme.studyDesigns?.[studyTarget]} fontOptions={componentFonts} library={theme.library} bindings={theme.studyBindings??{}} libraryEditable={theme.libraryEditable} libraryMessage={theme.libraryMessage??libraryNotice} onLibraryAction={changeLibrary} imageOptions={images} resolveImage={resolveImage} typography={typography} width={paperGeometry(page).content.width} height={paperGeometry(page).content.height} busy={busy} onCancel={()=>setStudyOpen(false)} onApply={applyStudy}/>}{labOpen&&page&&<ComponentLab initialEntry={initialLibraryEntry} key={labLevel} level={labLevel} design={(labLevel==="default"?theme.headingDesign:theme.headingLevels?.[labLevel]??theme.headingDesign)} hasOverride={labLevel==="default"?!!theme.headingDesign:!!theme.headingLevels?.[labLevel]} fontOptions={componentFonts} library={theme.library} bindings={theme.bindings??{}} headingLevels={theme.headingLevels??{}} libraryEditable={theme.libraryEditable} libraryMessage={theme.libraryMessage??libraryNotice} onLibraryAction={changeLibrary} imageOptions={images} resolveImage={resolveImage} typography={typography} width={paperGeometry(page).content.width} height={paperGeometry(page).content.height} busy={busy} onCancel={()=>setLabOpen(false)} onApply={applyHeadingDesign}/>}</div>;
}
createRoot(document.getElementById('root')).render(<App/>);
