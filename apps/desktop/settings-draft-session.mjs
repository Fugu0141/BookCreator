// Ordered renderer controller. The service validates all settings again.
export function settingsDraftSession(info,send,report,delay=750){
  let version=info.candidate?.version??null,unresolved=!!info.candidate;
  let latest={revision:info.baseRevision,value:info.saved,dirty:false};
  let timer=null,tail=Promise.resolve(),paused=false,closed=false;
  const stop=()=>{if(timer!==null){clearTimeout(timer);timer=null;}};
  function enqueue(fn){const result=tail.then(fn);tail=result.catch(()=>{});return result;}
  async function remove(){if(version!==null){await send({action:'remove',version});version=null;}}
  async function checkpoint(){
    if(closed||unresolved)return;
    const snapshot=latest;
    if(!snapshot.dirty){await remove();report(latest===snapshot?'idle':'pending');return;}
    const record=await send({action:'put',baseRevision:snapshot.revision,value:snapshot.value,version});
    version=record.version;report(latest===snapshot?'recorded':'pending');
  }
  function schedule(){
    if(closed||unresolved||paused||timer!==null)return;
    timer=setTimeout(()=>{timer=null;if(closed||paused||unresolved)return;void enqueue(checkpoint).catch(e=>report('error',String(e.message??e)));},delay);
  }
  return {
    update(snapshot){latest=snapshot;if(unresolved||closed)return;report(snapshot.dirty?'pending':'idle');schedule();},
    async pause(){paused=true;stop();await tail;},
    resume(){paused=false;schedule();},
    async discard(){if(!unresolved)await enqueue(async()=>{await remove();report('idle');});},
    async saved(snapshot){latest=snapshot;await enqueue(async()=>{await remove();report('idle');});},
    async resolve(action,revision){
      return enqueue(async()=>{
        const fresh=await send({action:'inspect'});
        if(fresh.error)throw Error(fresh.error);
        if(!fresh.candidate||fresh.candidate.version!==version)throw Error('復旧候補が変更されました。書籍を開き直してください。');
        if(action==='restore'){
          if(fresh.candidate.status!=='recoverable'||fresh.baseRevision!==revision)throw Error('保存済み設定が変更されています。復旧候補を自動適用できません。');
          unresolved=false;report('recorded');return fresh.candidate.value;
        }
        if(action!=='discard')throw Error('Invalid recovery choice');
        await remove();unresolved=false;report('idle');return null;
      });
    },
    close(){closed=true;stop();}
  };
}
