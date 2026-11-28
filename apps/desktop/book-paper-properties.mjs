// Projection only: distinguish the user's saved intent from measured paper.
export function describeBookPaperProperties(candidate){
  if(!candidate?.selection||!candidate.current?.())return null;
  const {documentId,blockKey}=candidate.selection;
  const fragments=candidate.plan?.fragments?.filter(f=>f.origin.documentId===documentId&&f.origin.blockKey===blockKey)??[];
  if(fragments.length!==1)return null;
  const placement=fragments[0].placement,rect=placement?.rect,occupied=placement?.occupiedRect??rect;
  const {width,height}=candidate.options??{};
  if(!Number.isSafeInteger(placement?.page)||placement.page<0||!rect||!occupied||![rect.x,rect.y,rect.width,rect.height,occupied.width,occupied.height,width,height].every(Number.isSafeInteger)||width<=0||height<=0||rect.width<=0||rect.height<=0||occupied.width<=0||occupied.height<=0)return null;
  const saved=candidate.areaPrepared?.document.entries.find(e=>e.documentId===documentId&&e.persistentId===candidate.persistentId);
  const mode=saved?.bookFixed?'fixed':saved?.bookPreferred?'preferred':saved?.bookGroup?'group':'automatic';
  return {documentId,persistentId:candidate.persistentId,page:placement.page+1,x:rect.x,y:rect.y,width:rect.width,height:rect.height,occupiedWidth:occupied.width,occupiedHeight:occupied.height,bodyWidth:width,bodyHeight:height,mode,preference:placement.preference??null,savedWidth:saved?.minWidthPercent??null,savedHeight:saved?.minHeightPercent??null,before:saved?.spaceBefore??0,after:saved?.spaceAfter??0,preferred:saved?.bookPreferred??null,group:saved?.bookGroup??null};
}
