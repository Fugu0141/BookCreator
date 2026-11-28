import type {PreviewTextStyle,PreviewFontFamily} from './preview-typography.js';
// Persist stable resource IDs, not browser CSS identifiers.
export interface ComponentFont {id:string;weight:number}
export interface FixedLabel {x?:number;y?:number;id:string;type:'label';width:number|'fill';text:string;fontSize:number;lineHeight:number;color:string;font?:ComponentFont}
export const dynamicFields=['chapter-number','chapter-title','heading-number','heading-title','heading-level'] as const;
export const studyDynamicFields=['study-label','study-title','study-kind','study-number','study-index','study-sequence','answer-number','answer-index','answer-sequence','answer-title','answer-kind'] as const;
export const studyKinds=['note','tip','warning','important','example','exercise','explanation'] as const;
export type StudyKind=typeof studyKinds[number];
export type DynamicField=typeof dynamicFields[number]|typeof studyDynamicFields[number];
export type HeadingContext=Readonly<Partial<Record<DynamicField,string>>>;
export type DynamicLabel=Omit<FixedLabel,'type'|'text'>&{type:'dynamic';field:DynamicField;prefix:string;suffix:string;fallback:string};
export interface ImageCrop {left:number;top:number;right:number;bottom:number}
export type NamedSlot=Omit<FixedLabel,'type'|'text'>&{type:'slot';name:string;optional?:boolean;paragraphGap?:number};
export const validNamedSlot=(v:unknown):v is string=>typeof v==='string'&&/^[a-z][a-z0-9-]{0,31}$/.test(v)&&v!=='content';
export type HeadingChild=({id:string;type:'content';width?:number}|{id:string;type:'rect';width:number|'fill';height:number;color:string}|FixedLabel|DynamicLabel|NamedSlot|{id:string;type:'image';width:number|'fill';height:number;assetId:string;fit:'contain'|'cover';alt:string;crop?:ImageCrop}|{id:string;type:'group';width:number|'fill';direction:'row'|'column'|'canvas';height?:number;heightMode?:'auto';gap:number;padding:number;background:string;showWhenSlot?:string;children:HeadingChild[]}) & {x?:number;y?:number};
export interface HeadingDesign {
  schemaVersion:1;
  fontSize:number; lineHeight:number; font?:ComponentFont; paragraphGap?:number;
  direction:'row'|'column'; gap:number; padding:number; background:string; textColor:string;
  minHeightPercent?:number;
  children:HeadingChild[];
}
export type HeadingLevel='1'|'2'|'3'|'4'|'5'|'6';
export type HeadingLevels=Partial<Record<HeadingLevel,HeadingDesign>>;
const record=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const exact=(x:Record<string,unknown>,keys:string[],optional:string[]=[])=>keys.every(k=>Object.hasOwn(x,k))&&Object.keys(x).every(k=>keys.includes(k)||optional.includes(k));
const len=(x:unknown,min=0,max=100000):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=min&&x<=max;
const color=(x:unknown):x is string=>typeof x==='string'&&/^#[0-9a-fA-F]{6}$/.test(x);
const plainLabel=(x:unknown,min:number,max:number):x is string=>typeof x==='string'&&x.length>=min&&x.length<=max&&!/[\p{Cc}\p{Cs}\p{Cf}\p{Zl}\p{Zp}]/u.test(x);
const line=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&x>=1.25&&x<=4;
const builtin:Readonly<Record<string,PreviewFontFamily>>=Object.freeze({'noto-sans-jp':'BCFont_NotoSansJP','system-serif':'serif','system-sans':'sans-serif','system-monospace':'monospace'});
function validCrop(v:unknown){
  return record(v)&&exact(v,['left','top','right','bottom'])&&len(v.left,0,9900)&&len(v.top,0,9900)&&len(v.right,0,9900)&&len(v.bottom,0,9900)&&v.left+v.right<=9900&&v.top+v.bottom<=9900;
}
function validateFont(v:unknown){
  if(!record(v)||!exact(v,['id','weight'])||typeof v.id!=='string'||!(Object.hasOwn(builtin,v.id)||/^font-[a-f0-9]{64}$/.test(v.id))||!len(v.weight,100,900))throw RangeError('Invalid component font ID or weight');
}
export function validateHeadingDesign(value:unknown,scope:'heading'|'study'|'paragraph'='heading'):HeadingDesign{
  const fail=()=>{throw RangeError('Invalid experimental heading component');};
  if(!record(value)||!exact(value,['schemaVersion','fontSize','lineHeight','direction','gap','padding','background','textColor','children'],['font',...(scope==='heading'?[]:['paragraphGap']),...(scope==='paragraph'?[]:['minHeightPercent'])])||value.schemaVersion!==1||!len(value.fontSize,2000,30000)||!line(value.lineHeight)||!['row','column'].includes(String(value.direction))||!len(value.gap)||!len(value.padding)||!color(value.background)||!color(value.textColor)||!Array.isArray(value.children)||value.children.length<1||value.children.length>8)throw fail();
  if(Object.hasOwn(value,'minHeightPercent')&&!len(value.minHeightPercent,1,100))throw fail();
  if(Object.hasOwn(value,'font'))validateFont(value.font);
  if(Object.hasOwn(value,'paragraphGap')&&!len(value.paragraphGap,0,30000))throw fail();
  const ids=new Set<string>(),names=new Set<string>();let slots=0,count=0;
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
    if(child.type==='group'&&exact(child,['id','type','width','direction','gap','padding','background','children',...pos,...(child.direction==='canvas'?['height']:[])],['showWhenSlot',...(child.direction==='canvas'?['heightMode']:[])])&&['row','column','canvas'].includes(String(child.direction))&&len(child.gap)&&len(child.padding)&&color(child.background)&&Array.isArray(child.children)){if(child.direction==='canvas'&&(!len(child.height)||child.gap!==0||(Object.hasOwn(child,'heightMode')?child.heightMode!=='auto':child.height<=2*child.padding)))throw fail();visit(child.children,depth+1,child.direction==='canvas');
      if(Object.hasOwn(child,'showWhenSlot')){
        if(scope!=='study'||!validNamedSlot(child.showWhenSlot)||conditionalSlotName(child.children as HeadingChild[])!==child.showWhenSlot)throw fail();
      }
      continue;}
    if(child.type==='image'&&exact(child,['id','type','width','height','assetId','fit','alt',...pos],['crop'])&&len(child.height,1)&&typeof child.assetId==='string'&&/^[a-f0-9]{64}$/.test(child.assetId)&&['contain','cover'].includes(String(child.fit))&&typeof child.alt==='string'&&child.alt.length<=256&&(!Object.hasOwn(child,'crop')||validCrop(child.crop))&&!/[\p{Cc}\p{Cs}]/u.test(child.alt))continue;
    if(!color(child.color))throw fail();
    if(child.type==='rect'&&exact(child,['id','type','width','height','color',...pos])&&len(child.height,1))continue;
    if(scope==='study'&&child.type==='slot'&&exact(child,['id','type','name','width','fontSize','lineHeight','color',...pos],['font','optional','paragraphGap'])&&(!Object.hasOwn(child,'paragraphGap')||len(child.paragraphGap,0,30000))&&(!Object.hasOwn(child,'optional')||typeof child.optional==='boolean')&&validNamedSlot(child.name)&&!names.has(child.name)&&names.size<8&&len(child.fontSize,2000,30000)&&line(child.lineHeight)){
      names.add(child.name);if(Object.hasOwn(child,'font'))validateFont(child.font);continue;
    }
    if(child.type==='dynamic'&&exact(child,['id','type','width','field','prefix','suffix','fallback','fontSize','lineHeight','color',...pos],['font'])&&(scope==='study'?(studyDynamicFields as readonly string[]):(dynamicFields as readonly string[])).includes(String(child.field))&&plainLabel(child.prefix,0,64)&&plainLabel(child.suffix,0,64)&&plainLabel(child.fallback,1,64)&&len(child.fontSize,2000,30000)&&line(child.lineHeight)){
      if(Object.hasOwn(child,'font'))validateFont(child.font);continue;
    }
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
export function hasDynamicLabels(design:HeadingDesign|null|undefined):boolean{
  const visit=(nodes:HeadingChild[]):boolean=>nodes.some(n=>n.type==='dynamic'||(n.type==='group'&&visit(n.children)));
  return !!design&&visit(design.children);
}
export function compileHeadingDesign(value:HeadingDesign,inherited:PreviewTextStyle={fontFamily:'sans-serif',fontWeight:400},context?:HeadingContext,scope:'heading'|'study'|'paragraph'='heading'){
  const {schemaVersion:_,fontSize,lineHeight,font,paragraphGap,children,...rest}=validateHeadingDesign(value,scope);
  const textStyle=resolveFont(font,inherited);
  const slotStyles:{name:string;fontSize:number;lineHeight:number;textStyle:PreviewTextStyle;optional?:boolean;paragraphGap?:number}[]=[],conditionalGroups:{id:string;name:string}[]=[];
  type CompiledChild=Exclude<HeadingChild,FixedLabel|DynamicLabel|NamedSlot|{type:'group'}>|Omit<NamedSlot,'font'|'fontSize'|'lineHeight'|'optional'|'paragraphGap'>|(Omit<FixedLabel,'font'>&PreviewTextStyle)|{id:string;type:'group';width:number|'fill';x?:number;y?:number;direction:'row'|'column'|'canvas';height?:number;heightMode?:'auto';gap:number;padding:number;background:string;children:CompiledChild[]};
  function compile(child:HeadingChild):CompiledChild{
    if(child.type==='group'){
      const {showWhenSlot,...group}=child;if(showWhenSlot)conditionalGroups.push({id:child.id,name:showWhenSlot});
      return {...group,children:child.children.map(compile)};
    }
    if(child.type==='dynamic'){
      if(!context)throw Error('Dynamic heading label requires heading context');
      const {font,field,prefix,suffix,fallback,...label}=child;
      const value=context[field]??fallback;
      const text=prefix+value+suffix;
      if(!plainLabel(text,1,256))throw RangeError('Resolved dynamic label exceeds supported text limits');
      return {...label,type:'label',text,...resolveFont(font,inherited)};
    }
    if(child.type==='slot'){
      const {font,fontSize,lineHeight,optional,paragraphGap,...node}=child;
      slotStyles.push({name:child.name,fontSize,lineHeight,textStyle:resolveFont(font,inherited),...(optional?{optional:true}:{}),...(paragraphGap===undefined?{}:{paragraphGap})});return node;
    }
    if(child.type!=='label')return child;
    const {font,...label}=child;return {...label,...resolveFont(font,inherited)};
  }
  const component={...rest,children:children.map(compile)};
  return {fontSize,lineHeight,textStyle,component,slotStyles,conditionalGroups,paragraphGap};
}

/** Experimental project-local component library. Usage is explicit for future expansion. */
export type ComponentUsage='heading'|'paragraph'|'study';
export interface ComponentLibraryEntry {id:string;name:string;usage:ComponentUsage;design:HeadingDesign}
export interface ComponentLibrary {schemaVersion:1|2|3;entries:ComponentLibraryEntry[]}
export function emptyComponentLibrary():ComponentLibrary{return {schemaVersion:1,entries:[]};}
export function validateComponentLibrary(value:unknown):ComponentLibrary{
  if(!record(value)||!exact(value,['schemaVersion','entries'])||![1,2,3].includes(Number(value.schemaVersion))||typeof value.schemaVersion!=='number'||!Array.isArray(value.entries)||value.entries.length>32)throw RangeError('Invalid component library');
  const ids=new Set<string>(),names=new Set<string>();
  const entries:ComponentLibraryEntry[]=value.entries.map(entry=>{
    if(!record(entry)||!exact(entry,['id','name','usage','design'])||typeof entry.id!=='string'||!/^component-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(entry.id)||ids.has(entry.id)||!plainLabel(entry.name,1,80)||entry.name!==entry.name.trim()||!(entry.usage==='heading'||(Number(value.schemaVersion)>=2&&entry.usage==='paragraph')||(value.schemaVersion===3&&entry.usage==='study')))throw RangeError('Invalid component library entry');
    const key=entry.name.normalize('NFC').toLowerCase();
    if(names.has(key))throw RangeError('Duplicate component name');
    ids.add(entry.id);names.add(key);
    return {id:entry.id,name:entry.name,usage:entry.usage,design:validateComponentDesign(entry.design,entry.usage)};
  });
  return {schemaVersion:value.schemaVersion as 1|2|3,entries};
}

export type HeadingTarget='default'|HeadingLevel;
export type HeadingBindings=Partial<Record<HeadingTarget,string>>;
export function validateHeadingBindings(value:unknown):HeadingBindings{
  if(!record(value)||Object.keys(value).some(k=>!['default','1','2','3','4','5','6'].includes(k)))throw RangeError('Invalid heading bindings');
  for(const id of Object.values(value))if(typeof id!=='string'||!/^component-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))throw RangeError('Invalid component reference');
  return {...value} as HeadingBindings;
}
/** Resolve a nonrecursive shared registry into the existing neutral heading adapter. */
export function resolveHeadingBindings(heading:HeadingDesign|null,levels:HeadingLevels,bindings:HeadingBindings,library:ComponentLibrary){
  const localHeading=heading===null?null:validateHeadingDesign(heading),localLevels=validateHeadingLevels(levels),refs=validateHeadingBindings(bindings),entries=validateComponentLibrary(library).entries;
  let headingDesign=localHeading;const headingLevels={...localLevels};
  for(const [target,id] of Object.entries(refs)){
    const entry=entries.find(e=>e.id===id);
    if(!entry)throw RangeError('Missing shared heading component: '+id);
    if(entry.usage!=='heading')throw RangeError('Component usage does not match heading target');
    if(target==='default'){
      if(localHeading!==null)throw RangeError('Shared and local default heading conflict');
      headingDesign=structuredClone(entry.design);
    }else{
      const level=target as HeadingLevel;
      if(Object.hasOwn(localLevels,level))throw RangeError('Shared and local heading override conflict');
      headingLevels[level]=structuredClone(entry.design);
    }
  }
  return {headingDesign,headingLevels};
}

