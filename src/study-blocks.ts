import {compileHeadingDesign,studyKinds,type StudyKind,type HeadingDesign,type ComponentLibraryEntry,type HeadingContext,type HeadingChild,validNamedSlot} from './preview-component.js';
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
export const isStudyBlockId=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(v);
export function studyKind(name:string,attrs:Readonly<Record<string,string>>):StudyKind|undefined{
  const key=name==='callout'?attrs.kind:name==='component'?attrs.name:undefined;
  if(!key||!(name==='callout'?['note','tip','warning','important']:['example','exercise','explanation']).includes(key))return;
  const field=name==='callout'?'kind':'name';
  if(Object.keys(attrs).some(k=>k!==field&&k!=='title'&&!(key==='explanation'&&k==='answer-to')))return;
  if(Object.hasOwn(attrs,'answer-to')&&!isStudyBlockId(attrs['answer-to']))return;
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
export function compileStudyBlock(kind:StudyKind,title:string|undefined,body:PreviewTextStyle,design?:HeadingDesign,numbering?:StudyNumber,answer?:StudyAnswer){
  if(!studyKinds.includes(kind))throw RangeError('Unknown study block');
  const p=presets[kind],label=p.label+(answer&&kind==='explanation'?' '+answer.number.chapter+'.'+answer.number.index:'');
  return compileHeadingDesign(design??defaultStudyDesign(kind),body,{'study-label':title===undefined?label:label+'：'+title,'study-title':title,'study-kind':p.label,...numberContext(numbering),...answerContext(answer)},'study');
}
// Append only; the caller checks the scanner recognizes the new root container.
export function studyTemplate(kind:StudyKind){
  if(!studyKinds.includes(kind))throw RangeError('Unknown study block');
  const directive=['note','tip','warning','important'].includes(kind)?'callout{kind="'+kind+'"}':'component{name="'+kind+'"}';
  return ':::'+directive+'\n'+presets[kind].label+'の本文を入力してください。\n:::\n';
}

export const isCustomComponentId=(value:unknown):value is string=>typeof value==='string'&&/^component-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
export function customStudyId(name:string,attrs:Readonly<Record<string,string>>):string|undefined{
  if(name!=='component'||!isCustomComponentId(attrs.name)||Object.keys(attrs).some(k=>k!=='name'&&k!=='title'&&k!=='answer-to'))return;
  if(Object.hasOwn(attrs,'answer-to')&&!isStudyBlockId(attrs['answer-to']))return;
  if(Object.hasOwn(attrs,'title')&&(!attrs.title.trim()||attrs.title.length>128||/[\p{Cc}\p{Cs}\p{Cf}\p{Zl}\p{Zp}]/u.test(attrs.title)))return;
  return attrs.name;
}
export function compileCustomStudyBlock(entry:ComponentLibraryEntry,title:string|undefined,body:PreviewTextStyle,numbering?:StudyNumber,answer?:StudyAnswer){
  if(entry.usage!=='study'||!isCustomComponentId(entry.id))throw RangeError('Component usage does not match custom study block');
  return compileHeadingDesign(entry.design,body,{'study-label':title===undefined?entry.name:entry.name+'：'+title,'study-title':title,'study-kind':entry.name,...numberContext(numbering),...answerContext(answer)},'study');
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
export interface StudyAnswer {number:StudyNumber;kind:string;title?:string}
function answerContext(a?:StudyAnswer):HeadingContext{
  if(!a)return {};
  const n=numberContext(a.number);
  return {'answer-number':n['study-number'],'answer-index':n['study-index'],'answer-sequence':n['study-sequence'],'answer-title':a.title,'answer-kind':a.kind};
}
export const studyKindName=(kind:StudyKind)=>presets[kind].label;
export function hasStudyNumbering(design:HeadingDesign|null|undefined):boolean{
  const visit=(nodes:HeadingChild[]):boolean=>nodes.some(n=>n.type==='dynamic'&&['study-number','study-index','study-sequence','answer-number','answer-index','answer-sequence','answer-title','answer-kind'].includes(n.field)||n.type==='group'&&visit(n.children));
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

/** Optional persistent instance identity and typed link, not a displayed number. */
export function linkedStudyTemplate(choice:string,instanceId?:string,answerTo?:string){
  const custom=isCustomComponentId(choice);
  if(instanceId!==undefined&&!isStudyBlockId(instanceId))throw RangeError('Invalid study instance ID');
  if(answerTo!==undefined&&(!isStudyBlockId(answerTo)||(!custom&&choice!=='explanation')||answerTo===instanceId))throw RangeError('Invalid answer target');
  const template=custom?customStudyTemplate(choice):studyTemplate(choice as StudyKind);
  const end=template.indexOf('}');
  return template.slice(0,end)+(instanceId?' #'+instanceId:'')+(answerTo?' answer-to="'+answerTo+'"':'')+template.slice(end);
}

/** Keep old single-line templates byte-identical; explicitly name the primary slot for multi-slot components. */
export function slottedStudyTemplate(choice:string,instanceId:string|undefined,answerTo:string|undefined,names:readonly string[]){
  if(!Array.isArray(names)||names.length>8||new Set(names).size!==names.length||names.some(n=>!validNamedSlot(n)))throw RangeError('Invalid named slot list');
  const base=linkedStudyTemplate(choice,instanceId,answerTo);
  if(!names.length)return base;
  if(!isCustomComponentId(choice)&&['note','tip','warning','important'].includes(choice))throw RangeError('Named slots require component syntax');
  const [header,body]=base.split('\n');
  return ':'+header+'\n'+['content',...names].map(name=>':::slot{name="'+name+'"}\n'+(name==='content'?body:'追加の原稿を入力してください。')+'\n:::\n').join('\n')+'::::\n';
}
