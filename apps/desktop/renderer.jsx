import React,{useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {prepareBrowserPreview} from '../../dist/index.js';
import {scanDocument,validateScannedBlocks,indexBlockIds} from '../../../BookCreator_Markdown/dist/index.js';
import {createPlainTextPagePreview} from '../../../BookCreator_LayoutEngine/dist/index.js';
const deps={scan:scanDocument,validate:validateScannedBlocks,index:indexBlockIds};
const api=window.bookcreator;
async function unwrap(p){const r=await p;if(!r.ok)throw Error(r.error.code+': '+r.error.message);return r.value;}
function App(){
  const [book,setBook]=useState(null),[file,setFile]=useState(null),[text,setText]=useState(''),[status,setStatus]=useState('book.yaml を開いてください。'),[busy,setBusy]=useState(false),[measuring,setMeasuring]=useState(false),[size,setSize]=useState({width:100,height:75});
  const textarea=useRef(null),preview=useRef(null),generation=useRef(0),working=useRef(false);
  const dirty=!!file&&text!==file.text;
  const invalidate=()=>{generation.current++;preview.current?.replaceChildren();setMeasuring(false);};
  const confirmDiscard=()=>!dirty||window.confirm('未保存の変更を破棄しますか？');
  async function io(fn){if(working.current)return;working.current=true;setBusy(true);try{await fn();}catch(e){setStatus(String(e.message??e));}finally{working.current=false;setBusy(false);}}
  function open(){if(!confirmDiscard())return;void io(async()=>{const next=await unwrap(api.open());if(!next)return;invalidate();setBook(next);setFile(null);setText('');setStatus('原稿を選択してください。');});}
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
      const rev=String(job),fingerprint='desktop-poc-'+job;
      const section=book.sections.find(s=>s.id===file.id);
      if(!['page','continuous'].includes(section.startOn))throw Error('このセクションの開始面はプレビュー未対応です。');
      const prepared=prepareBrowserPreview({documentId:file.id,revision:rev,source:raw,startOn:section.startOn},rev,fingerprint,{width:Math.round(w*1000),height:Math.round(h*1000)},deps);
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
  return <><header><div><strong>BookCreator</strong><span> / Desktop PoC</span></div><div><button id="open" disabled={busy} onClick={open}>プロジェクトを開く</button><button id="save" disabled={busy||!dirty||!file?.editable} onClick={save}>原稿を保存</button></div></header>
    <main><aside><h2>{book?.title??'プロジェクト'}</h2><p className="muted">原稿構成</p>{book?.sections.map(s=><button key={s.id} data-section={s.id} className={file?.id===s.id?'selected':''} disabled={busy||!s.editable} onClick={()=>select(s.id)}><span>{s.id}</span><small>{s.path??s.type+'（未対応）'}</small></button>)}</aside>
    <section className="editor"><h2>BCM 原稿 {dirty&&<span className="dirty">● 未保存</span>}</h2><textarea id="source" ref={textarea} value={text} disabled={busy||!file} readOnly={!file?.editable} onChange={e=>edit(e.target.value)} spellCheck={false}/><p className="muted">原文を正本として保存。テーマ・書籍設定の変更は未対応。</p></section>
    <section className="paper"><h2>紙面プレビュー</h2><div className="controls"><label>本文幅 <input type="number" min="30" max="250" value={size.width} disabled={busy} onChange={e=>resize('width',e.target.value)}/></label><label>本文高 <input type="number" min="30" max="300" value={size.height} disabled={busy} onChange={e=>resize('height',e.target.value)}/></label><button id="preview-button" disabled={busy||measuring||!file} onClick={()=>void render()}>組版</button></div><div ref={preview} id="preview"/></section></main><footer id="status" role="status">{status}</footer></>;
}
createRoot(document.getElementById('root')).render(<App/>);
