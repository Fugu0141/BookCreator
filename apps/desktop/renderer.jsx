import React,{useState,useRef,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {prepareBrowserPreview,prepareBookBrowserPreview,previewSourceRange,planInlineFormat,planListFormat,planListIndent,planListBatch,inspectDisplayMath,planDisplayMath,inspectInlineMath,planInlineMath,inspectComponentDisplayMath,planComponentDisplayMath,equationReferenceTargets,planEquationReference,planEquationNumbering,hasDynamicLabels,hasStudyNumbering,studyTemplate,studyKinds,defaultStudyDesign,customStudyTemplate,isCustomComponentId,linkedStudyTemplate,slottedStudyTemplate,namedSlotDefinitions} from '../../dist/index.js';
import {scanDocument,validateScannedBlocks,indexBlockIds,applyPatches,parseReferenceToken} from '../../../BookCreator_Markdown/dist/index.js';
import {createPlainTextPagePreview,parsePreviewMath,createPreviewMath} from '../../../BookCreator_LayoutEngine/dist/index.js';
import {ParagraphLab} from './paragraph-lab.jsx';
import {ComponentLab} from './component-lab.jsx';
import {paperGeometry} from './book-settings.mjs';
const deps={scan:scanDocument,validate:validateScannedBlocks,index:indexBlockIds,validateDisplayMath:parsePreviewMath,validateInlineMath:parsePreviewMath,parseReference:parseReferenceToken};
const api=window.bookcreator;
const studyNames={note:'補足',tip:'ポイント',warning:'注意',important:'重要',example:'例題',exercise:'練習問題',explanation:'解説'};
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
  async function applyBook(next){invalidate();setImages([]);setImageManager(false);setImageAllowed(false);setFonts(await registerProjectFonts(next.fonts??[]));setEditorFont(noto);setRights({license:'',licenseText:'',copyAllowed:false,embedAllowed:false});setBook(next);setStudyInstanceId('');setAnswerTo('');setStudyChoice('example');applySettings(next.settings);setShowSettings(false);setFile(null);setText('');setTheme(next.typography);setTypography(fromRoles(next.typography.roles));setCreating(false);setLabOpen(false);setParagraphOpen(false);setStudyOpen(false);setLabLevel("default");setStatus(next.typography.message??'原稿を選択してください。');}
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
  const [includeOptionalSlots,setIncludeOptionalSlots]=useState(false);
  const [studyChoice,setStudyChoice]=useState('example'),[studyInstanceId,setStudyInstanceId]=useState(''),[answerTo,setAnswerTo]=useState('');
  const canLink=studyChoice==='explanation'||isCustomComponentId(studyChoice);
  function edit(value){setText(value);invalidate();setStatus('未保存の変更があります。');}
  const composing=useRef(false);
  const [mathDraft,setMathDraft]=useState(null),mathPreview=useRef(null),mathComposing=useRef(false);
  const mathStale=!!mathDraft&&(mathDraft.fileId!==file?.id||mathDraft.revision!==file?.revision||mathDraft.job!==generation.current||mathDraft.source!==text);
  let mathError='';
  if(mathDraft)try{parsePreviewMath(mathDraft.formula);if(mathDraft.kind==='inline'&&mathDraft.formula.trim()!==mathDraft.formula)throw Error('本文内数式の前後に空白を置けません。');}catch(e){mathError=String(e.message??e);}
  useEffect(()=>{
    const target=mathPreview.current;
    if(!target)return;
    target.replaceChildren();
    if(mathDraft&&!mathError)target.append(createPreviewMath(document,mathDraft.formula,mathDraft.kind==='inline'?'inline':'block'));
  },[mathDraft,mathError]);
  function openMath(kind='display'){
    const node=textarea.current;
    if(busy||working.current||!file?.editable||!node||composing.current)return;
    try{
      if(node.value!==text)throw Error('原稿の編集状態が変わりました。');
      const start=node.selectionStart,end=node.selectionEnd,target=kind==='inline'?inspectInlineMath(text,start,end,deps):(inspectComponentDisplayMath(text,start,end,deps)??inspectDisplayMath(text,start,end,scanDocument));
      mathComposing.current=false;
      setMathDraft({kind,start,end,component:target.component===true,formula:target.formula,mode:target.mode,numbered:kind==='display'&&!!target.numbered,equationId:kind==='display'?target.equationId:undefined,source:text,fileId:file.id,revision:file.revision,job:generation.current});
    }catch(e){setStatus('数式編集不可：'+String(e.message??e));}
  }
  function applyMath(){
    const node=textarea.current;
    if(!mathDraft||busy||working.current||!file?.editable||!node||composing.current||mathComposing.current)return;
    try{
      if(mathStale||node.value!==mathDraft.source)throw Error('原稿が変更されました。数式エディタを開き直してください。');
      const plan=mathDraft.kind==='inline'?planInlineMath(text,mathDraft.start,mathDraft.end,mathDraft.formula,deps):mathDraft.component?planComponentDisplayMath(text,mathDraft.start,mathDraft.end,mathDraft.formula,deps):planDisplayMath(text,mathDraft.start,mathDraft.end,mathDraft.formula,scanDocument,parsePreviewMath,mathDraft.mode==='insert'&&mathDraft.numbered?mathDraft.equationId:undefined);
      const next=applyPatches(text,[plan.patch]);
      setMathDraft(null);edit(next);setStatus((mathDraft.kind==='inline'?'本文内数式':'独立数式')+'を'+(plan.action==='apply'?'挿入':'更新')+'しました（未保存）。');
      const job=generation.current;
      requestAnimationFrame(()=>{if(textarea.current===node&&generation.current===job&&node.value===next){node.focus();node.setSelectionRange(plan.selection.start,plan.selection.end);}});
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
      const target=inspectDisplayMath(text,start,end,scanDocument);
      if(target.mode!=='edit')throw Error('既存の独立数式を選択してください。');
      const enabled=!target.numbered;
      const documents=await referenceDocuments(text);
      if(generation.current!==job||node.value!==text||composing.current)throw Error('原稿が変更されました。');
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
    if(busy||!file?.editable||!node||composing.current)return;
    try{
      if(node.value!==text)throw Error('原稿の編集状態が変わりました。再選択してください。');
      const planned=planInlineFormat(text,node.selectionStart,node.selectionEnd,format,scanDocument);
      const next=applyPatches(text,[planned.patch]);
      edit(next);setStatus((planned.action==='remove'?'書式を解除':planned.action==='replace'?'書式を変更':'書式を適用')+'しました（未保存）。');
      const currentGeneration=generation.current;
      requestAnimationFrame(()=>{if(textarea.current===node&&generation.current===currentGeneration&&node.value===next){node.focus();node.setSelectionRange(planned.selection.start,planned.selection.end);}});
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
    if(!book||(!whole&&!file)||busy)return;invalidate();const job=generation.current;setMeasuring(true);setStatus('実測組版中…');
    const raw=text;
    try{
      if(theme?.componentMessage||theme?.paragraphMessage||theme?.studyMessage)throw Error('部品定義が未対応です: '+(theme.componentMessage??theme.paragraphMessage??theme.studyMessage));
      if(!page)throw Error(savedSettings?.message??'用紙設定が未対応です。');
      const geometry=paperGeometry(page);
      if(Object.values(typography).some(v=>v.fontFamily.startsWith('BCFont_')&&v.fontFamily!==noto&&!fonts.some(f=>f.alias===v.fontFamily&&f.loaded)))throw Error('登録フォントを読み込めません。');
      const rev=String(job),fingerprint='desktop-poc-'+job+'-'+__BUNDLED_FONT_FINGERPRINT__+'-'+JSON.stringify(typography)+'-'+fonts.map(f=>f.sha256).join(',')+'-'+JSON.stringify({page,order,headingDesign:theme?.headingDesign,headingLevels:theme?.headingLevels,paragraphDesign:theme?.paragraphDesign,studyDesigns:theme?.studyDesigns,library:theme?.library});
      let documents;
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
      const sourceBlocks=new Map(options.sections.flatMap(s=>s.blocks.filter(b=>!('kind' in b)).map(b=>[JSON.stringify([b.origin.documentId,b.origin.blockKey]),b])));
      [...result.element.shadowRoot.querySelectorAll('[data-block]')].forEach((el,i)=>{
        const slice=result.slices[i];if(!slice)return;
        const bind=(node,range)=>{if(!range)return;node.tabIndex=0;node.style.cursor='pointer';
          const focus=()=>{if(job!==generation.current)return;if(slice.origin.documentId!==file?.id){setStatus('この断片は '+slice.origin.documentId+' の原稿です。左の原稿一覧から開いてください。');return;}textarea.current.focus();textarea.current.setSelectionRange(range.start,range.end);};
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
      setStatus(result.plan.pages.length+' ページ · '+(whole?'書籍全体':'選択原稿')+' · 実測プレビュー（出版不可）');
    }catch(e){if(job===generation.current)setStatus(String(e.message??e));}
    finally{if(job===generation.current)setMeasuring(false);}
  }
  return <><header><div><strong>BookCreator</strong><span> / Desktop PoC</span></div><div><button id="new-project" disabled={busy} onClick={()=>setCreating(v=>!v)}>新規書籍</button><button id="open" disabled={busy} onClick={open}>プロジェクトを開く</button><button id="save" disabled={busy||!dirty||!file?.editable} onClick={save}>原稿を保存</button></div></header>
    <main><aside><h2>{book?.title??'プロジェクト'}</h2>{creating&&<div className="new-book"><h3>新規書籍の作成</h3><label>書名<input id="new-title" maxLength={200} value={newBook.title} disabled={busy} onChange={e=>setNewBook(v=>({...v,title:e.target.value}))}/></label><label>フォルダ名<input id="new-folder" maxLength={64} value={newBook.folder} disabled={busy} onChange={e=>setNewBook(v=>({...v,folder:e.target.value}))}/></label><label>用紙<select id="new-size" value={newBook.size} disabled={busy} onChange={e=>setNewBook(v=>({...v,size:e.target.value}))}>{['A4','A5','B5'].map(s=><option key={s}>{s}</option>)}</select></label><button id="create-project" disabled={busy||!newBook.title.trim()||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(newBook.folder)} onClick={create}>保存先を選択して作成</button><small>既存のフォルダは上書きしません。</small></div>}<button id="font-manager" disabled={busy||!book} onClick={()=>setFontManager(v=>!v)}>フォント管理</button>{fontManager&&book&&<div className="font-manager"><h3>プロジェクトフォント</h3><small>TTF/OTF・静的・正立書体。再配布可能なフォントのみ。</small>{fonts.map(f=><div key={f.id} data-project-font={f.id} data-loaded={f.loaded}><strong>{f.family} {f.style}</strong><small>{f.weight} · {f.license} · {f.loaded?'読込済み':'読込失敗'}</small><div style={{fontFamily:f.loaded?f.alias:'sans-serif',fontWeight:f.weight}}>日本語 ABC 123</div><details><summary>ライセンス情報</summary><pre>{f.licenseText}</pre><small>埋込許可申告: {f.embedAllowed?'あり':'なし'} / fsType: {f.fsType}</small></details></div>)}<label>ライセンス名<input id="font-license" maxLength={120} value={rights.license} onChange={e=>setRights(v=>({...v,license:e.target.value}))} disabled={busy}/></label><label>ライセンス本文<textarea id="font-license-text" maxLength={16000} value={rights.licenseText} onChange={e=>setRights(v=>({...v,licenseText:e.target.value}))} disabled={busy}/></label><label><input id="font-copy" type="checkbox" checked={rights.copyAllowed} onChange={e=>setRights(v=>({...v,copyAllowed:e.target.checked}))} disabled={busy}/>プロジェクトへのコピー・共有が許可されている</label><label><input type="checkbox" checked={rights.embedAllowed} onChange={e=>setRights(v=>({...v,embedAllowed:e.target.checked}))} disabled={busy}/>PDF埋め込みが許可されている（申告）</label><button id="import-font" disabled={busy||!rights.copyAllowed||!rights.license.trim()||!rights.licenseText.trim()} onClick={importFont}>TTF / OTFを選択</button></div>}<button id="image-manager" disabled={busy||!book} onClick={toggleImages}>画像素材管理</button>{imageManager&&book&&<div className="font-manager"><h3>プロジェクト画像</h3><small>静止PNG・16MB以下・1600万画素以下。紙面配置は次の段階です。</small>{images.map(i=><div key={i.id} data-project-image={i.id}><img alt="登録画像" src={'bookcreator://app/project-images/'+i.id+'.png'} style={{display:'block',maxWidth:'100%',maxHeight:96,objectFit:'contain'}} onError={e=>{e.currentTarget.hidden=true;e.currentTarget.nextElementSibling.textContent='画像のデコードに失敗しました。';}}/><small>{i.width} × {i.height} px · {i.id.slice(0,12)}</small></div>)}<label><input id="image-copy" type="checkbox" checked={imageAllowed} disabled={busy} onChange={e=>setImageAllowed(e.target.checked)}/>プロジェクトへのコピー・共有が許可されている</label><button id="import-image" disabled={busy||!imageAllowed} onClick={importImage}>PNG素材を選択</button></div>}<label>見出し部品<select id="lab-level" disabled={busy||!book||labOpen} value={labLevel} onChange={e=>setLabLevel(e.target.value)}><option value="default">共通見出し</option>{[1,2,3,4,5,6].map(n=><option key={n} value={String(n)}>H{n} {theme?.headingLevels?.[n]?"（個別）":"（継承）"}</option>)}</select></label><button id="component-lab" disabled={busy||!theme?.componentEditable||!validPaper(page)||themeDirty} onClick={()=>void io(async()=>{setImages(await unwrap(api.listImages()));setLibraryNotice('');setLabOpen(true);})}>Component Lab</button><button id="paragraph-lab" disabled={busy||!theme?.paragraphEditable||!validPaper(page)||themeDirty} onClick={()=>{setLibraryNotice('');setParagraphOpen(true);}}>本文部品</button><label>参考書デザイン<select id="study-design-kind" value={studyTarget} disabled={busy||!book||studyOpen} onChange={e=>setStudyTarget(e.target.value)}>{studyKinds.map(k=><option key={k} value={k}>{studyNames[k]}{theme?.studyDesigns?.[k]?'（個別）':'（既定）'}</option>)}<option value="custom">独自部品の作成・管理</option></select></label><button id="study-design-lab" disabled={busy||!theme?.studyEditable||!validPaper(page)||themeDirty||(studyTarget==='custom'&&!theme?.libraryEditable)} onClick={()=>void io(async()=>{setImages(await unwrap(api.listImages()));setLibraryNotice('');setStudyOpen(true);})}>参考書部品編集</button><button id="book-settings" disabled={busy||!book} onClick={()=>setShowSettings(v=>!v)}>書籍設定</button>{showSettings&&book&&<div className="new-book"><h3>用紙と原稿構成</h3>{page?<><label>用紙<select id="page-size" value={page.size} disabled={busy} onChange={e=>changePage('size',e.target.value)}>{['A4','A5','B5'].map(s=><option key={s}>{s}</option>)}</select></label><label>最初の内頁<select value={page.firstSide} disabled={busy} onChange={e=>changePage('firstSide',e.target.value)}><option value="right">右</option><option value="left">左</option></select></label>{[['top','上'],['bottom','下'],['inner','内側'],['outer','外側']].map(([k,label])=><label key={k}>{label}余白 (mm)<input type="number" min="0" max="300" step=".1" value={page.margin[k]/1000} disabled={busy} onChange={e=>changePage('margin',{...page.margin,[k]:Math.round(Number(e.target.value)*1000)})}/></label>)}</>:<small>{savedSettings?.message}</small>}{order.map((s,i)=><div key={s.id} className="section-order"><strong>{s.id}</strong><div><button aria-label="上へ" disabled={busy||i===0} onClick={()=>moveSection(i,-1)}>↑</button><button aria-label="下へ" disabled={busy||i===order.length-1} onClick={()=>moveSection(i,1)}>↓</button></div><select value={s.startOn} disabled={busy||!['page','continuous'].includes(s.startOn)} onChange={e=>setStart(s.id,e.target.value)}>{!['page','continuous'].includes(s.startOn)&&<option value={s.startOn}>{s.startOn}（未対応）</option>}<option value="page">新しいページ</option><option value="continuous">続ける</option></select></div>)}<button id="save-book-settings" disabled={busy||!page||!settingsDirty||order.some(s=>!['page','continuous'].includes(s.startOn))} onClick={saveBookSettings}>書籍設定を保存</button><button disabled={busy||!settingsDirty} onClick={discardSettings}>変更を破棄</button><small>{settingsDirty?'● 未保存の書籍設定':'保存済み書籍設定'}</small></div>}<p className="muted">原稿構成</p>{book?.sections.map(s=><button key={s.id} data-section={s.id} className={file?.id===s.id?'selected':''} disabled={busy||!s.editable} onClick={()=>select(s.id)}><span>{s.id}</span><small>{s.path??s.type+'（未対応）'}</small></button>)}</aside>
    <section className="editor"><h2>BCM 原稿 {dirty&&<span className="dirty">● 未保存</span>}</h2><label className="font-control">原稿エディタ <FontChoice id="editor-font" options={fontChoices} value={editorFont} onChange={setEditorFont} disabled={busy}/></label><div className="controls"><label>参考書部品<select id="study-kind" value={studyChoice} disabled={busy||!file?.editable} onChange={e=>{setStudyChoice(e.target.value);setStudyInstanceId('');setAnswerTo('');}}>{studyKinds.map(k=><option key={k} value={k}>{studyNames[k]}</option>)}{(theme?.library?.entries??[]).filter(e=>e.usage==='study').map(e=><option key={e.id} value={e.id}>自作：{e.name}</option>)}</select></label><label>部品ID（任意）<input id="study-instance-id" maxLength={128} value={studyInstanceId} disabled={busy||!file?.editable} onChange={e=>setStudyInstanceId(e.target.value)} placeholder="ex-01"/></label><button id="study-generate-id" disabled={busy||!file?.editable} onClick={()=>setStudyInstanceId('q-'+crypto.randomUUID())}>ID生成</button>{canLink&&<label>解答先の問題ID（任意）<input id="study-answer-to" maxLength={128} value={answerTo} disabled={busy||!file?.editable} onChange={e=>setAnswerTo(e.target.value)} placeholder="ex-01"/></label>}<label><input id="study-include-optional" type="checkbox" checked={includeOptionalSlots} disabled={busy||!file?.editable} onChange={e=>setIncludeOptionalSlots(e.target.checked)}/>任意スロットもひな型に含める</label><button id="study-append" disabled={busy||!file?.editable} onClick={appendStudy}>原稿末尾に追加</button></div><div role="toolbar" aria-label="原稿の文字書式" className="controls"><button id="source-list-bullet" type="button" title="独立した一行または全行選択を箇条書きに変更・解除" disabled={busy||!file?.editable} onMouseDown={e=>e.preventDefault()} onClick={()=>formatList('bullet')}>• 箇条書き</button><button id="source-list-ordered" type="button" title="独立した一行または全行選択を番号付き項目に変更・解除" disabled={busy||!file?.editable} onMouseDown={e=>e.preventDefault()} onClick={()=>formatList('ordered')}>1. 番号付き</button><button id="source-list-indent" type="button" title="選択したリスト項目を一段下げる" disabled={busy||!file?.editable} onMouseDown={e=>e.preventDefault()} onClick={()=>formatList('indent')}>インデント増</button><button id="source-list-outdent" type="button" title="選択したリスト項目を一段上げる" disabled={busy||!file?.editable} onMouseDown={e=>e.preventDefault()} onClick={()=>formatList('outdent')}>インデント減</button><button id="source-math" type="button" title="空行・末尾に数式を挿入、または既存の独立数式を編集" disabled={busy||!file?.editable} onMouseDown={e=>e.preventDefault()} onClick={()=>openMath('display')}>∑ 独立数式</button><button id="source-inline-math" type="button" title="本文のカーソル位置に数式を挿入、または既存の本文内数式を編集" disabled={busy||!file?.editable} onMouseDown={e=>e.preventDefault()} onClick={()=>openMath('inline')}>ƒ 本文内数式</button><button id="source-equation-numbering" type="button" title="既存の独立数式を選択して採番を有効化・解除" disabled={busy||!file?.editable} onMouseDown={e=>e.preventDefault()} onClick={toggleEquationNumbering}>数式採番切替</button><button id="source-equation-reference" type="button" disabled={busy||!file?.editable} onMouseDown={e=>e.preventDefault()} onClick={openReference}>数式参照</button><button id="source-bold" type="button" title="太字（Ctrl / Cmd + B）" disabled={busy||!file?.editable} onMouseDown={e=>e.preventDefault()} onClick={()=>formatSelection('bold')}><strong>太字</strong></button><button id="source-italic" type="button" title="斜体（Ctrl / Cmd + I）" disabled={busy||!file?.editable} onMouseDown={e=>e.preventDefault()} onClick={()=>formatSelection('italic')}><em>斜体</em></button><button id="source-underline" type="button" disabled={busy||!file?.editable} onMouseDown={e=>e.preventDefault()} onClick={()=>formatSelection('underline')}><u>下線</u></button><button id="source-combined" type="button" disabled={busy||!file?.editable} onMouseDown={e=>e.preventDefault()} onClick={()=>formatSelection('combined')}><strong><em>太字＋斜体</em></strong></button><label>文字色<input id="source-color" type="color" value={inlineColor} disabled={busy||!file?.editable} onChange={e=>setInlineColor(e.target.value)}/></label><button id="source-apply-color" type="button" disabled={busy||!file?.editable} onMouseDown={e=>e.preventDefault()} onClick={()=>formatSelection({color:inlineColor})}>色を適用</button><button id="source-clear-color" type="button" disabled={busy||!file?.editable} onMouseDown={e=>e.preventDefault()} onClick={()=>formatSelection({color:null})}>色を継承</button><label>部分フォント<FontChoice id="source-font" options={fontChoices} value={inlineFamily} onChange={v=>{setInlineFamily(v);setInlineWeight(weightsFor(v)[0]);}} disabled={busy||!file?.editable}/><WeightChoice id="source-font-weight" weights={weightsFor(inlineFamily)} value={inlineWeight} onChange={setInlineWeight} disabled={busy||!file?.editable}/></label><button id="source-apply-font" type="button" disabled={busy||!file?.editable||!fontChoices.some(f=>f.id===inlineFamily&&!f.disabled)} onMouseDown={e=>e.preventDefault()} onClick={applyInlineFont}>フォントを適用</button><button id="source-clear-font" type="button" disabled={busy||!file?.editable} onMouseDown={e=>e.preventDefault()} onClick={()=>formatSelection({font:null})}>フォントを継承</button><label>部分文字サイズ (mm)<input id="source-font-size" type="number" min="1" max="30" step=".1" value={inlineSize} disabled={busy||!file?.editable} onChange={e=>setInlineSize(e.target.value)}/></label><button id="source-apply-size" type="button" disabled={busy||!file?.editable||!inlineSize||!Number.isFinite(Number(inlineSize))||Number(inlineSize)<1||Number(inlineSize)>30} onMouseDown={e=>e.preventDefault()} onClick={()=>formatSelection({fontSize:Math.round(Number(inlineSize)*1000)})}>サイズを適用</button><button id="source-clear-size" type="button" disabled={busy||!file?.editable} onMouseDown={e=>e.preventDefault()} onClick={()=>formatSelection({fontSize:null})}>サイズを継承</button><button id="source-super" type="button" disabled={busy||!file?.editable} onMouseDown={e=>e.preventDefault()} onClick={()=>formatSelection({baseline:'super'})}>上付き x<sup>2</sup></button><button id="source-sub" type="button" disabled={busy||!file?.editable} onMouseDown={e=>e.preventDefault()} onClick={()=>formatSelection({baseline:'sub'})}>下付き H<sub>2</sub>O</button><button id="source-clear-baseline" type="button" disabled={busy||!file?.editable} onMouseDown={e=>e.preventDefault()} onClick={()=>formatSelection({baseline:null})}>基準位置</button><small>文字を選択して適用・解除。フォント選択はウェイトも指定します。</small></div>{referenceDraft&&<section id="equation-reference-editor" aria-label="数式参照" style={{border:'1px solid #888',padding:8,marginBottom:8}}><strong>数式参照の挿入</strong><label>参照先<select id="equation-reference-target" value={referenceDraft.targetId} disabled={busy||referenceStale} onChange={e=>setReferenceDraft(d=>({...d,targetId:e.target.value}))}>{referenceDraft.targets.map(t=><option key={t.id} value={t.id}>{t.number} · {t.documentId} · {t.formula.slice(0,80)} · {t.id}</option>)}</select></label><label>表示形式<select id="equation-reference-format" value={referenceDraft.format} disabled={busy||referenceStale} onChange={e=>setReferenceDraft(d=>({...d,format:e.target.value}))}><option value="label-number">式 (章.番号)</option><option value="number">章.番号</option></select></label><small>{referenceStale?'原稿が変更されました。開き直してください。':'番号は書籍順で自動更新されます。原稿にはIDを保存します。'}</small><div className="controls"><button id="equation-reference-apply" type="button" disabled={busy||referenceStale} onClick={applyReference}>挿入</button><button id="equation-reference-cancel" type="button" disabled={busy} onClick={()=>setReferenceDraft(null)}>キャンセル</button></div></section>}{mathDraft&&<section id="math-editor" aria-label={mathDraft.kind==='inline'?'本文内数式エディタ':'独立数式エディタ'} style={{border:'1px solid #888',padding:8,marginBottom:8}}><strong>{(mathDraft.kind==='inline'?'本文内数式':'独立数式')+(mathDraft.mode==='edit'?'の編集':'の挿入')}</strong><div className="controls">{[['分数','\\frac{a}{b}'],['平方根','\\sqrt{x}'],['添字・指数','x_1^2'],['総和','\\sum_{k=1}^{n}k']].map(([name,formula])=><button key={name} type="button" disabled={busy||mathStale} onClick={()=>{if(!mathComposing.current)setMathDraft(d=>({...d,formula}));}}>{name}</button>)}</div><label>数式（対応LaTeX記法）<input id="math-formula" autoFocus type="text" maxLength={2048} value={mathDraft.formula} disabled={busy||mathStale} spellCheck={false} onCompositionStart={()=>{mathComposing.current=true;}} onCompositionEnd={()=>{mathComposing.current=false;}} onChange={e=>setMathDraft(d=>({...d,formula:e.target.value}))} style={{width:'100%',fontFamily:'monospace'}}/></label>{mathDraft.component&&<small>参考書部品内の独立数式（採番なし）</small>}{mathDraft.kind==='display'&&!mathDraft.component&&<div><label><input id="math-numbered" type="checkbox" checked={mathDraft.numbered} disabled={busy||mathStale||mathDraft.mode==='edit'} onChange={e=>{const numbered=e.target.checked;setMathDraft(d=>({...d,numbered,equationId:numbered?(d.equationId??'eq-'+crypto.randomUUID()):d.equationId}));}}/>章別の数式番号を付ける</label>{(mathDraft.mode==='edit'||mathDraft.numbered)&&mathDraft.equationId&&<small id="math-equation-id">数式ID：{mathDraft.equationId}</small>}{mathDraft.mode==='edit'&&<small>既存の採番設定とIDは保持します。</small>}</div>}<div ref={mathPreview} id="math-draft-preview" style={{fontFamily:'math, serif',fontSize:'20px',overflowX:'auto',minHeight:32,textAlign:'center'}}/><small id="math-error" role="status">{mathStale?'原稿が変更されました。閉じて開き直してください。':mathError?'未対応または不正な数式：'+mathError:'ひな型ボタンは式全体を置換します。プレビューは参考表示です。'}</small><div className="controls"><button id="math-apply" type="button" disabled={busy||mathStale||!!mathError} onClick={applyMath}>{mathDraft.mode==='edit'?'更新':'挿入'}</button><button id="math-cancel" type="button" onClick={()=>{mathComposing.current=false;setMathDraft(null);}}>キャンセル</button></div></section>}<textarea id="source" style={{fontFamily:editorFont,fontWeight:fonts.find(f=>f.alias===editorFont)?.weight??400}} ref={textarea} value={text} disabled={busy||!file} readOnly={!file?.editable} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}} onKeyDown={e=>{if(e.nativeEvent.isComposing||composing.current||e.altKey||e.shiftKey||!(e.ctrlKey||e.metaKey))return;const k=e.key.toLowerCase();if(k==='b'||k==='i'||k==='u'){e.preventDefault();formatSelection(k==='b'?'bold':k==='i'?'italic':'underline');}}} onChange={e=>edit(e.target.value)} spellCheck={false}/><p className="muted">原文を正本として保存。書籍フォントはテーマに保存します。</p></section>
    <section className="paper"><h2>紙面プレビュー</h2><div className="controls"><strong>{page?.size??'用紙未対応'}</strong><button id="preview-button" disabled={busy||measuring||!file||!page} onClick={()=>void render()}>原稿を組版</button><button id="preview-book" disabled={busy||measuring||!book||!page} onClick={()=>void render(true)}>書籍全体を組版</button></div><div className="typography"><label>本文 <FontChoice id="body-font" options={fontChoices} value={typography.body.fontFamily} onChange={v=>setRole('body','fontFamily',v)} disabled={busy}/><WeightChoice id="body-weight" weights={weightsFor(typography.body.fontFamily)} value={typography.body.fontWeight} onChange={v=>setRole('body','fontWeight',v)} disabled={busy}/></label><label>見出し <FontChoice id="heading-font" options={fontChoices} value={typography.heading.fontFamily} onChange={v=>setRole('heading','fontFamily',v)} disabled={busy}/><WeightChoice id="heading-weight" weights={weightsFor(typography.heading.fontFamily)} value={typography.heading.fontWeight} onChange={v=>setRole('heading','fontWeight',v)} disabled={busy}/></label><button id="save-theme" disabled={busy||!theme?.editable||!themeDirty} onClick={saveTheme}>テーマを保存</button><small>{themeDirty?'● 未保存のフォント設定':theme?.editable?'テーマ設定を反映済み':'試し設定のみ（テーマ保存不可）'}</small><small>用紙・余白は書籍設定を反映します。</small></div><div ref={preview} id="preview"/></section></main><footer id="status" role="status">{status}</footer>{paragraphOpen&&page&&<ParagraphLab design={theme.paragraphDesign} library={theme.library} binding={theme.paragraphBinding} libraryEditable={theme.libraryEditable} libraryMessage={theme.libraryMessage??libraryNotice} onLibraryAction={changeLibrary} bodyFont={typography.body} fontOptions={componentFonts} width={paperGeometry(page).content.width} height={paperGeometry(page).content.height} busy={busy} onCancel={()=>setParagraphOpen(false)} onApply={applyParagraph}/>}{studyOpen&&page&&<ComponentLab key={'study-'+studyTarget} usage="study" customOnly={studyTarget==='custom'} level={studyTarget} studyName={studyTarget==='custom'?'独自部品ライブラリ':studyNames[studyTarget]} design={studyTarget==='custom'?defaultStudyDesign('note'):theme.studyDesigns?.[studyTarget]??defaultStudyDesign(studyTarget)} hasOverride={!!theme.studyDesigns?.[studyTarget]} fontOptions={componentFonts} library={theme.library} bindings={theme.studyBindings??{}} libraryEditable={theme.libraryEditable} libraryMessage={theme.libraryMessage??libraryNotice} onLibraryAction={changeLibrary} imageOptions={images} resolveImage={resolveImage} typography={typography} width={paperGeometry(page).content.width} height={paperGeometry(page).content.height} busy={busy} onCancel={()=>setStudyOpen(false)} onApply={applyStudy}/>}{labOpen&&page&&<ComponentLab key={labLevel} level={labLevel} design={(labLevel==="default"?theme.headingDesign:theme.headingLevels?.[labLevel]??theme.headingDesign)} hasOverride={labLevel==="default"?!!theme.headingDesign:!!theme.headingLevels?.[labLevel]} fontOptions={componentFonts} library={theme.library} bindings={theme.bindings??{}} headingLevels={theme.headingLevels??{}} libraryEditable={theme.libraryEditable} libraryMessage={theme.libraryMessage??libraryNotice} onLibraryAction={changeLibrary} imageOptions={images} resolveImage={resolveImage} typography={typography} width={paperGeometry(page).content.width} height={paperGeometry(page).content.height} busy={busy} onCancel={()=>setLabOpen(false)} onApply={applyHeadingDesign}/>}</>;
}
createRoot(document.getElementById('root')).render(<App/>);
