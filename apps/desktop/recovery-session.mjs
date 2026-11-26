// One renderer-side session, tied to a main-process read token.
// Coalesce changes without resetting the timer on every keystroke.
export function recoverySession(file,send,report,delay=750){
  const info=file.recovery;
  if(!info)return null;
  let version=info.candidate?.version??null,baseRevision=file.revision,savedText=file.text;
  let currentText=info.candidate?.text??savedText,unresolved=!!info.candidate;
  let timer=null,tail=Promise.resolve(),paused=false,closed=false;
  function enqueue(fn){const result=tail.then(fn);tail=result.catch(()=>{});return result;}
  async function request(action,text){
    return send({id:file.id,token:info.token,baseRevision,version,action,...(action==='put'?{text}:{})});
  }
  async function checkpoint(){
    const value=currentText;
    if(value===savedText){
      if(version!==null){await request('remove');version=null;}
      report('idle');return;
    }
    const stored=await request('put',value);version=stored.version;report('recorded');
  }
  function schedule(){
    if(closed||paused||unresolved||timer!==null)return;
    timer=setTimeout(()=>{
      timer=null;
      if(closed||paused||unresolved)return;
      void enqueue(checkpoint).catch(e=>report('error',String(e.message??e)));
    },delay);
  }
  function stopTimer(){if(timer!==null){clearTimeout(timer);timer=null;}}
  return {
    update(value){if(closed||unresolved)return;currentText=value;report(value===savedText?'idle':'pending');schedule();},
    restore(){unresolved=false;currentText=info.candidate.text;report('recorded');return currentText;},
    async discardCandidate(){await enqueue(async()=>{await request('remove');version=null;unresolved=false;currentText=savedText;report('idle');});},
    async pause(){paused=true;stopTimer();await tail;},
    resume(value){if(closed||unresolved)return;paused=false;currentText=value;schedule();},
    async discard(){if(unresolved)return;await enqueue(async()=>{if(version!==null){await request('remove');version=null;}report('idle');});},
    async saved(revision,value){
      baseRevision=revision;savedText=value;currentText=value;
      await enqueue(async()=>{if(version!==null){await request('remove');version=null;}report('idle');});
    },
    close(){closed=true;stopTimer();}
  };
}
