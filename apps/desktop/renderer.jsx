import React,{useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {prepareBrowserPreview} from '../../dist/index.js';
import {scanDocument,validateScannedBlocks,indexBlockIds} from '../../../BookCreator_Markdown/dist/index.js';
import {createPlainTextPagePreview} from '../../../BookCreator_LayoutEngine/dist/index.js';
const deps={scan:scanDocument,validate:validateScannedBlocks,index:indexBlockIds};
const api=window.bookcreator;
const noto='BCFont_NotoSansJP';
const choices=[{id:noto,label:'Noto Sans JP'},{id:'serif',label:'システム明朝・セリフ'},{id:'sans-serif',label:'システムゴシック'},{id:'monospace',label:'等幅'}];
const idsByFamily={'BCFont_NotoSansJP':'noto-sans-jp','serif':'system-serif','sans-serif':'system-sans','monospace':'system-monospace'};
const familiesById=Object.fromEntries(Object.entries(idsByFamily).map(([family,id])=>[id,family]));
function fromRoles(roles){return roles?Object.fromEntries(Object.entries(roles).map(([role,v])=>[role,{fontFamily:familiesById[v.font],fontWeight:v.weight}])):initialTypography;}
function toRoles(typography){return Object.fromEntries(Object.entries(typography).map(([role,v])=>[role,{font:idsByFamily[v.fontFamily],weight:v.fontWeight}]));}
const initialTypography={body:{fontFamily:noto,fontWeight:400},heading:{fontFamily:noto,fontWeight:700}};
function FontChoice({id,value,onChange,disabled}){return <select id={id} value={value} onChange={e=>onChange(e.target.value)} disabled={disabled}>{choices.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select>;}
function WeightChoice({id,value,onChange,disabled}){return <select id={id} value={value} onChange={e=>onChange(Number(e.target.value))} disabled={disabled}>{[400,500,600,700].map(w=><option key={w} value={w}>{w}</option>)}</select>;}
async function unwrap(p){const r=await p;if(!r.ok)throw Error(r.error.code+': '+r.error.message);return r.value;}
function App(){
  const [book,setBook]=useState(null),[file,setFile]=useState(null),[text,setText]=useState(''),[status,setStatus]=useState('book.yaml を開いてください。'),[busy,setBusy]=useState(false),[measuring,setMeasuring]=useState(false),[size,setSize]=useState({width:100,height:75});
  const [typography,setTypography]=useState(initialTypography),[editorFont,setEditorFont]=useState(noto);
  const [theme,setTheme]=useState(null),[creating,setCreating]=useState(false),[newBook,setNewBook]=useState({title:'新しい書籍',folder:'new-book',size:'A5'});
  const themeDirty=!!theme&&JSON.stringify(typography)!==JSON.stringify(fromRoles(theme.roles));
  function applyBook(next){invalidate();setBook(next);setFile(null);setText('');setTheme(next.typography);setTypography(fromRoles(next.typography.roles));setCreating(false);setStatus(next.typography.message??'原稿を選択してください。');}
  function create(){if(!confirmProjectDiscard())return;void io(async()=>{const next=await unwrap(api.create(newBook));if(next)applyBook(next);});}
  function saveTheme(){if(!theme?.editable||!themeDirty)return;void io(async()=>{const next=await unwrap(api.saveTypography(theme.revision,toRoles(typography)));setTheme(next);setStatus('テーマを保存しました。');});}
  function setRole(role,key,value){setTypography(t=>({...t,[role]:{...t[role],[key]:value}}));invalidate();setStatus('書籍プレビューのフォント設定を変更しました（未保存）。');}
  const textarea=useRef(null),preview=useRef(null),generation=useRef(0),working=useRef(false);
  const dirty=!!file&&text!==file.text;
  const invalidate=()=>{generation.current++;preview.current?.replaceChildren();setMeasuring(false);};
  const confirmDiscard=()=>!dirty||window.confirm('未保存の変更を破棄しますか？');
  const confirmProjectDiscard=()=>!(dirty||themeDirty)||window.confirm('未保存の原稿・テーマ設定を破棄しますか？');
  async function io(fn){if(working.current)return;working.current=true;setBusy(true);try{await fn();}catch(e){setStatus(String(e.message??e));}finally{working.current=false;setBusy(false);}}
  function open(){if(!confirmProjectDiscard())return;void io(async()=>{const next=await unwrap(api.open());if(next)applyBook(next);});}
  function select(id){if(!confirmDiscard())return;void io(async()=>{const next=await unwrap(api.read(id));invalidate();setFile(next);setText(next.text);setStatus(next.editable?'原稿を読み込みました。':'混在改行のため読み取り専用です。');});}
  function save(){if(!file?.editable||!dirty)return;void io(async()=>{const saved=await unwrap(api.save(file.id,file.revision,text));setFile({...file,text,revision:saved.revision});setStatus('保存しました。');});}
  function edit(value){setText(value);invalidate();setStatus('未保存の変更があります。');}
  function resize(key,value){setSize(s=>({...s,[key]:value}));invalidate();setStatus('本文領域を変更しました。');}
  async function render(){
    if(!file||busy)return;invalidate();const job=generation.current;setMeasuring(true);setStatus('実測組版中…');
    const raw=text;
    try{
      const w=Number(size.width),h=Number(size.height);
      if(!Number.isFinite(w)||w<30||w>250||!Number.isFinite(h)||h<30||h>300)throw Error('本文領域の寸法が範囲外です。');
      const rev=String(job),fingerprint='desktop-poc-'+job+'-'+__BUNDLED_FONT_FINGERPRINT__+'-'+JSON.stringify(typography);
      const section=book.sections.find(s=>s.id===file.id);
      if(!['page','continuous'].includes(section.startOn))throw Error('このセクションの開始面はプレビュー未対応です。');
      const prepared=prepareBrowserPreview({documentId:file.id,revision:rev,source:raw,startOn:section.startOn},rev,fingerprint,{width:Math.round(w*1000),height:Math.round(h*1000)},deps,typography);
      if(!prepared.options)throw Error(prepared.diagnostics.map(d=>d.code+' '+d.message).join('\n'));
      const result=await createPlainTextPagePreview(document,prepared.options);
      if(job!==generation.current)return;
      preview.current.append(result.element);
      [...result.element.shadowRoot.querySelectorAll('[data-block]')].forEach((el,i)=>{
        const range=result.slices[i]?.sourceSlice;if(!range)return;
        el.tabIndex=0;el.style.cursor='pointer';
        const focus=()=>{if(job!==generation.current)return;textarea.current.focus();textarea.current.setSelectionRange(range.start,range.end);};
        el.addEventListener('click',focus);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();focus();}});
      });
      setStatus(result.plan.pages.length+' ページ · 実測プレビュー（出版不可）');
    }catch(e){if(job===generation.current)setStatus(String(e.message??e));}
    finally{if(job===generation.current)setMeasuring(false);}
  }
  return <><header><div><strong>BookCreator</strong><span> / Desktop PoC</span></div><div><button id="new-project" disabled={busy} onClick={()=>setCreating(v=>!v)}>新規書籍</button><button id="open" disabled={busy} onClick={open}>プロジェクトを開く</button><button id="save" disabled={busy||!dirty||!file?.editable} onClick={save}>原稿を保存</button></div></header>
    <main><aside><h2>{book?.title??'プロジェクト'}</h2>{creating&&<div className="new-book"><h3>新規書籍の作成</h3><label>書名<input id="new-title" maxLength={200} value={newBook.title} disabled={busy} onChange={e=>setNewBook(v=>({...v,title:e.target.value}))}/></label><label>フォルダ名<input id="new-folder" maxLength={64} value={newBook.folder} disabled={busy} onChange={e=>setNewBook(v=>({...v,folder:e.target.value}))}/></label><label>用紙<select id="new-size" value={newBook.size} disabled={busy} onChange={e=>setNewBook(v=>({...v,size:e.target.value}))}>{['A4','A5','B5'].map(s=><option key={s}>{s}</option>)}</select></label><button id="create-project" disabled={busy||!newBook.title.trim()||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(newBook.folder)} onClick={create}>保存先を選択して作成</button><small>既存のフォルダは上書きしません。</small></div>}<p className="muted">原稿構成</p>{book?.sections.map(s=><button key={s.id} data-section={s.id} className={file?.id===s.id?'selected':''} disabled={busy||!s.editable} onClick={()=>select(s.id)}><span>{s.id}</span><small>{s.path??s.type+'（未対応）'}</small></button>)}</aside>
    <section className="editor"><h2>BCM 原稿 {dirty&&<span className="dirty">● 未保存</span>}</h2><label className="font-control">原稿エディタ <FontChoice id="editor-font" value={editorFont} onChange={setEditorFont} disabled={busy}/></label><textarea id="source" style={{fontFamily:editorFont}} ref={textarea} value={text} disabled={busy||!file} readOnly={!file?.editable} onChange={e=>edit(e.target.value)} spellCheck={false}/><p className="muted">原文を正本として保存。書籍フォントはテーマに保存します。</p></section>
    <section className="paper"><h2>紙面プレビュー</h2><div className="controls"><label>本文幅 <input type="number" min="30" max="250" value={size.width} disabled={busy} onChange={e=>resize('width',e.target.value)}/></label><label>本文高 <input type="number" min="30" max="300" value={size.height} disabled={busy} onChange={e=>resize('height',e.target.value)}/></label><button id="preview-button" disabled={busy||measuring||!file} onClick={()=>void render()}>組版</button></div><div className="typography"><label>本文 <FontChoice id="body-font" value={typography.body.fontFamily} onChange={v=>setRole('body','fontFamily',v)} disabled={busy}/><WeightChoice id="body-weight" value={typography.body.fontWeight} onChange={v=>setRole('body','fontWeight',v)} disabled={busy}/></label><label>見出し <FontChoice id="heading-font" value={typography.heading.fontFamily} onChange={v=>setRole('heading','fontFamily',v)} disabled={busy}/><WeightChoice id="heading-weight" value={typography.heading.fontWeight} onChange={v=>setRole('heading','fontWeight',v)} disabled={busy}/></label><button id="save-theme" disabled={busy||!theme?.editable||!themeDirty} onClick={saveTheme}>テーマを保存</button><small>{themeDirty?'● 未保存のフォント設定':theme?.editable?'テーマ設定を反映済み':'試し設定のみ（テーマ保存不可）'}</small><small>本文領域の寸法は試し設定です。</small></div><div ref={preview} id="preview"/></section></main><footer id="status" role="status">{status}</footer></>;
}
createRoot(document.getElementById('root')).render(<App/>);
