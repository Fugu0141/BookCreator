// A provisional visual layer must never become the committed paper or alter
// the page list, geometry, source mappings, or sparse snapshot ownership.
export function createProvisionalPaper(){
  let active=null;
  function clear(session=active){
    if(!session||session!==active)return;
    active=null;
    for(const layer of session.layers.values())layer.remove();
    session.layers.clear();
    delete session.host.dataset.provisionalPages;
  }
  function begin({viewport,host,current,owns}){
    clear();
    const session={host,layers:new Map()};
    active=session;
    const valid=()=>active===session&&current()&&owns()&&host.parentNode===viewport&&host.inert===true&&!viewport.closest('[hidden]');
    return {
      show({index,pageCount,element}){
        if(!valid()||!Number.isSafeInteger(index)||index<0||!element||element.isConnected)return false;
        const pages=Array.from(host.shadowRoot?.children??[]);
        // An old page is a safe visual anchor only if its dimensions and
        // the complete page count still agree. Otherwise wait for final commit.
        const page=pages[index];
        if(pages.length!==pageCount||page?.dataset.page!==String(index)||element.dataset.page!==String(index)||
          page.style.width!==element.style.width||page.style.height!==element.style.height||
          page.dataset.side!==element.dataset.side)return false;
        const layer=host.ownerDocument.createElement('div');
        layer.dataset.provisionalLayer='true';
        layer.inert=true;layer.setAttribute('aria-hidden','true');
        layer.style.cssText='all:initial;display:block;position:absolute;inset:0;z-index:1;overflow:hidden;pointer-events:none;';
        const root=layer.attachShadow({mode:'closed'});
        element.inert=true;
        Object.assign(element.style,{margin:'0',border:'0',position:'relative'});
        const oldGuide=page.querySelector('[data-content-guide]'),newGuide=element.querySelector('[data-content-guide]');
        if(oldGuide&&newGuide)newGuide.style.visibility=oldGuide.style.visibility;
        root.append(element);
        session.layers.get(index)?.remove();
        page.append(layer);
        session.layers.set(index,layer);
        host.dataset.provisionalPages=String(session.layers.size);
        return true;
      },
      clear:()=>clear(session)
    };
  }
  return {begin,clear};
}
