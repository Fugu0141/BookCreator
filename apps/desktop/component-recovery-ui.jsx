import React,{useEffect,useRef,useState} from 'react';
import {settingsDraftSession} from './settings-draft-session.mjs';

// Mounted for one lab/editor identity. The working design remains local until
// the existing explicit apply/register action succeeds.
export function useComponentRecovery({recovery,revision,value}){
  const controller=useRef(null),baseline=useRef(JSON.stringify(value)),current=useRef(value);
  current.current=value;
  const [candidate,setCandidate]=useState(null),[phase,setPhase]=useState(recovery?'loading':'idle'),[message,setMessage]=useState(''),[working,setWorking]=useState(false),[installed,setInstalled]=useState(false);
  const identity=JSON.stringify(recovery?.target??null),token=recovery?.token;
  const config=useRef(recovery);config.current=recovery;
  const encoded=JSON.stringify(value);
  useEffect(()=>{
    let disposed=false,session;
    baseline.current=JSON.stringify(current.current);
    setCandidate(null);setInstalled(false);setMessage('');
    if(!config.current){setPhase('idle');return;}
    const connection=config.current;
    const send=request=>connection.send({...request,token:connection.token,target:connection.target});
    setPhase('loading');
    void (async()=>{
      try{
        const info=await send({action:'inspect'});
        if(disposed)return;
        if(info.error||!info.available)throw Error(info.error??'部品の復旧対象を確認できません。');
        session=settingsDraftSession({...info,saved:current.current},send,(next,error='')=>{
          if(!disposed){setPhase(next);setMessage(error);}
        });
        controller.current=session;
        setCandidate(info.candidate);setPhase(info.candidate?'candidate':'idle');setInstalled(true);
      }catch(e){if(!disposed){setPhase('error');setMessage(String(e.message??e));}}
    })();
    return ()=>{disposed=true;session?.close();if(controller.current===session)controller.current=null;};
  },[identity,token]);
  useEffect(()=>{
    if(installed&&!candidate)controller.current?.update({revision,value:JSON.parse(encoded),dirty:encoded!==baseline.current});
  },[installed,candidate,revision,encoded]);

  async function resolve(action,onRestore){
    if(working||!candidate||!controller.current)return;
    setWorking(true);
    try{
      const restored=await controller.current.resolve(action,revision);
      if(action==='restore')onRestore(restored);
      setCandidate(null);
    }catch(e){setPhase('error');setMessage(String(e.message??e));}
    finally{setWorking(false);}
  }
  async function cancel(close){
    if(working||phase==='loading')return;
    setWorking(true);
    try{
      await controller.current?.pause();
      // An unresolved candidate belongs to an earlier editing session.
      // Closing the lab does not count as a decision to discard that candidate.
      await controller.current?.discard();
      close();
    }catch(e){setPhase('error');setMessage(String(e.message??e));controller.current?.resume();}
    finally{setWorking(false);}
  }
  async function commit(run,settle=true){
    if(working||candidate||phase==='loading')return;
    const active=controller.current,snapshot=structuredClone(current.current);
    setWorking(true);
    try{
      await active?.pause();
      // Parent invokes afterSave only AFTER successful ordinary persistence.
      await run(async savedRevision=>{
        if(!settle)return;
        baseline.current=JSON.stringify(snapshot);
        try{await active?.saved({revision:savedRevision,value:snapshot,dirty:false});}
        catch(e){
          active?.close();controller.current=null;
          setPhase('error');setMessage('部品は保存済みですが復旧記録を整理できません：'+String(e.message??e));
        }
      });
    }catch(e){setPhase('error');setMessage(String(e.message??e));}
    finally{active?.resume();setWorking(false);}
  }
  return {candidate,phase,message,working,blocked:working||phase==='loading'||!!candidate,resolve,cancel,commit};
}

export function ComponentRecoveryNotice({state,revision,onRestore,onClose,parentBusy}){
  const {candidate,phase,message,working}=state;
  if(candidate){
    const canRestore=candidate.status==='recoverable'&&candidate.baseRevision===revision;
    return <div className="lab-recovery-notice" role="region" aria-label="部品の復旧候補">
      <strong>未保存の部品作業案があります</strong>
      <p>{candidate.value?.name||'無題の部品'} ／ {new Date(candidate.updatedAt).toLocaleString('ja-JP')}</p>
      <p>{canRestore?'作業案へ復旧し、実測プレビューで確認してください。登録済み部品は変更しません。':'テーマまたは対象部品が変更されています。自動復旧できません。'}</p>
      {message&&<p role="alert">{message}</p>}
      <div className="lab-row"><button id="component-recovery-later" disabled={parentBusy||working} onClick={()=>void state.cancel(onClose)}>保持して閉じる</button><button id="component-recovery-discard" disabled={parentBusy||working} onClick={()=>void state.resolve('discard',onRestore)}>復旧候補を破棄</button>{canRestore&&<button id="component-recovery-restore" disabled={parentBusy||working} onClick={()=>void state.resolve('restore',onRestore)}>作業案へ復旧</button>}</div>
    </div>;
  }
  if(phase==='idle')return null;
  return <div id="component-recovery-state" className="lab-recovery-status" data-phase={phase} role="status" title={message}>{phase==='loading'?'復旧記録を確認中…':phase==='recorded'?'作業案の復旧記録済み':phase==='error'?'復旧記録エラー：'+message:'復旧記録待ち'}</div>;
}
