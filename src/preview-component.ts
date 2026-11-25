// Experimental shared heading component compiler. No raw HTML/CSS or arbitrary resources.
export interface HeadingDesign {
  schemaVersion:1;
  fontSize:number; lineHeight:number;
  direction:'row'|'column'; gap:number; padding:number; background:string; textColor:string;
  children:({id:string;type:'content'}|{id:string;type:'rect';width:number|'fill';height:number;color:string})[];
}
const record=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const exact=(x:Record<string,unknown>,keys:string[])=>Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const len=(x:unknown,min=0,max=100000):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=min&&x<=max;
const color=(x:unknown):x is string=>typeof x==='string'&&/^#[0-9a-fA-F]{6}$/.test(x);
export function validateHeadingDesign(value:unknown):HeadingDesign{
  const fail=()=>{throw RangeError('Invalid experimental heading component');};
  if(!record(value)||!exact(value,['schemaVersion','fontSize','lineHeight','direction','gap','padding','background','textColor','children'])||value.schemaVersion!==1||!len(value.fontSize,2000,30000)||typeof value.lineHeight!=='number'||!Number.isFinite(value.lineHeight)||value.lineHeight<1.25||value.lineHeight>4||!['row','column'].includes(String(value.direction))||!len(value.gap)||!len(value.padding)||!color(value.background)||!color(value.textColor)||!Array.isArray(value.children)||value.children.length<1||value.children.length>8)throw fail();
  const ids=new Set<string>();let slots=0;
  for(const child of value.children){
    if(!record(child)||typeof child.id!=='string'||!/^[-A-Za-z0-9_]{1,64}$/.test(child.id)||child.id==='root'||ids.has(child.id))throw fail();
    ids.add(child.id);
    if(child.type==='content'&&exact(child,['id','type'])){slots++;continue;}
    if(child.type!=='rect'||!exact(child,['id','type','width','height','color'])||!color(child.color)||!len(child.height,1)||!(child.width==='fill'?value.direction==='column':len(child.width,1)))throw fail();
  }
  if(slots!==1)throw fail();
  return structuredClone(value) as unknown as HeadingDesign;
}
export function defaultHeadingDesign():HeadingDesign{return {schemaVersion:1,fontSize:6500,lineHeight:1.8,direction:'row',gap:3000,padding:2000,background:'#ffffff',textColor:'#222222',children:[{id:'bar',type:'rect',width:2000,height:16000,color:'#315b86'},{id:'content',type:'content'}]};}
export function compileHeadingDesign(value:HeadingDesign){
  const {schemaVersion:_,fontSize,lineHeight,...component}=validateHeadingDesign(value);
  return {fontSize,lineHeight,component};
}