/** A restricted, fragmentable component with exactly one source slot. */
export function defaultParagraphDesign():HeadingDesign{
  return {schemaVersion:1,fontSize:4200,lineHeight:1.8,direction:'column',gap:0,padding:2000,background:'#f5f5f5',textColor:'#222222',children:[{id:'content',type:'content'}]};
}
export function validateParagraphDesign(value:unknown):HeadingDesign{
  const design=validateHeadingDesign(value,'paragraph');
  if(design.direction!=='column'||design.gap!==0||design.children.length!==1||design.children[0].type!=='content')throw RangeError('Paragraph frame requires a single content slot and zero gap');
  return design;
}
export function compileParagraphDesign(value:HeadingDesign,inherited:PreviewTextStyle){
  return compileHeadingDesign(validateParagraphDesign(value),inherited,undefined,'paragraph');
}

/** Old paragraph definitions are local v1; v2 is a reference only. */
export function resolveParagraphBinding(value:unknown,library:ComponentLibrary){
  if(value===undefined)return {paragraphDesign:null,paragraphBinding:null};
  if(record(value)&&value.schemaVersion===2){
    if(!exact(value,['schemaVersion','componentId']))throw RangeError('Invalid shared paragraph reference');
    const id=validateHeadingBindings({default:value.componentId}).default!;
    const entry=validateComponentLibrary(library).entries.find(e=>e.id===id);
    if(!entry)throw RangeError('Missing shared paragraph component: '+id);
    if(entry.usage!=='paragraph')throw RangeError('Component usage does not match paragraph target');
    return {paragraphDesign:validateParagraphDesign(entry.design),paragraphBinding:id};
  }
  return {paragraphDesign:validateParagraphDesign(value),paragraphBinding:null};
}

