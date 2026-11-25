import {validateHeadingDesign,validateHeadingLevels,validateComponentLibrary,emptyComponentLibrary,validateHeadingBindings,resolveHeadingBindings,validateParagraphDesign,resolveParagraphBinding,validateComponentDesign,resolveStudyDesigns,studyKinds} from '../../dist/preview-component.js';
import {resolvePageSettings,paperGeometry,marginString} from './book-settings.mjs';
import {projectImages} from './project-images.mjs';
import {projectFonts} from './project-fonts.mjs';
import {open,lstat,realpath,rename,unlink,mkdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname,join,resolve,relative,isAbsolute,basename} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {parseDocument,visit,isAlias,stringify} from 'yaml';

const MAX_SOURCE=4*1024*1024,MAX_MANIFEST=256*1024;
const hash=b=>createHash('sha256').update(b).digest('hex');
const decode=b=>new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(b);
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const validId=v=>typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(v);
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function relativeParts(path){
  if(typeof path!=='string'||!path||path.length>1024||/[\\:\u0000-\u001f\u007f]/.test(path)||path.startsWith('/'))fail('PATH','Invalid project-relative path');
  const parts=path.split('/');
  if(parts.some(p=>!p||p==='.'||p==='..'||/[<>|"*?]/.test(p)||/[ .]$/.test(p)||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))fail('PATH','Unsupported or unsafe path component');
  return parts;
}
async function inside(root,path){
  let current=root;
  for(const part of relativeParts(path)){
    current=join(current,part);
    const s=await lstat(current);
    if(s.isSymbolicLink())fail('PATH','Symbolic links are not supported');
  }
  const canonical=await realpath(current),rel=relative(root,canonical);
  if(!rel||isAbsolute(rel)||rel==='..'||rel.startsWith('..'+(process.platform==='win32'?'\\':'/')))fail('PATH','Path escapes project root');
  return canonical;
}
async function readRegular(path,limit){
  const f=await open(path,constants.O_RDONLY|constants.O_NONBLOCK|(constants.O_NOFOLLOW??0));
  try{
    const s=await f.stat();if(!s.isFile()||s.size>limit)fail('INPUT','Expected a bounded regular file');
    const bytes=Buffer.alloc(limit+1);let used=0;
    while(used<bytes.length){const r=await f.read(bytes,used,bytes.length-used,null);if(!r.bytesRead)break;used+=r.bytesRead;}
    if(used>limit)fail('INPUT','Input too large');
    return {bytes:bytes.subarray(0,used),mode:s.mode&0o777};
  }finally{await f.close();}
}
function safeYaml(raw){
  const doc=parseDocument(raw,{uniqueKeys:true,strict:true,schema:'core'});
  if(doc.errors.length||doc.warnings.length)fail('MANIFEST','Invalid or unsupported YAML');
  let nodes=0;
  visit(doc,(_key,node,path)=>{
    if(++nodes>10000||path.length>32||isAlias(node)||node?.tag||node?.anchor)fail('MANIFEST','Unsupported YAML tag, alias, anchor or complexity');
  });
  return doc;
}
function parseManifest(raw){
  const m=safeYaml(raw).toJS({maxAliasCount:0});
  if(!record(m)||m.schemaVersion!==1||m.documentFormat?.name!=='bcm'||m.documentFormat?.version!==1)fail('FORMAT','Unsupported book format (not editable in this PoC)');
  if(typeof m.title!=='string'||!m.title.trim()||typeof m.language!=='string'||typeof m.theme!=='string'||!record(m.page)||!Array.isArray(m.sections)||!m.sections.length||m.sections.length>512)fail('MANIFEST','Required book metadata is missing or invalid');
  relativeParts(m.theme);
  const ids=new Set(),paths=new Set(),sections=[];
  for(const s of m.sections){
    if(!record(s)||!validId(s.id)||ids.has(s.id)||!['manuscript','cover','blank'].includes(s.type))fail('MANIFEST','Invalid or duplicate section ID');
    ids.add(s.id);
    if(s.type!=='manuscript'){sections.push({id:s.id,type:s.type,editable:false});continue;}
    if(!['front-matter','body','back-matter'].includes(s.role)||typeof s.path!=='string'||!s.path.toLowerCase().endsWith('.md'))fail('MANIFEST','Invalid manuscript section');
    const parts=relativeParts(s.path);
    const folded=parts.join('/').normalize('NFC').toLowerCase();
    if(paths.has(folded))fail('MANIFEST','Duplicate or colliding manuscript path');
    paths.add(folded);
    const startOn=s.startOn??m.page.defaultSectionStart??'page';
    if(!['page','continuous','left','right','spread-start','spread-end'].includes(startOn))fail('MANIFEST','Invalid section start');
    sections.push({id:s.id,type:s.type,path:s.path,role:s.role,startOn,editable:true});
  }
  let pageSettings=null,pageMessage;
  try{pageSettings=resolvePageSettings(m.page);}catch(e){pageMessage=e.message;}
  return {title:m.title,language:m.language,sections,themePath:m.theme,pageSettings,...(pageMessage?{pageMessage}:{})};
}

const FACE_IDS=new Map([['noto-sans-jp','BCFont_NotoSansJP'],['system-serif','serif'],['system-sans','sans-serif'],['system-monospace','monospace']]);
const DEFAULT_ROLES={body:{font:'noto-sans-jp',weight:400},heading:{font:'noto-sans-jp',weight:700}};
function checkedRoles(value,faces=[]){
  if(!record(value)||Object.keys(value).some(k=>!['body','heading'].includes(k)))fail('THEME','Unsupported typography role');
  const result={};
  for(const role of ['body','heading']){
    const v=value[role];
    if(!record(v)||Object.keys(v).some(k=>!['font','weight'].includes(k))||!(FACE_IDS.has(v.font)?[400,500,600,700].includes(v.weight):faces.some(f=>f.id===v.font&&f.weight===v.weight)))fail('THEME','Unsupported font ID or weight');
    result[role]={font:v.font,weight:v.weight};
  }
  return result;
}
function checkComponentFonts(design,faces){
  function collect(children){return children.flatMap(c=>c.type==='group'?collect(c.children):(c.type==='label'||c.type==='dynamic'||c.type==='slot')&&c.font?[c.font]:[]);}
  for(const f of [design.font,...collect(design.children)].filter(Boolean)){
    if(!(FACE_IDS.has(f.id)?[400,500,600,700].includes(f.weight):faces.some(face=>face.id===f.id&&face.weight===f.weight)))fail('THEME','Unknown component font or unsupported weight');
  }
}
async function checkComponentImages(designs,store){
  const ids=new Set();
  function visit(children){for(const c of children){if(c.type==='image')ids.add(c.assetId);else if(c.type==='group')visit(c.children);}}
  for(const design of designs.filter(Boolean))visit(design.children);
  for(const id of ids)await store.read(id);
}
function readTypography(doc,faces){
  const t=doc.toJS({maxAliasCount:0});
  if(!record(t)||t.schemaVersion!==1)fail('THEME','Unsupported theme format');
  if(t.extends!==undefined||t.parent!==undefined)fail('THEME','Theme inheritance is not supported by this editor');
  if(t.typography===undefined)return null;
  if(!record(t.typography)||t.typography.schemaVersion!==1||Object.keys(t.typography).some(k=>!['schemaVersion','roles'].includes(k)))fail('THEME','Unsupported typography schema');
  return checkedRoles(t.typography.roles,faces);
}
async function writeNew(path,text){
  const f=await open(path,'wx',0o644);
  try{await f.writeFile(text,'utf8');await f.sync();}finally{await f.close();}
}
export async function createProject(parent,options){
  if(!record(options)||typeof options.title!=='string'||!options.title.trim()||options.title.length>200||/[\p{Cc}\p{Cs}]/u.test(options.title)||
    typeof options.folder!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(options.folder)||!['A4','A5','B5'].includes(options.size))
    fail('INPUT','Invalid new project title, folder or page size');
  relativeParts(options.folder);
  const dir=await realpath(parent),root=join(dir,options.folder);
  // An existing directory or file is never overwritten.
  await mkdir(root,{mode:0o755});
  try{
    for(const name of ['manuscript','assets','fonts','layouts','themes'])await mkdir(join(root,name));
    await mkdir(join(root,'themes','default'));
    await writeNew(join(root,'manuscript','chapter-01.md'),'# はじめに\n\nここから原稿を書き始めます。\n');
    await writeNew(join(root,'themes','default','theme.yaml'),stringify({schemaVersion:1,id:'default',name:'Default',tokens:{color:{accent:'#315b86',text:'#222222'}},typography:{schemaVersion:1,roles:DEFAULT_ROLES},components:{},bindings:{},repeats:[]}));
    await writeNew(join(root,'.gitignore'),'.bookcreator/\ndist/\n');
    // Publish the manifest last. Partial creation remains visible for manual recovery.
    await writeNew(join(root,'book.yaml'),stringify({schemaVersion:1,documentFormat:{name:'bcm',version:1},title:options.title.trim(),language:'ja',theme:'themes/default/theme.yaml',page:{size:options.size,binding:'left',firstInteriorSide:'right',defaultSectionStart:'page',margin:{top:'18mm',bottom:'20mm',inner:'23mm',outer:'18mm'}},sections:[{id:'chapter-01',type:'manuscript',role:'body',path:'manuscript/chapter-01.md'}]}));
    return await openWorkspace(join(root,'book.yaml'));
  }catch(e){fail('CREATE','Project creation incomplete; inspect the newly created folder '+root+' ('+String(e.message??e)+')');}
}

function sourceInfo(bytes){
  const raw=decode(bytes),bom=raw.startsWith('\uFEFF'),text=bom?raw.slice(1):raw;
  const crlf=(text.match(/\r\n/g)??[]).length;
  const rest=text.replace(/\r\n/g,'');
  const mixed=rest.includes('\r')||(crlf>0&&rest.includes('\n'));
  return {text:text.replace(/\r\n|\r/g,'\n'),bom,eol:crlf?'\r\n':'\n',editable:!mixed};
}
export async function openWorkspace(manifestPath){
  if(basename(manifestPath)!=='book.yaml'||(await lstat(manifestPath)).isSymbolicLink())fail('MANIFEST','Select a regular book.yaml file');
  const root=await realpath(dirname(resolve(manifestPath)));
  const manifest=await inside(root,'book.yaml');
  const m=await readRegular(manifest,MAX_MANIFEST);
  let summary=parseManifest(decode(m.bytes)),manifestHash=hash(m.bytes);
  const seen=new Set(),files=new Map();
  for(const s of summary.sections){
    if(!s.editable)continue;
    const path=await inside(root,s.path);
    const stat=await lstat(path);
    if(!stat.isFile())fail('PATH','Manuscript must be a regular file');
    // Reject hard links and duplicate file identities for this early writer.
    const identity=String(stat.dev)+':'+String(stat.ino);
    if(stat.nlink!==1||seen.has(identity))fail('PATH','Linked or duplicate manuscript file');
    seen.add(identity);files.set(s.id,{path,relativePath:s.path});
  }
  let busy=false;
  const fontStore=projectFonts(root),imageStore=projectImages(root);
  async function checkManifest(){
    const latest=await readRegular(await inside(root,'book.yaml'),MAX_MANIFEST);
    if(hash(latest.bytes)!==manifestHash)fail('CONFLICT','book.yaml changed externally; reopen the project');
    return latest;
  }
  async function current(id){
    const f=files.get(id);if(!f)fail('SECTION','Unknown or non-manuscript section');
    const path=await inside(root,f.relativePath);
    if(path!==f.path||(await lstat(path)).nlink!==1)fail('PATH','Manuscript identity changed');
    const r=await readRegular(path,MAX_SOURCE);
    return {f,...r,info:sourceInfo(r.bytes),revision:hash(r.bytes)};
  }
  // Conservative deletion guard: an ID anywhere in a listed manuscript may be a reference.
  // Never guess from a partially supported parser or silently ignore unreadable files.
  async function assertNoManuscriptReference(id){
    if(files.size>128)fail('THEME','Too many manuscripts to verify component deletion');
    let total=0;
    for(const key of files.keys()){
      const r=await current(key);total+=r.bytes.length;
      if(total>16*1024*1024)fail('THEME','Manuscript reference check exceeds size limit');
      if(r.info.text.includes(id))fail('THEME','Cannot delete a component referenced in manuscript '+key);
    }
  }
  async function readTheme(){
    let path;
    try{path=await inside(root,summary.themePath);}catch(e){if(e.code==='ENOENT')return {editable:false,roles:null,revision:null,message:'Theme file missing; preview defaults only'};throw e;}
    const st=await lstat(path);if(!st.isFile()||st.nlink!==1||path===manifest||[...files.values()].some(f=>f.path===path))fail('THEME','Unsafe theme file');
    const r=await readRegular(path,MAX_MANIFEST),doc=safeYaml(decode(r.bytes));
    try{const roles=readTypography(doc,await fontStore.list());const raw=doc.toJS({maxAliasCount:0}).previewComponents;
      let library=emptyComponentLibrary(),libraryEditable=true,libraryMessage;
      try{const rawLibrary=doc.toJS({maxAliasCount:0}).previewComponentLibrary;if(rawLibrary!==undefined)library=validateComponentLibrary(rawLibrary);}
      catch(e){libraryEditable=false;libraryMessage=e.message;}
      let headingDesign=null,headingLevels={},localHeading=null,localLevels={},bindings={},componentEditable=true,componentMessage;
      if(raw!==undefined){try{
        if(!record(raw)||![1,2,3].includes(raw.schemaVersion)||Object.keys(raw).some(k=>!(raw.schemaVersion===1?['schemaVersion','heading']:raw.schemaVersion===2?['schemaVersion','heading','levels']:['schemaVersion','heading','levels','bindings']).includes(k)))throw Error('Unsupported component schema');
        localHeading=raw.heading===null&&raw.schemaVersion>=2?null:validateHeadingDesign(raw.heading);
        localLevels=raw.schemaVersion>=2?validateHeadingLevels(raw.levels):{};
        bindings=raw.schemaVersion===3?validateHeadingBindings(raw.bindings):{};
        if(Object.keys(bindings).length&&!libraryEditable)throw Error('Shared component library unsupported');
        ({headingDesign,headingLevels}=resolveHeadingBindings(localHeading,localLevels,bindings,library));
        const faces=await fontStore.list();
        for(const design of [headingDesign,...Object.values(headingLevels)].filter(Boolean))checkComponentFonts(design,faces);
        await checkComponentImages([headingDesign,...Object.values(headingLevels)],imageStore);
      }catch(e){componentEditable=false;componentMessage=e.message;headingDesign=null;headingLevels={};}}
      let paragraphDesign=null,paragraphBinding=null,paragraphEditable=true,paragraphMessage;
      try{const frame=doc.toJS({maxAliasCount:0}).previewParagraph;if(frame!==undefined){({paragraphDesign,paragraphBinding}=resolveParagraphBinding(frame,library));if(paragraphDesign)checkComponentFonts(paragraphDesign,await fontStore.list());}}
      catch(e){paragraphDesign=null;paragraphEditable=false;paragraphMessage=e.message;}
      let studyDesigns={},studyBindings={},studyEditable=true,studyMessage;
      try{({studyDesigns,studyBindings}=resolveStudyDesigns(doc.toJS({maxAliasCount:0}).previewStudy,library));
        const faces=await fontStore.list();for(const design of Object.values(studyDesigns))checkComponentFonts(design,faces);await checkComponentImages(Object.values(studyDesigns),imageStore);
      }catch(e){studyDesigns={};studyEditable=false;studyMessage=e.message;}
      const studyResourceErrors={};
      for(const e of library.entries.filter(e=>e.usage==='study'))try{checkComponentFonts(e.design,await fontStore.list());await checkComponentImages([e.design],imageStore);}catch(err){studyResourceErrors[e.id]=err.message;}
      return {editable:true,roles,studyResourceErrors,studyDesigns,studyBindings,studyEditable,studyMessage,paragraphDesign,paragraphBinding,paragraphEditable,paragraphMessage,headingDesign,headingLevels,localHeading,localLevels,bindings,componentEditable,componentMessage,library,libraryEditable,libraryMessage,revision:hash(r.bytes),path,doc,...r};}
    catch(e){if(e.code==='THEME')return {editable:false,roles:null,revision:null,message:e.message};throw e;}
  }
  function publicTheme(t){return {editable:t.editable,roles:t.roles,revision:t.revision,studyResourceErrors:t.studyResourceErrors??{},studyDesigns:t.studyDesigns??{},studyBindings:t.studyBindings??{},studyEditable:t.studyEditable===true,studyMessage:t.studyMessage,paragraphDesign:t.paragraphDesign??null,paragraphBinding:t.paragraphBinding??null,paragraphEditable:t.paragraphEditable===true,paragraphMessage:t.paragraphMessage,headingDesign:t.headingDesign??null,headingLevels:t.headingLevels??{},componentMessage:t.componentMessage,componentEditable:t.componentEditable===true,bindings:t.bindings??{},library:t.library??emptyComponentLibrary(),libraryEditable:t.libraryEditable===true,libraryMessage:t.libraryMessage,...(t.message?{message:t.message}:{})};}
  function settingsView(){return {revision:manifestHash,page:summary.pageSettings,sections:structuredClone(summary.sections),message:summary.pageMessage};}
  return {
    get summary(){return structuredClone(summary);},
    async bookSettings(){await checkManifest();return settingsView();},
    async readBook(){
      await checkManifest();
      if(summary.sections.some(s=>!s.editable||!['page','continuous'].includes(s.startOn)))fail('PREVIEW','Whole-book preview does not support cover, blank or physical-side sections yet');
      if(summary.sections.length>128)fail('PREVIEW','Too many sections for experimental preview');
      const docs=[];let total=0;
      for(const s of summary.sections){const r=await current(s.id);total+=r.info.text.length;if(total>50000)fail('PREVIEW','Book preview text limit exceeded');docs.push({documentId:s.id,revision:r.revision,source:r.info.text,startOn:s.startOn});}
      await checkManifest();
      for(const doc of docs)if((await current(doc.documentId)).revision!==doc.revision)fail('CONFLICT','Manuscript changed while reading the book');
      return docs;
    },
    async saveBookSettings(expectedRevision,value){
      if(busy)fail('BUSY','Another write is in progress');
      if(!record(value)||!record(value.page)||!Array.isArray(value.sections))fail('PAGE','Invalid book settings');
      paperGeometry(value.page);busy=true;let temp;
      try{
        const old=await checkManifest();
        if(expectedRevision!==manifestHash||!summary.pageSettings)fail('CONFLICT','Book settings changed or are unsupported');
        const doc=safeYaml(decode(old.bytes)),seq=doc.get('sections',true);
        const manuscript=summary.sections.filter(s=>s.editable),byId=new Map(manuscript.map(s=>[s.id,s]));
        if(value.sections.length!==manuscript.length||new Set(value.sections.map(s=>s?.id)).size!==manuscript.length||
          value.sections.some(s=>!record(s)||!byId.has(s.id)||!['page','continuous'].includes(s.startOn))||
          manuscript.some(s=>!['page','continuous'].includes(s.startOn)))fail('PAGE','Unsupported section order or start');
        const originalNodes=new Map(summary.sections.map((s,i)=>[s.id,seq.items[i]]));
        let i=0;
        seq.items=summary.sections.map(s=>{
          if(!s.editable)return originalNodes.get(s.id);
          const v=value.sections[i++],node=originalNodes.get(v.id);
          // Preserve all other section fields and fixed non-manuscript positions.
          if(byId.get(v.id).startOn!==v.startOn)node.set('startOn',v.startOn);
          return node;
        });
        doc.setIn(['page','size'],value.page.size);
        doc.setIn(['page','firstInteriorSide'],value.page.firstSide);
        for(const k of ['top','bottom','inner','outer'])doc.setIn(['page','margin',k],marginString(value.page.margin[k]));
        const info=sourceInfo(old.bytes);if(!info.editable)fail('FORMAT','Mixed manifest line endings are read-only');
        const raw=doc.toString().replace(/\n/g,info.eol),bytes=Buffer.from((info.bom?'\uFEFF':'')+raw,'utf8');
        if(bytes.length>MAX_MANIFEST)fail('INPUT','Manifest too large');
        const next=parseManifest(decode(bytes));if(!next.pageSettings)fail('PAGE','Invalid resulting page settings');
        if(bytes.equals(old.bytes))return settingsView();
        temp=join(root,'.bookcreator-'+randomUUID()+'.tmp');
        const f=await open(temp,'wx',old.mode);
        try{await f.writeFile(bytes);await f.chmod(old.mode);await f.sync();}finally{await f.close();}
        await checkManifest();await rename(temp,manifest);temp=undefined;
        summary=next;manifestHash=hash(bytes);return settingsView();
      }finally{if(temp)await unlink(temp).catch(()=>{});busy=false;}
    },
    async images(){await checkManifest();return imageStore.list();},
    async image(id){await checkManifest();return imageStore.read(id);},
    async importImage(path){if(busy)fail('BUSY','Another write is in progress');busy=true;try{await checkManifest();return await imageStore.add(path);}finally{busy=false;}},
    async fonts(includeBytes=false){await checkManifest();return fontStore.list({includeBytes});},
    async importFont(path,rights){if(busy)fail('BUSY','Another write is in progress');busy=true;try{await checkManifest();return await fontStore.add(path,rights);}finally{busy=false;}},
    async typography(){await checkManifest();return publicTheme(await readTheme());},
    async saveTypography(expectedRevision,roles){
      if(busy)fail('BUSY','Another write is in progress');
      if(typeof expectedRevision!=='string'||!/^[a-f0-9]{64}$/.test(expectedRevision))fail('INPUT','Invalid theme revision');
      busy=true;let temp;
      try{
        await checkManifest();const value=checkedRoles(roles,await fontStore.list());const t=await readTheme();
        if(!t.editable||t.revision!==expectedRevision)fail('CONFLICT','Theme changed or is not editable; changes were not saved');
        if(JSON.stringify(t.roles)===JSON.stringify(value))return publicTheme(t);
        // Edit only the recognized subtree; YAML formatting may be normalized on serialization.
        t.doc.set('typography',{schemaVersion:1,roles:value});
        const info=sourceInfo(t.bytes);
        if(!info.editable)fail('FORMAT','Mixed theme line endings are read-only');
        const bytes=Buffer.from((info.bom?'\uFEFF':'')+t.doc.toString().replace(/\n/g,info.eol),'utf8');
        if(bytes.length>MAX_MANIFEST)fail('INPUT','Theme too large');
        temp=join(dirname(t.path),'.bookcreator-'+randomUUID()+'.tmp');
        const f=await open(temp,'wx',t.mode);
        try{await f.writeFile(bytes);await f.chmod(t.mode);await f.sync();}finally{await f.close();}
        await checkManifest();const current=await readTheme();
        if(!current.editable||current.path!==t.path||current.revision!==expectedRevision)fail('CONFLICT','Theme changed before replacement');
        await rename(temp,t.path);temp=undefined;
        return {...publicTheme(t),roles:value,revision:hash(bytes)};
      }finally{if(temp)await unlink(temp).catch(()=>{});busy=false;}
    },
    async changeComponentLibrary(expectedRevision,action){
      if(busy)fail('BUSY','Another write is in progress');
      if(!record(action)||!['add','rename','replace','delete'].includes(action.type))fail('INPUT','Invalid library operation');
      const keys=action.type==='add'?['type','name','design',...(Object.hasOwn(action,'usage')?['usage']:[])]:action.type==='rename'?['type','id','name']:action.type==='replace'?['type','id','design']:['type','id'];
      if(Object.keys(action).length!==keys.length||!keys.every(k=>Object.hasOwn(action,k)))fail('INPUT','Invalid library operation fields');
      busy=true;let temp;
      try{
        await checkManifest();const t=await readTheme();
        if(!t.editable||!t.libraryEditable||t.revision!==expectedRevision)fail('CONFLICT','Theme or library changed or unsupported');
        const entries=structuredClone(t.library.entries);let checkManuscripts=false;
        if(action.type==='add'){
          const usage=Object.hasOwn(action,'usage')?action.usage:'heading';
          if(!['heading','paragraph','study'].includes(usage))fail('INPUT','Unsupported component usage');
          entries.push({id:'component-'+randomUUID(),name:action.name,usage,design:validateComponentDesign(action.design,usage)});
        }
        else{
          const i=entries.findIndex(e=>e.id===action.id);if(i<0)fail('INPUT','Component not found');
          if(action.type==='delete'){
            if(!t.componentEditable||!t.paragraphEditable||!t.studyEditable||Object.values(t.bindings).includes(action.id)||t.paragraphBinding===action.id||Object.values(t.studyBindings).includes(action.id))fail('THEME','Cannot delete a referenced component or one with unresolved bindings');
            checkManuscripts=entries[i].usage==='study';
            if(checkManuscripts)await assertNoManuscriptReference(action.id);
            entries.splice(i,1);
          }
          else if(action.type==='rename')entries[i].name=action.name;
          else entries[i].design=validateComponentDesign(action.design,entries[i].usage);
        }
        const library=validateComponentLibrary({schemaVersion:entries.some(e=>e.usage==='study')?3:entries.some(e=>e.usage==='paragraph')?2:1,entries});
        if(action.type==='add'||action.type==='replace'){
          const design=action.type==='add'?library.entries.at(-1).design:library.entries.find(e=>e.id===action.id).design;
          checkComponentFonts(design,await fontStore.list());await checkComponentImages([design],imageStore);
        }
        if(action.type==='replace'&&Object.values(t.bindings).includes(action.id)){
          if(!t.componentEditable)fail('THEME','Shared heading bindings are unsupported');
          const resolved=resolveHeadingBindings(t.localHeading,t.localLevels,t.bindings,library);
          for(const design of [resolved.headingDesign,...Object.values(resolved.headingLevels)].filter(Boolean))checkComponentFonts(design,await fontStore.list());
          await checkComponentImages([resolved.headingDesign,...Object.values(resolved.headingLevels)],imageStore);
        }
        if(action.type==='replace'&&t.paragraphBinding===action.id){
          if(!t.paragraphEditable)fail('THEME','Shared paragraph binding unsupported');
          const resolved=resolveParagraphBinding({schemaVersion:2,componentId:action.id},library);
          checkComponentFonts(resolved.paragraphDesign,await fontStore.list());
        }
        if(action.type==='replace'&&Object.values(t.studyBindings).includes(action.id)){
          if(!t.studyEditable)fail('THEME','Shared study bindings unsupported');
          const resolved=resolveStudyDesigns(t.doc.toJS({maxAliasCount:0}).previewStudy,library);
          for(const design of Object.values(resolved.studyDesigns))checkComponentFonts(design,await fontStore.list());
          await checkComponentImages(Object.values(resolved.studyDesigns),imageStore);
        }
        if(JSON.stringify(library)===JSON.stringify(t.library))return publicTheme(t);
        t.doc.set('previewComponentLibrary',library);
        const info=sourceInfo(t.bytes);if(!info.editable)fail('FORMAT','Mixed theme line endings are read-only');
        const bytes=Buffer.from((info.bom?'\uFEFF':'')+t.doc.toString().replace(/\n/g,info.eol),'utf8');
        if(bytes.length>MAX_MANIFEST)fail('INPUT','Theme too large');
        // Refuse a write that the bounded YAML reader cannot subsequently reopen.
        validateComponentLibrary(safeYaml(decode(bytes)).toJS({maxAliasCount:0}).previewComponentLibrary);
        temp=join(dirname(t.path),'.bookcreator-'+randomUUID()+'.tmp');
        const f=await open(temp,'wx',t.mode);
        try{await f.writeFile(bytes);await f.chmod(t.mode);await f.sync();}finally{await f.close();}
        await checkManifest();const current=await readTheme();
        if(!current.editable||!current.libraryEditable||current.path!==t.path||current.revision!==expectedRevision)fail('CONFLICT','Theme changed before replacement');
        if(checkManuscripts)await assertNoManuscriptReference(action.id);
        await rename(temp,t.path);temp=undefined;
        return publicTheme(await readTheme());
      }finally{if(temp)await unlink(temp).catch(()=>{});busy=false;}
    },
    async saveStudyDesign(expectedRevision,value,kind){
      if(busy)fail('BUSY','Another write is in progress');
      if(!studyKinds.includes(kind))fail('INPUT','Unknown study kind');
      const reference=record(value)&&Object.keys(value).length===1&&Object.hasOwn(value,'componentId');
      const design=value===null||reference?null:validateComponentDesign(value,'study');busy=true;let temp;
      try{
        await checkManifest();const t=await readTheme();
        if(!t.editable||!t.studyEditable||t.revision!==expectedRevision)fail('CONFLICT','Theme changed or study format unsupported');
        if(reference&&!t.libraryEditable)fail('THEME','Library unavailable');
        const kinds={...(t.doc.toJS({maxAliasCount:0}).previewStudy?.kinds??{})};
        if(reference)kinds[kind]={componentId:value.componentId};else if(design)kinds[kind]=design;else delete kinds[kind];
        const registry={schemaVersion:1,kinds},resolved=resolveStudyDesigns(registry,t.library);
        for(const d of Object.values(resolved.studyDesigns))checkComponentFonts(d,await fontStore.list());
        await checkComponentImages(Object.values(resolved.studyDesigns),imageStore);
        if(Object.keys(kinds).length)t.doc.set('previewStudy',registry);else t.doc.delete('previewStudy');
        const info=sourceInfo(t.bytes);if(!info.editable)fail('FORMAT','Mixed theme line endings are read-only');
        const bytes=Buffer.from((info.bom?'\uFEFF':'')+t.doc.toString().replace(/\n/g,info.eol),'utf8');
        if(bytes.length>MAX_MANIFEST)fail('INPUT','Theme too large');safeYaml(decode(bytes));
        temp=join(dirname(t.path),'.bookcreator-'+randomUUID()+'.tmp');
        const f=await open(temp,'wx',t.mode);
        try{await f.writeFile(bytes);await f.chmod(t.mode);await f.sync();}finally{await f.close();}
        await checkManifest();const current=await readTheme();
        if(!current.editable||!current.studyEditable||current.path!==t.path||current.revision!==expectedRevision)fail('CONFLICT','Theme changed before replacement');
        await rename(temp,t.path);temp=undefined;return publicTheme(await readTheme());
      }finally{if(temp)await unlink(temp).catch(()=>{});busy=false;}
    },
    async saveParagraphDesign(expectedRevision,value){
      if(busy)fail('BUSY','Another write is in progress');
      const reference=record(value)&&Object.keys(value).length===1&&Object.hasOwn(value,'componentId');
      const design=value===null||reference?null:validateParagraphDesign(value);busy=true;let temp;
      try{
        await checkManifest();const t=await readTheme();
        if(!t.editable||!t.paragraphEditable||t.revision!==expectedRevision)fail('CONFLICT','Theme changed or paragraph format unsupported');
        if(design)checkComponentFonts(design,await fontStore.list());
        if(reference){
          if(!t.libraryEditable)fail('THEME','Library unavailable');
          const ref={schemaVersion:2,componentId:value.componentId};
          const resolved=resolveParagraphBinding(ref,t.library);
          checkComponentFonts(resolved.paragraphDesign,await fontStore.list());
          t.doc.set('previewParagraph',ref);
        }else if(design)t.doc.set('previewParagraph',design);else t.doc.delete('previewParagraph');
        const info=sourceInfo(t.bytes);if(!info.editable)fail('FORMAT','Mixed theme line endings are read-only');
        const bytes=Buffer.from((info.bom?'\uFEFF':'')+t.doc.toString().replace(/\n/g,info.eol),'utf8');
        if(bytes.length>MAX_MANIFEST)fail('INPUT','Theme too large');safeYaml(decode(bytes));
        temp=join(dirname(t.path),'.bookcreator-'+randomUUID()+'.tmp');
        const f=await open(temp,'wx',t.mode);
        try{await f.writeFile(bytes);await f.chmod(t.mode);await f.sync();}finally{await f.close();}
        await checkManifest();const current=await readTheme();
        if(!current.editable||!current.paragraphEditable||current.path!==t.path||current.revision!==expectedRevision)fail('CONFLICT','Theme changed before replacement');
        await rename(temp,t.path);temp=undefined;return publicTheme(await readTheme());
      }finally{if(temp)await unlink(temp).catch(()=>{});busy=false;}
    },
    async saveHeadingDesign(expectedRevision,value,level='default'){
      if(busy)fail('BUSY','Another write is in progress');
      if(!['default','1','2','3','4','5','6'].includes(level))fail('THEME','Invalid heading level');
      const reference=record(value)&&Object.keys(value).length===1&&Object.hasOwn(value,'componentId');
      const design=value===null||reference?null:validateHeadingDesign(value);
      const ref=reference?validateHeadingBindings({[level]:value.componentId})[level]:null;
      busy=true;let temp;
      try{
        await checkManifest();const t=await readTheme();
        if(!t.editable||!t.componentEditable||t.revision!==expectedRevision)fail('CONFLICT','Theme changed or component format unsupported');
        if(design)checkComponentFonts(design,await fontStore.list());
        if(ref&&!t.libraryEditable)fail('THEME','Library unavailable');
        const heading=level==='default'?design:t.localHeading,levels={...t.localLevels},bindings={...t.bindings};
        if(level!=='default'){if(design)levels[level]=design;else delete levels[level];}
        if(ref)bindings[level]=ref;else delete bindings[level];
        const resolved=resolveHeadingBindings(heading,levels,bindings,t.library);
        for(const d of [resolved.headingDesign,...Object.values(resolved.headingLevels)].filter(Boolean))checkComponentFonts(d,await fontStore.list());
        await checkComponentImages([resolved.headingDesign,...Object.values(resolved.headingLevels)],imageStore);
        t.doc.set('previewComponents',Object.keys(bindings).length?{schemaVersion:3,heading,levels,bindings}:{schemaVersion:2,heading,levels});
        const info=sourceInfo(t.bytes);if(!info.editable)fail('FORMAT','Mixed theme line endings are read-only');
        const bytes=Buffer.from((info.bom?'\uFEFF':'')+t.doc.toString().replace(/\n/g,info.eol),'utf8');
        if(bytes.length>MAX_MANIFEST)fail('INPUT','Theme too large');
        safeYaml(decode(bytes));
        temp=join(dirname(t.path),'.bookcreator-'+randomUUID()+'.tmp');
        const f=await open(temp,'wx',t.mode);
        try{await f.writeFile(bytes);await f.chmod(t.mode);await f.sync();}finally{await f.close();}
        await checkManifest();const current=await readTheme();
        if(!current.editable||!current.componentEditable||current.path!==t.path||current.revision!==expectedRevision)fail('CONFLICT','Theme changed before replacement');
        await rename(temp,t.path);temp=undefined;
        return publicTheme(await readTheme());
      }finally{if(temp)await unlink(temp).catch(()=>{});busy=false;}
    },
    async read(id){
      await checkManifest();
      const r=await current(id);
      return {id,text:r.info.text,revision:r.revision,editable:r.info.editable};
    },
    async save(id,expectedRevision,text){
      if(busy)fail('BUSY','Another write is in progress');
      if(typeof text!=='string'||text.length>MAX_SOURCE||/\r|[\p{Cs}\u0000]/u.test(text)||typeof expectedRevision!=='string'||!/^[a-f0-9]{64}$/.test(expectedRevision))fail('INPUT','Invalid save request');
      busy=true;let temp;
      try{
        await checkManifest();
        const r=await current(id);
        if(r.revision!==expectedRevision)fail('CONFLICT','Manuscript changed externally; your edits were not saved');
        if(!r.info.editable)fail('FORMAT','Mixed or legacy line endings are read-only in this PoC');
        const bytes=Buffer.from((r.info.bom?'\uFEFF':'')+text.replace(/\n/g,r.info.eol),'utf8');
        if(bytes.length>MAX_SOURCE)fail('INPUT','Manuscript too large');
        if(bytes.equals(r.bytes))return {id,revision:r.revision};
        temp=join(dirname(r.f.path),'.bookcreator-'+randomUUID()+'.tmp');
        const handle=await open(temp,'wx',r.mode);
        try{await handle.writeFile(bytes);await handle.chmod(r.mode);await handle.sync();}finally{await handle.close();}
        await checkManifest();
        const before=await current(id);
        if(before.revision!==expectedRevision)fail('CONFLICT','Manuscript changed before replacement');
        await rename(temp,r.f.path);temp=undefined;
        return {id,revision:hash(bytes)};
      }finally{if(temp)await unlink(temp).catch(()=>{});busy=false;}
    }
  };
}
