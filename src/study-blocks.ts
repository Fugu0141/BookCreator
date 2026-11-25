import {compileHeadingDesign,studyKinds,type StudyKind,type HeadingDesign,type ComponentLibraryEntry,type HeadingContext,type HeadingChild} from './preview-component.js';
import type {PreviewTextStyle} from './preview-typography.js';
export {type StudyKind} from './preview-component.js';
const presets:Readonly<Record<StudyKind,{label:string;background:string;color:string}>>=Object.freeze({
  note:{label:'補足',background:'#f1f5f9',color:'#334155'},
  tip:{label:'ポイント',background:'#ecfdf5',color:'#166534'},
  warning:{label:'注意',background:'#fff7ed',color:'#9a3412'},
  important:{label:'重要',background:'#fef2f2',color:'#991b1b'},
  example:{label:'例題',background:'#eff6ff',color:'#1e40af'},
  exercise:{label:'練習問題',background:'#f5f3ff',color:'#5b21b6'},
  explanation:{label:'解説',background:'#f0f9ff',color:'#075985'}
});
export function studyKind(name:string,attrs:Readonly<Record<string,string>>):StudyKind|undefined{
  const key=name==='callout'?attrs.kind:name==='component'?attrs.name:undefined;
  if(!key||!(name==='callout'?['note','tip','warning','important']:['example','exercise','explanation']).includes(key))return;
  const field=name==='callout'?'kind':'name';
  if(Object.keys(attrs).some(k=>k!==field&&k!=='title'))return;
  if(Object.hasOwn(attrs,'title')&&(!attrs.title.trim()||attrs.title.length>128||/[\p{Cc}\p{Cs}\p{Cf}\p{Zl}\p{Zp}]/u.test(attrs.title)))return;
  return key as StudyKind;
}
export function defaultStudyDesign(kind:StudyKind):HeadingDesign{
  if(!studyKinds.includes(kind))throw RangeError('Unknown study block');
  const p=presets[kind];
  return {schemaVersion:1,direction:'column',gap:2000,padding:3000,background:p.background,textColor:'#222222',fontSize:4200,lineHeight:1.8,children:[
    {id:'study-label',type:'dynamic',width:'fill',field:'study-label',prefix:'',suffix:'',fallback:p.label,fontSize:4400,lineHeight:1.5,color:p.color},
    {id:'content',type:'content'}
  ]};
}
export function compileStudyBlock(kind:StudyKind,title:string|undefined,body:PreviewTextStyle,design?:HeadingDesign,numbering?:StudyNumber){
  if(!studyKinds.includes(kind))throw RangeError('Unknown study block');
  const p=presets[kind];
  return compileHeadingDesign(design??defaultStudyDesign(kind),body,{'study-label':title===undefined?p.label:p.label+'：'+title,'study-title':title,'study-kind':p.label,...numberContext(numbering)},'study');
}
// Append only; the caller checks the scanner recognizes the new root container.
export function studyTemplate(kind:StudyKind){
  if(!studyKinds.includes(kind))throw RangeError('Unknown study block');
  const directive=['note','tip','warning','important'].includes(kind)?'callout{kind="'+kind+'"}':'component{name="'+kind+'"}';
  return ':::'+directive+'\n'+presets[kind].label+'の本文を入力してください。\n:::\n';
}

export const isCustomComponentId=(value:unknown):value is string=>typeof value==='string'&&/^component-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
export function customStudyId(name:string,attrs:Readonly<Record<string,string>>):string|undefined{
  if(name!=='component'||!isCustomComponentId(attrs.name)||Object.keys(attrs).some(k=>k!=='name'&&k!=='title'))return;
  if(Object.hasOwn(attrs,'title')&&(!attrs.title.trim()||attrs.title.length>128||/[\p{Cc}\p{Cs}\p{Cf}\p{Zl}\p{Zp}]/u.test(attrs.title)))return;
  return attrs.name;
}
export function compileCustomStudyBlock(entry:ComponentLibraryEntry,title:string|undefined,body:PreviewTextStyle,numbering?:StudyNumber){
  if(entry.usage!=='study'||!isCustomComponentId(entry.id))throw RangeError('Component usage does not match custom study block');
  return compileHeadingDesign(entry.design,body,{'study-label':title===undefined?entry.name:entry.name+'：'+title,'study-title':title,'study-kind':entry.name,...numberContext(numbering)},'study');
}
export function customStudyTemplate(id:string){
  if(!isCustomComponentId(id))throw RangeError('Invalid custom component ID');
  return ':::component{name="'+id+'"}\n本文を入力してください。\n:::\n';
}

export interface StudyNumber {chapter:number;index:number;sequence:number}
function numberContext(n?:StudyNumber):HeadingContext{
  if(!n)return {};
  if(![n.chapter,n.index,n.sequence].every(v=>Number.isSafeInteger(v)&&v>0))throw RangeError('Invalid study numbering context');
  return {'study-number':n.chapter+'.'+n.index,'study-index':String(n.index),'study-sequence':String(n.sequence)};
}
export function hasStudyNumbering(design:HeadingDesign|null|undefined):boolean{
  const visit=(nodes:HeadingChild[]):boolean=>nodes.some(n=>n.type==='dynamic'&&['study-number','study-index','study-sequence'].includes(n.field)||n.type==='group'&&visit(n.children));
  return !!design&&visit(design.children);
}
/** Counts all occurrences by stable semantic key, regardless of the selected visual design. */
export function createStudyNumbering(){
  let chapter=0,active=false;
  const local=new Map<string,number>(),global=new Map<string,number>();
  function beginChapter(){chapter++;active=true;local.clear();}
  return {
    beginSection(){active=false;},
    heading(level:number){if(level===1||!active)beginChapter();return chapter;},
    next(key:string):StudyNumber{
      if(!isCustomComponentId(key)&&!(studyKinds as readonly string[]).includes(key))throw RangeError('Invalid study counter key');
      if(!active)beginChapter();
      const index=(local.get(key)??0)+1,sequence=(global.get(key)??0)+1;
      local.set(key,index);global.set(key,sequence);
      return {chapter,index,sequence};
    }
  };
}
