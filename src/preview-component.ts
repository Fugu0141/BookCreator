import type {PreviewTextStyle,PreviewFontFamily} from './preview-typography.js';
// Persist stable resource IDs, not browser CSS identifiers.
export interface ComponentFont {id:string;weight:number}
export interface FixedLabel {x?:number;y?:number;id:string;type:'label';width:number|'fill';text:string;fontSize:number;lineHeight:number;color:string;font?:ComponentFont}
export type HeadingChild=({id:string;type:'content';width?:number}|{id:string;type:'rect';width:number|'fill';height:number;color:string}|FixedLabel|{id:string;type:'image';width:number|'fill';height:number;assetId:string;fit:'contain'|'cover';alt:string}|{id:string;type:'group';width:number|'fill';direction:'row'|'column'|'canvas';height?:number;gap:number;padding:number;background:string;children:HeadingChild[]}) & {x?:number;y?:number};
export interface HeadingDesign {
  schemaVersion:1;
  fontSize:number; lineHeight:number; font?:ComponentFont;
  direction:'row'|'column'; gap:number; padding:number; background:string; textColor:string;
  children:HeadingChild[];
}
export type HeadingLevel='1'|'2'|'3'|'4'|'5'|'6';
export type HeadingLevels=Partial<Record<HeadingLevel,HeadingDesign>>;
const record=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const exact=(x:Record<string,unknown>,keys:string[],optional:string[]=[])=>keys.every(k=>Object.hasOwn(x,k))&&Object.keys(x).every(k=>keys.includes(k)||optional.includes(k));
const len=(x:unknown,min=0,max=100000):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=min&&x<=max;
const color=(x:unknown):x is string=>typeof x==='string'&&/^#[0-9a-fA-F]{6}$/.test(x);
const line=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&x>=1.25&&x<=4;
const builtin:Readonly<Record<string,PreviewFontFamily>>=Object.freeze({'noto-sans-jp':'BCFont_NotoSansJP','system-serif':'serif','system-sans':'sans-serif','system-monospace':'monospace'});
function validateFont(v:unknown){
  if(!record(v)||!exact(v,['id','weight'])||typeof v.id!=='string'||!(Object.hasOwn(builtin,v.id)||/^font-[a-f0-9]{64}$/.test(v.id))||!len(v.weight,100,900))throw RangeError('Invalid component font ID or weight');
}
export function validateHeadingDesign(value:unknown):HeadingDesign{
  const fail=()=>{throw RangeError('Invalid experimental heading component');};
  if(!record(value)||!exact(value,['schemaVersion','fontSize','lineHeight','direction','gap','padding','background','textColor','children'],['font'])||value.schemaVersion!==1||!len(value.fontSize,2000,30000)||!line(value.lineHeight)||!['row','column'].includes(String(value.direction))||!len(value.gap)||!len(value.padding)||!color(value.background)||!color(value.textColor)||!Array.isArray(value.children)||value.children.length<1||value.children.length>8)throw fail();
  if(Object.hasOwn(value,'font'))validateFont(value.font);
  const ids=new Set<string>();let slots=0,count=0;
  function visit(children:unknown[],depth:number,canvas=false){
  if(depth>4||children.length<1||children.length>8)throw fail();
  for(const child of children){
    if(++count>32)throw fail();
    if(!record(child)||typeof child.id!=='string'||!/^[-A-Za-z0-9_]{1,64}$/.test(child.id)||child.id==='root'||ids.has(child.id))throw fail();
    ids.add(child.id);
    const pos=canvas?['x','y']:[];
    if(canvas&&(!len(child.x)||!len(child.y)||!len(child.width,1)))throw fail();
    if(child.type==='content'&&exact(child,['id','type',...pos,...(canvas?['width']:[])])){slots++;continue;}
    if(!(child.width==='fill'||len(child.width,1)))throw fail();
    if(child.type==='group'&&exact(child,['id','type','width','direction','gap','padding','background','children',...pos,...(child.direction==='canvas'?['height']:[])])&&['row','column','canvas'].includes(String(child.direction))&&len(child.gap)&&len(child.padding)&&color(child.background)&&Array.isArray(child.children)){if(child.direction==='canvas'&&(!len(child.height,1)||child.height<=2*child.padding||child.gap!==0))throw fail();visit(child.children,depth+1,child.direction==='canvas');continue;}
    if(child.type==='image'&&exact(child,['id','type','width','height','assetId','fit','alt',...pos])&&len(child.height,1)&&typeof child.assetId==='string'&&/^[a-f0-9]{64}$/.test(child.assetId)&&['contain','cover'].includes(String(child.fit))&&typeof child.alt==='string'&&child.alt.length<=256&&!/[\p{Cc}\p{Cs}]/u.test(child.alt))continue;
    if(!color(child.color))throw fail();
    if(child.type==='rect'&&exact(child,['id','type','width','height','color',...pos])&&len(child.height,1))continue;
    if(child.type==='label'&&exact(child,['id','type','width','text','fontSize','lineHeight','color',...pos],['font'])&&typeof child.text==='string'&&child.text.length>=1&&child.text.length<=256&&!/[\p{Cc}\p{Cs}\p{Cf}\p{Zl}\p{Zp}]/u.test(child.text)&&len(child.fontSize,2000,30000)&&line(child.lineHeight)){
      if(Object.hasOwn(child,'font'))validateFont(child.font);continue;
    }
    throw fail();
  }
  }
  visit(value.children,0);
  if(slots!==1)throw fail();
  return structuredClone(value) as unknown as HeadingDesign;
}
export function validateHeadingLevels(value:unknown):HeadingLevels{
  if(!record(value)||Object.keys(value).some(k=>!/^[1-6]$/.test(k)))throw RangeError('Invalid heading level registry');
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,validateHeadingDesign(v)]));
}
export function defaultHeadingDesign():HeadingDesign{return {schemaVersion:1,fontSize:6500,lineHeight:1.8,direction:'row',gap:3000,padding:2000,background:'#ffffff',textColor:'#222222',children:[{id:'bar',type:'rect',width:2000,height:16000,color:'#315b86'},{id:'content',type:'content'}]};}
function resolveFont(font:ComponentFont|undefined,inherited:PreviewTextStyle):PreviewTextStyle{
  if(!font)return {...inherited};
  return {fontFamily:Object.hasOwn(builtin,font.id)?builtin[font.id]:('BCFont_'+font.id.slice(5)) as PreviewFontFamily,fontWeight:font.weight};
}
export function compileHeadingDesign(value:HeadingDesign,inherited:PreviewTextStyle={fontFamily:'sans-serif',fontWeight:400}){
  const {schemaVersion:_,fontSize,lineHeight,font,children,...rest}=validateHeadingDesign(value);
  const textStyle=resolveFont(font,inherited);
  type CompiledChild=Exclude<HeadingChild,FixedLabel|{type:'group'}>|(Omit<FixedLabel,'font'>&PreviewTextStyle)|{id:string;type:'group';width:number|'fill';x?:number;y?:number;direction:'row'|'column'|'canvas';height?:number;gap:number;padding:number;background:string;children:CompiledChild[]};
  function compile(child:HeadingChild):CompiledChild{
    if(child.type==='group')return {...child,children:child.children.map(compile)};
    if(child.type!=='label')return child;
    const {font,...label}=child;return {...label,...resolveFont(font,inherited)};
  }
  const component={...rest,children:children.map(compile)};
  return {fontSize,lineHeight,textStyle,component};
}