export function validateComponentDesign(value:unknown,usage:ComponentUsage):HeadingDesign{
  if(usage==='paragraph')return validateParagraphDesign(value);
  if(usage==='heading'||usage==='study')return validateHeadingDesign(value,usage);
  throw RangeError('Unsupported component usage');
}
export type StudyDesigns=Partial<Record<StudyKind,HeadingDesign>>;
export type StudyBindings=Partial<Record<StudyKind,string>>;
export function resolveStudyDesigns(value:unknown,library:ComponentLibrary){
  const studyDesigns:StudyDesigns={},studyBindings:StudyBindings={};
  if(value===undefined)return {studyDesigns,studyBindings};
  if(!record(value)||!exact(value,['schemaVersion','kinds'])||value.schemaVersion!==1||!record(value.kinds)||Object.keys(value.kinds).some(k=>!(studyKinds as readonly string[]).includes(k)))throw RangeError('Invalid study design registry');
  const entries=validateComponentLibrary(library).entries;
  for(const [key,raw] of Object.entries(value.kinds)){
    const kind=key as StudyKind;
    if(record(raw)&&Object.hasOwn(raw,'componentId')){
      if(!exact(raw,['componentId']))throw RangeError('Invalid study reference');
      const id=validateHeadingBindings({default:raw.componentId}).default!;
      const entry=entries.find(e=>e.id===id);
      if(!entry)throw RangeError('Missing shared study component: '+id);
      if(entry.usage!=='study')throw RangeError('Component usage does not match study target');
      studyBindings[kind]=id;studyDesigns[kind]=validateHeadingDesign(entry.design,'study');
    }else studyDesigns[kind]=validateHeadingDesign(raw,'study');
    if(['note','tip','warning','important'].includes(kind)&&namedSlotNames(studyDesigns[kind]).length)throw RangeError('Named slots require component syntax');
  }
  return {studyDesigns,studyBindings};
}

