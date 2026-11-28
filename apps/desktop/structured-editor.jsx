import React,{useMemo,useRef,useState,useLayoutEffect} from 'react';
import {projectBlocks,planStructuredEdit} from './structured-blocks.mjs';
import {projectStructuredEditor} from './structured-projection.mjs';
import {FormulaPreview,FormulaTemplates,InlineMathTools} from './structured-math.jsx';
import {planStudyEdit} from './structured-study.mjs';
import {StudyEditor} from './structured-study-editor.jsx';
import {RichTextEditor} from './structured-rich-editor.jsx';
import {MixedParagraph} from './structured-mixed-editor.jsx';
import {planMixedEdit,mixedOrigin,planMixedRemoval,planMixedRange} from './structured-mixed.mjs';
import {richProjection} from './structured-rich-text.mjs';
import {planListDraft,listDraftRow,planListAction,splitListInput,canResizeList} from './structured-list.mjs';
import {planStructuredEquation} from './structured-equation.mjs';
import {canBlockOperation,insertionChoices,structuredInsertionOptions,studyInsertionSlots} from './structured-operations.mjs';

export function StructuredEditor({source,editable,blocked,draft,setDraft,onApply,onSource,scan,applyPatches,validateMath,parseInline,planFormat,mathFamily,onComposition,fontFamily,library,theme,history,onHistory,onOperation,onNumbering,onReference,onMixedReference,onRichReference,onMixedRemove,onMixedRange,referencePending,onStudyLinks,onListAction,onSplit}){
  const projection=useMemo(()=>projectStructuredEditor(source,scan,parseInline),[source,scan,parseInline]);
  const field=useRef(null),[formatError,setFormatError]=useState(''),[insertKind,setInsertKind]=useState('paragraph'),[deleteRequest,setDeleteRequest]=useState(null),[includeOptional,setIncludeOptional]=useState(false),[insertOpen,setInsertOpen]=useState(false),[insertTarget,setInsertTarget]=useState(null);
  const insertField=useRef(null),root=useRef(null),pendingFocus=useRef(null),previousDraft=useRef(null),insertOrigin=useRef(null);
  const [focusedRow,setFocusedRow]=useState(null);
  const primarySelector='[data-rich-edit],[data-mixed-edit],[data-list-edit],[data-equation-edit],[data-study-edit],[data-structured-edit],[data-structured-source]';
  function focusRow(row){
    const node=root.current?.querySelector('[data-structured-index="'+row.index+'"]');
    if(!node)return;
    const button=Array.from(node.querySelectorAll(primarySelector)).find(e=>!e.disabled&&e.getClientRects().length);
    (button??node).focus({preventScroll:true});node.scrollIntoView({block:'nearest',inline:'nearest'});
    setFocusedRow(row.index);
  }
  useLayoutEffect(()=>{
    const pending=pendingFocus.current,prior=previousDraft.current;
    if(draft){previousDraft.current=draft;setFocusedRow(null);return;}
    if(blocked)return;
    previousDraft.current=null;
    if(pending&&pending.source===source){
      pendingFocus.current=null;
      const row=projection.rows[pending.index];
      if(row)focusRow(row);
      return;
    }
    if(pending&&pending.source!==source)pendingFocus.current=null;
    if(prior){
      const row=projection.rows.find(r=>r.range.start===prior.row.range.start);
      if(row)focusRow(row);
    }
  },[source,!!draft,blocked,projection]);
  const choices=structuredInsertionOptions(library),selectedKind=choices.some(([kind])=>kind===insertKind)?insertKind:'paragraph';
  let slots=[],insertionError='';
  try{slots=studyInsertionSlots(selectedKind,theme);}catch(e){insertionError=String(e.message??e);}
  const canInsert=!insertionError;
  const targetIndex=insertTarget?.source===source&&canBlockOperation(source,projection.rows,insertTarget.index,'insert')?insertTarget.index:projection.rows.length;
  const category=selectedKind==='math'?'math':['paragraph','heading'].includes(selectedKind)?'text':'study';
  function selectKind(kind){setInsertKind(kind);setIncludeOptional(false);}
  function openInsertion(index=projection.rows.length,origin=null){
    insertOrigin.current=origin??root.current?.querySelector('#structured-insert-toggle')??null;
    setInsertTarget({source,index});setInsertOpen(true);requestAnimationFrame(()=>insertField.current?.focus());
  }
  function closeInsertion(restore=true){
    setInsertOpen(false);setInsertTarget(null);setIncludeOptional(false);
    if(restore)requestAnimationFrame(()=>{const node=insertOrigin.current;if(node?.isConnected&&node.getClientRects().length)node.focus({preventScroll:true});else root.current?.querySelector('#structured-insert-toggle')?.focus({preventScroll:true});});
  }
  function confirmInsertion(){
    if(!canOperate||!canInsert||!insertOpen)return;
    const next=onOperation({source,action:'insert',index:targetIndex,kind:selectedKind,includeOptional});
    if(typeof next!=='string'||next===source)return;
    pendingFocus.current={source:next,index:targetIndex};
    closeInsertion(false);
  }
  const canOperate=editable&&!blocked&&!draft&&!projection.diagnostics.length;
  const operate=(action,index)=>{setDeleteRequest(null);onOperation({source,action,index,kind:selectedKind,includeOptional});};
  function operations(row,index){return <details className="structured-block-menu"><summary>ブロック操作</summary><div className="structured-block-operations">{row.kind==='paragraph'&&<>{canBlockOperation(source,projection.rows,index,'split')&&<button type="button" data-paragraph-split disabled={!canOperate} onClick={()=>operate('split',index)}>最初の改行で段落を分割</button>}{canBlockOperation(source,projection.rows,index,'join')&&<button type="button" data-paragraph-join disabled={!canOperate} onClick={()=>operate('join',index)}>次の段落と結合</button>}{[["bullet","箇条書き"],["ordered","番号付き"]].map(([kind,label])=><button key={kind} type="button" data-list-convert={kind} disabled={!canOperate} onClick={()=>onListAction(source,row,{kind,action:"convert"})}>{label}に変換</button>)}</>}<button type="button" className="secondary-action" data-block-insert={index} disabled={!canOperate||!canBlockOperation(source,projection.rows,index,'insert')} onClick={e=>openInsertion(index,e.currentTarget)}>前に挿入…</button>{canBlockOperation(source,projection.rows,index,'duplicate')&&<button type="button" className="secondary-action" data-block-duplicate={index} disabled={!canOperate} onClick={()=>operate('duplicate',index)}>複製</button>}{['up','down'].map(action=><button key={action} type="button" className="secondary-action" data-block-move={action} aria-label={action==='up'?'上へ移動':'下へ移動'} disabled={!canOperate||!canBlockOperation(source,projection.rows,index,action)} onClick={()=>operate(action,index)}>{action==='up'?'↑':'↓'}</button>)}{canBlockOperation(source,projection.rows,index,'delete')&&<button type="button" className="secondary-action" data-block-delete={index} disabled={!canOperate} onClick={()=>setDeleteRequest({source,index})}>削除</button>}{deleteRequest?.source===source&&deleteRequest.index===index&&<span className="structured-delete-confirm">削除しますか？ <button type="button" id="structured-delete-confirm" disabled={!canOperate} onClick={()=>operate('delete',index)}>削除する</button><button type="button" className="secondary-action" onClick={()=>setDeleteRequest(null)}>取消</button></span>}</div></details>;}
  function format(kind){const node=field.current;if(!node||blocked||!draft||draft.inlineEdit)return;try{const p=planFormat(draft.value,node.selectionStart,node.selectionEnd,kind,scan);const value=applyPatches(draft.value,[p.patch]);setDraft(d=>({...d,value}));setFormatError('');requestAnimationFrame(()=>{if(field.current===node&&node.value===value){node.focus();node.setSelectionRange(p.selection.start,p.selection.end);}});}catch(e){setFormatError(String(e.message??e));}}
  const listOptions={scan,parseInline,applyPatches,project:projectBlocks},listComposing=useRef(false);
  let planned=null,error='',draftListRow=null;
  if(draft)try{
    if(draft.source!==source)throw Error('原稿が変更されました。取り消して開き直してください。');
    if(draft.richError)throw Error('文章入力の問題を解消してください。');
    if(draft.list)draftListRow=listDraftRow(source,draft,listOptions);
    planned=draft.mixed?planMixedEdit(source,draft,listOptions):draft.list?planListDraft(source,draft,listOptions):draft.equation?planStructuredEquation(source,draft.row,draft.value,{scan,applyPatches,validateMath}):draft.study?planStudyEdit(source,draft.study,draft.values,{scan,applyPatches}):planStructuredEdit(source,draft.row,draft.value,{scan,applyPatches,validateMath,parseInline,level:draft.level});
  }catch(e){error=String(e.message??e);}
  function focusList(section,index,caret=0){
    requestAnimationFrame(()=>{const node=section?.isConnected&&section.querySelector('[data-list-value="'+index+'"]');if(node){node.focus();node.setSelectionRange(caret,caret);}});
  }
  function listKey(e,i){
    if(blocked||!editable||!draft?.list||!draftListRow||draft.source!==source||listComposing.current||e.nativeEvent.isComposing||e.nativeEvent.keyCode===229||e.altKey||e.ctrlKey||e.metaKey)return;
    const field=e.currentTarget,section=field.closest('[data-structured-kind=list]'),value=draft.values[i];
    if(e.key==='Enter'&&!e.shiftKey&&canResizeList(draftListRow.list)&&draft.values.length<999){
      e.preventDefault();
      if(!value){if(i+1<draft.values.length)focusList(section,i+1);return;}
      const parts=splitListInput(value,field.selectionStart,field.selectionEnd,parseInline);
      if(!parts)return;
      setDraft(d=>({...d,values:[...d.values.slice(0,i),...parts,...d.values.slice(i+1)]}));focusList(section,i+1);return;
    }
    if(e.key==='Backspace'&&!e.shiftKey&&value===''&&draft.values.length>1&&canResizeList(draftListRow.list)){
      e.preventDefault();
      const previous=Math.max(0,i-1),caret=i?draft.values[i-1].length:0;
      setDraft(d=>({...d,values:d.values.filter((_,j)=>j!==i)}));focusList(section,previous,caret);return;
    }
    if(e.key==='Tab'&&planned!==null){
      try{
        const current=projectBlocks(planned,scan,parseInline).rows.find(r=>r.range.start===draftListRow.range.start),item=current?.list?.[i];
        if(!item||(e.shiftKey?item.depth!==1:item.depth!==0||i===0))return;
        const next=planListAction(planned,current,{action:e.shiftKey?'outdent':'indent',item:i},listOptions);
        if(next===planned)return;
        const updated=projectBlocks(next,scan,parseInline).rows.find(r=>r.range.start===current.range.start);
        if(!updated?.list||updated.list.length!==draft.values.length||updated.list.some((item,j)=>item.value!==draft.values[j]||item.depth!==(j===i?(e.shiftKey?0:1):current.list[j].depth)))return;
        const caret=field.selectionStart;
        e.preventDefault();setDraft(d=>({...d,listLayout:next}));focusList(section,i,caret);
      }catch{/* Unsupported indentation leaves normal Tab navigation intact. */}
    }
  }
  return <div id="structured-editor" ref={root} className="structured-editor" data-editing={!!draft} onKeyDown={e=>{if(e.key==='Escape'&&insertOpen&&!draft&&!blocked&&!e.nativeEvent.isComposing){e.preventDefault();closeInsertion();}}} style={{fontFamily}}><div className="structured-writing-header"><strong>原稿</strong><details className="structured-help"><summary>操作ガイド</summary><p className="muted">見出し・本文・数式・対応する教材部品を編集できます。複雑な記法はソース編集へ戻ります。構造編集は試作です。</p><p className="muted">本文・番号なし独立数式・対応する教材部品を上下に移動できます。関連する問題と解説の順序、見出し、未対応の構造は保護します。教材部品の複製・削除はできません。</p></details></div>{draft&&<p className="structured-focus-hint" role="status">編集中：{draft.row.label}。反映またはキャンセルして次のブロックへ進みます。</p>}
    {projection.diagnostics.length>0&&<p className="workspace-hint">原稿構造の診断があるため、直接編集は停止しています。ソースで修正してください。</p>}
    <div className="structured-operation-toolbar">
      <div className="structured-actions" aria-label="原稿の履歴"><button id="structured-undo" type="button" className="secondary-action" disabled={!canOperate||!history.undo} onClick={()=>onHistory('undo')}>元に戻す</button><button id="structured-redo" type="button" className="secondary-action" disabled={!canOperate||!history.redo} onClick={()=>onHistory('redo')}>やり直す</button></div>
      <button id="structured-insert-toggle" type="button" aria-expanded={insertOpen} aria-controls="structured-insert-panel" disabled={!canOperate} onClick={e=>insertOpen?closeInsertion():openInsertion(projection.rows.length,e.currentTarget)}>{insertOpen?'挿入を閉じる':'＋ 挿入'}</button>
    </div>
    <section id="structured-insert-panel" className="structured-insert-panel" hidden={!insertOpen||!!draft} aria-label="原稿に挿入">
      <div className="structured-insert-categories" role="group" aria-label="挿入の種類">{[['text','文章','paragraph'],['math','数式','math'],['study','教材部品','example']].map(([id,label,kind])=><button key={id} type="button" className="secondary-action" data-insert-category={id} aria-pressed={category===id} disabled={!canOperate} onClick={()=>selectKind(kind)}>{label}</button>)}</div>
      <div className="structured-insert-fields">
        <label>挿入する種類<select ref={insertField} id="structured-insert-kind" value={selectedKind} disabled={!canOperate} onChange={e=>selectKind(e.target.value)}><optgroup label="文章・数式">{insertionChoices.slice(0,3).map(([v,label])=><option key={v} value={v}>{label}</option>)}</optgroup><optgroup label="標準教材部品">{insertionChoices.slice(3).map(([v,label])=><option key={v} value={v}>{label}</option>)}</optgroup>{choices.length>insertionChoices.length&&<optgroup label="登録教材部品">{choices.slice(insertionChoices.length).map(([v,label])=><option key={v} value={v}>{label}</option>)}</optgroup>}</select></label>
        <label>挿入位置<select id="structured-insert-position" value={targetIndex} disabled={!canOperate} onChange={e=>setInsertTarget({source,index:Number(e.target.value)})}><option value={projection.rows.length}>原稿の末尾</option>{projection.rows.map((row,i)=>canBlockOperation(source,projection.rows,i,'insert')?<option key={row.index} value={i}>{i+1}. {row.label}の前</option>:null)}</select></label>
      </div>
      {slots.some(s=>s.optional)&&<label><input type="checkbox" id="structured-optional-slots" checked={includeOptional} disabled={!canOperate} onChange={e=>setIncludeOptional(e.target.checked)}/>任意の入力欄も追加</label>}
      {insertionError&&<p className="structured-error" role="alert">{insertionError}</p>}{slots.length>0&&<p className="muted" id="structured-insertion-fields">入力欄：本文{slots.filter(s=>!s.optional||includeOptional).map(s=>' / '+s.name).join('')}</p>}
      <div className="structured-actions structured-insert-confirm"><button id="structured-append" type="button" disabled={!canOperate||!canInsert||!insertOpen} onClick={confirmInsertion}>{targetIndex===projection.rows.length?'末尾に挿入':'選択位置に挿入'}</button><button id="structured-insert-cancel" type="button" className="secondary-action" disabled={!canOperate} onClick={()=>closeInsertion()}>閉じる</button></div>
    </section><div className="structured-blocks">{projection.rows.map((row,index)=>{
      const active=draft?.row.index===row.index;
      const shownList=active&&draftListRow?draftListRow.list:row.list;
      const rich= row.payload!==null&&['heading','paragraph'].includes(row.kind)&&!!richProjection(row.payload,parseInline);
      const primary=!!row.mixed||rich;
      if(row.list)return <section key={row.index} className="structured-block" tabIndex={-1} data-focused={focusedRow===row.index} data-active={active} data-structured-kind="list" data-structured-index={row.index}><div className="structured-block-heading"><strong>リスト</strong>{!active&&<div className="structured-actions"><button type="button" data-list-edit disabled={!canOperate} onClick={()=>setDraft({source,row,list:true,values:row.list.map(i=>i.value)})}>項目を編集</button><button type="button" className="secondary-action" data-structured-source={row.index} disabled={blocked||!!draft} onClick={()=>onSource(row.range)}>ソースで開く</button></div>}</div>{(active&&canResizeList(shownList)?draft.values.map((value,i)=>({...shownList[0],number:i+1,value})):shownList).map((item,i)=><div key={i} className="structured-list-item" data-list-item={i} data-depth={item.depth} style={{marginInlineStart:item.depth*20}}><span className="structured-list-marker">{item.kind==='ordered'?item.number+'.':'•'}</span>{active?<label className="structured-list-field"><span className="sr-only">項目 {i+1}</span><input data-list-value={i} value={draft.values[i]} onKeyDown={e=>listKey(e,i)} onCompositionStart={()=>{listComposing.current=true;onComposition(true);}} onCompositionEnd={()=>{listComposing.current=false;onComposition(false);}} onChange={e=>setDraft(d=>({...d,values:d.values.map((v,j)=>i===j?e.target.value:v)}))}/></label>:<div className="structured-list-body"><InlineText parsed={item.parsed} family={mathFamily}/></div>}{active&&canResizeList(shownList)&&<div className="structured-actions"><button type="button" className="secondary-action" data-list-add={i} disabled={blocked||!editable||draft.values.length>=999} onClick={()=>setDraft(d=>({...d,values:[...d.values.slice(0,i+1),'',...d.values.slice(i+1)]}))}>後に追加</button><button type="button" className="secondary-action" data-list-remove={i} disabled={blocked||!editable||draft.values.length<=1} onClick={()=>setDraft(d=>({...d,values:d.values.filter((_,j)=>j!==i)}))}>項目を削除</button></div>}{!active&&<details className="structured-list-item-menu"><summary>階層</summary><div className="structured-actions"><button type="button" data-list-indent={i} disabled={!canOperate||item.depth!==0||i===0} onClick={()=>onListAction(source,row,{action:'indent',item:i})}>階層を下げる</button><button type="button" data-list-outdent={i} disabled={!canOperate||item.depth!==1} onClick={()=>onListAction(source,row,{action:'outdent',item:i})}>階層を上げる</button></div></details>}</div>)}{active?<>{canResizeList(shownList)?<p className="muted">Enterで項目追加・平文分割、空欄でBackspaceすると削除。反映するまで原稿は変更されません。</p>:<p className="muted">階層や番号形式を維持するため、このリストでは項目数の変更はソース編集で行ってください。</p>}<p className="muted">Tab / Shift+Tabで階層変更（変更できない場合は通常のフォーカス移動）。先頭項目からShift+Tabで前の操作へ移動できます。</p>{error&&<p className="structured-error" role="alert">{error}</p>}<div className="structured-actions"><button type="button" id="structured-list-apply" disabled={blocked||!editable||planned===null||planned===source} onClick={()=>onApply(draft,planned)}>反映</button><button type="button" id="structured-list-cancel" className="secondary-action" disabled={blocked} onClick={()=>setDraft(null)}>キャンセル</button></div></>:<><details className="structured-block-menu"><summary>リスト形式</summary><div className="structured-actions">{[['bullet','箇条書き'],['ordered','番号付き']].map(([kind,label])=><button type="button" key={kind} data-list-convert={kind} disabled={!canOperate||row.list.some(i=>i.depth!==0)} onClick={()=>onListAction(source,row,{action:'convert',kind})}>{label}（同形式なら解除）</button>)}</div></details>{operations(row,index)}</>}</section>;
      if(row.equation)return <section key={row.index} className="structured-block" tabIndex={-1} data-focused={focusedRow===row.index} data-active={active} data-structured-kind="directive" data-structured-index={row.index} data-equation-wrapper={row.equation.equationId??''}><div className="structured-block-heading"><strong>独立数式（{row.equation.numbered?'採番あり':'採番なし'}）</strong>{!active&&<div className="structured-actions"><button type="button" data-equation-edit disabled={!editable||blocked||!!draft} onClick={()=>setDraft({source,row,equation:true,value:row.equation.value})}>数式を編集</button><button type="button" data-structured-numbering disabled={!canOperate} onClick={()=>onNumbering(source,row)}>{row.equation.numbered?'採番を解除':'採番する'}</button><button type="button" className="secondary-action" data-structured-source={row.index} disabled={blocked||!!draft} onClick={()=>onSource(row.range)}>ソースで開く</button></div>}</div>{row.equation.equationId&&<p className="muted">ID: {row.equation.equationId}（番号は全冊組版で確定）</p>}{active?<><FormulaTemplates display blocked={blocked} onPick={value=>setDraft(d=>({...d,value}))}/><FormulaPreview formula={draft.value} display family={mathFamily}/><label>数式<textarea id="structured-value" autoFocus rows={4} value={draft.value} onCompositionStart={()=>onComposition(true)} onCompositionEnd={()=>onComposition(false)} onChange={e=>setDraft(d=>({...d,value:e.target.value}))}/></label>{error&&<p role="alert" className="structured-error">{error}</p>}<div className="structured-actions"><button id="structured-apply" type="button" disabled={blocked||!editable||planned===null||planned===source} onClick={()=>onApply(draft,planned)}>反映</button><button id="structured-cancel" type="button" className="secondary-action" disabled={blocked} onClick={()=>setDraft(null)}>キャンセル</button></div></>:<><FormulaPreview formula={row.equation.value} display family={mathFamily}/><details><summary>原文を確認</summary><pre className="structured-content">{row.raw}</pre></details>{operations(row,index)}</>}</section>;
      if(row.study)return <section key={row.index} className="structured-block" tabIndex={-1} data-focused={focusedRow===row.index} data-active={active} data-structured-kind="study" data-structured-index={row.index}><StudyEditor study={row.study} library={library} active={active} draft={draft} blocked={blocked} editable={editable} otherDraft={!!draft&&!active} onEdit={()=>setDraft({source,row,study:row.study,values:row.study.fields.map(f=>f.value)})} onSource={()=>onSource(row.range)} onLinks={()=>onStudyLinks(source,row)} onChange={(i,value)=>setDraft(d=>({...d,values:d.values.map((old,j)=>j===i?value:old)}))} onApply={()=>onApply(draft,planned)} onCancel={()=>setDraft(null)} onComposition={onComposition} error={error} planned={planned} source={source} mathFamily={mathFamily}/>{!active&&operations(row,index)}</section>;
      return <section key={row.index} className="structured-block" tabIndex={-1} data-focused={focusedRow===row.index} data-active={active} data-structured-kind={row.kind} data-structured-index={row.index}><div className="structured-block-heading"><strong>{row.label}</strong>{!active&&<div className="structured-actions">{row.mixed&&<button type="button" data-mixed-edit={row.index} disabled={!canOperate} onClick={()=>setDraft({source,row,mixed:true,values:row.mixed.parts.filter(p=>p.kind==='text').map(p=>p.value)})}>文章編集</button>}{rich&&!row.mixed&&<button type="button" data-rich-edit={row.index} disabled={!editable||blocked||!!draft} onClick={()=>{setFormatError('');setDraft({source,row,value:row.payload,level:row.level,rich:true});}}>文章編集</button>}{!primary&&row.payload!==null&&<button type="button" data-structured-edit={row.index} disabled={!editable||blocked||!!draft} onClick={()=>{setFormatError('');setDraft({source,row,value:row.payload,level:row.level});}}>{row.kind==='math'?'数式を編集':'記法編集'}</button>}{!primary&&row.payload===null&&<button type="button" className="secondary-action" data-structured-source={row.index} disabled={blocked||!!draft} onClick={()=>onSource(row.range)}>ソースで開く</button>}{(primary||row.payload!==null)&&<details className="structured-more-actions"><summary>その他</summary><div className="structured-actions">{primary&&row.payload!==null&&<button type="button" className="secondary-action" data-structured-edit={row.index} disabled={!editable||blocked||!!draft} onClick={()=>{setFormatError('');setDraft({source,row,value:row.payload,level:row.level});}}>記法編集</button>}<button type="button" className="secondary-action" data-structured-source={row.index} disabled={blocked||!!draft} onClick={()=>onSource(row.range)}>ソースで開く</button>{row.kind==='math'&&row.payload!==null&&<button type="button" data-structured-numbering disabled={!canOperate} onClick={()=>onNumbering(source,row)}>採番する</button>}</div></details>}</div>}</div>
      {active?<>{row.kind==='heading'&&<label>見出しレベル<select id="structured-heading-level" disabled={blocked} value={draft.level} onChange={e=>setDraft(d=>({...d,level:Number(e.target.value)}))}>{[1,2,3,4,5,6].map(level=><option key={level} value={level}>H{level}</option>)}</select></label>}{draft.mixed?<MixedParagraph mixed={mixedOrigin(row,draft)} draft={draft} setDraft={setDraft} blocked={blocked} onComposition={onComposition} family={mathFamily} validateDraft={next=>planMixedEdit(source,next,listOptions)} onReference={onMixedReference} onRemove={onMixedRemove} validateRemove={(current,request)=>planMixedRemoval(source,current,request,listOptions)} onRange={onMixedRange} validateRange={(current,request)=>planMixedRange(source,current,request,listOptions)}/>:draft.rich?<RichTextEditor draft={draft} setDraft={setDraft} blocked={blocked} parseInline={parseInline} planFormat={planFormat} scan={scan} applyPatches={applyPatches} onComposition={onComposition} renderPreview={parsed=><InlineText parsed={parsed} family={mathFamily}/>} validateMixed={next=>planMixedEdit(source,next,listOptions)} family={mathFamily} onReference={onRichReference} onSplit={row.kind==='paragraph'?(start,end)=>onSplit(draft,start,end):undefined}/>:<>{row.kind!=='math'&&<div className="structured-actions" role="toolbar" aria-label="文字書式">{[['bold','太字'],['italic','斜体'],['underline','下線']].map(([kind,label])=><button key={kind} type="button" data-structured-format={kind} disabled={blocked||!!draft.inlineEdit} onMouseDown={e=>e.preventDefault()} onClick={()=>format(kind)}>{label}</button>)}</div>}{row.kind==='math'&&<><FormulaTemplates display blocked={blocked} onPick={value=>setDraft(d=>({...d,value}))}/><FormulaPreview formula={draft.value} display family={mathFamily}/></>}{row.kind==='paragraph'&&<InlineMathTools draft={draft} setDraft={setDraft} parseInline={parseInline} blocked={blocked} family={mathFamily} onComposition={onComposition}/>}<label>内容<textarea disabled={!!draft.inlineEdit||referencePending} ref={field} id="structured-value" autoFocus rows={row.kind==='heading'?2:4} value={draft.value} onCompositionStart={()=>onComposition(true)} onCompositionEnd={()=>onComposition(false)} onChange={e=>{setFormatError('');setDraft(d=>({...d,value:e.target.value}));}}/></label>{row.kind==='paragraph'&&<button id="structured-reference-open" type="button" className="secondary-action" disabled={blocked||referencePending||!!draft.inlineEdit||draft.value!==row.payload} onClick={()=>{const node=field.current;if(node)onReference(draft,node.selectionStart,node.selectionEnd);}}>カーソル位置に数式参照を挿入</button>}{formatError&&<p role="alert" className="structured-error">書式変更不可：{formatError}</p>}</>}{error&&<p className="structured-error" role="alert">{error}</p>}<div className="structured-actions"><button type="button" id="structured-apply" disabled={blocked||referencePending||!!draft.inlineEdit||!!draft.richError||!editable||planned===null||planned===source} onClick={()=>onApply(draft,planned)}>反映</button><button type="button" id="structured-cancel" className="secondary-action" disabled={blocked||referencePending} onClick={()=>setDraft(null)}>キャンセル</button></div></>:<div className={'structured-content '+(row.kind==='heading'?'structured-heading-text':'')}>{row.mixed?<MixedParagraph mixed={row.mixed} family={mathFamily}/>:row.payload!==null?(row.inline?<InlineText parsed={row.inline} family={mathFamily}/>:row.kind==='math'?<FormulaPreview formula={row.payload} display family={mathFamily}/>:row.payload):<>{row.raw.includes(':ref{')&&<p className="muted">数式参照を含む内容です。番号は紙面で確認し、追加編集はソースで行ってください。</p>}<pre>{row.raw}</pre></>}</div>}{!active&&operations(row,index)}
      </section>;
    })}</div>
  </div>;
}

function InlineText({parsed,family}){
  const parts=[];let cursor=0;
  const ranges=[...parsed.inlineStyles.map(run=>({...run,kind:'style'})),...parsed.inlineMath.map(atom=>({...atom,end:atom.start+1,kind:'math'}))].sort((a,b)=>a.start-b.start);
  for(const run of ranges){
    if(cursor<run.start)parts.push(parsed.text.slice(cursor,run.start));
    if(run.kind==='math')parts.push(<FormulaPreview key={run.start} formula={run.formula} family={family}/>);
    else parts.push(<span key={run.start} style={{fontWeight:run.fontWeight,fontStyle:run.italic?'italic':undefined,textDecoration:run.underline?'underline':undefined,color:run.color,fontFamily:run.fontFamily,fontSize:run.fontSize?run.fontSize*96/25400+'px':undefined,verticalAlign:run.baseline==='super'?'super':run.baseline==='sub'?'sub':undefined}}>{parsed.text.slice(run.start,run.end)}</span>);
    cursor=run.end;
  }
  parts.push(parsed.text.slice(cursor));return <>{parts}</>;
}
