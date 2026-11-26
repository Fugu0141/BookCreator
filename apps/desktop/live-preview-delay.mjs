// Coalesce confirmed edits without depending on React or the layout engine.
export function createLivePreviewDelay({delay=200,schedule=setTimeout,unschedule=clearTimeout}={}){
  let timer=null,version=0;
  function cancel(){
    version++;
    if(timer!==null){unschedule(timer);timer=null;}
  }
  return {
    cancel,
    request(run){
      cancel();
      const ticket=version;
      timer=schedule(()=>{
        if(ticket!==version)return;
        timer=null;run();
      },delay);
    }
  };
}