export function namedSlotDefinitions(design:HeadingDesign|undefined):NamedSlot[]{
  const slots:NamedSlot[]=[];
  function visit(nodes:HeadingChild[]){for(const n of nodes){if(n.type==='slot')slots.push(n);else if(n.type==='group')visit(n.children);}}
  if(design)visit(design.children);return slots;
}
export function namedSlotNames(design:HeadingDesign|undefined):string[]{return namedSlotDefinitions(design).map(n=>n.name);}
/** A conditional group may contain decorations and exactly one optional slot, never another source. */
export function conditionalSlotName(children:HeadingChild[]):string|undefined{
  let primary=false;const slots:NamedSlot[]=[];
  function visit(nodes:HeadingChild[]){for(const n of nodes){if(n.type==='content')primary=true;else if(n.type==='slot')slots.push(n);else if(n.type==='group')visit(n.children);}}
  visit(children);return !primary&&slots.length===1&&slots[0].optional?slots[0].name:undefined;
}
export function multilineTextOptions(text:string,paragraphGap?:number){
  return /\n/.test(text)?{multiline:true as const,...(paragraphGap===undefined?{}:{paragraphGap})}:{};
}
export interface NamedSlotSource {name:string;text:string;sourceTextStart?:number}
export function compileNamedSlotRequests(compiled:ReturnType<typeof compileHeadingDesign>,sources:readonly NamedSlotSource[]){
  const byName=new Map(sources.map(s=>[s.name,s]));
  const styles=new Set(compiled.slotStyles.map(s=>s.name));
  if(byName.size!==sources.length||sources.some(s=>!styles.has(s.name)))throw RangeError('Named slot set does not match component definition');
  return compiled.slotStyles.flatMap(s=>{
    const source=byName.get(s.name);
    if(!source){if(s.optional)return [];throw RangeError('Missing named slot: '+s.name);}
    if(!source.text.length)throw RangeError('Empty named slot: '+s.name);
    return [{name:s.name,request:{text:source.text,fontSize:s.fontSize,lineHeight:s.lineHeight,...s.textStyle,...multilineTextOptions(source.text,s.paragraphGap)},...(source.sourceTextStart===undefined?{}:{sourceTextStart:source.sourceTextStart})}];
  });
}
/** Derive an occurrence tree without mutating its stored design or inventing source text. */
export function resolveNamedSlotPresence(compiled:ReturnType<typeof compileHeadingDesign>,sources:readonly NamedSlotSource[]){
  const namedSlots=compileNamedSlotRequests(compiled,sources);
  const present=new Set(namedSlots.map(s=>s.name)),conditions=new Map(compiled.conditionalGroups.map(g=>[g.id,g.name]));
  type Child=typeof compiled.component.children[number];
  function prune(nodes:Child[]):Child[]{
    return nodes.flatMap((n):Child[]=>{
      if(n.type==='slot')return present.has(n.name)?[n]:[];
      if(n.type==='group'){
        const condition=conditions.get(n.id);if(condition&&!present.has(condition))return [];
        const children=prune(n.children);return children.length?[{...n,children}]:[];
      }
      return [n];
    });
  }
  return {component:{...compiled.component,children:prune(compiled.component.children)},namedSlots};
}
