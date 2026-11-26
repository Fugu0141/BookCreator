// Pure preparation boundary: no React, DOM, IPC, or persistence.
export function describeLayoutInput({whole,file,raw,page,savedSettings,typography,theme,fonts,order,job,bundledFingerprint},{paperGeometry,hasDynamicLabels,hasStudyNumbering}){
  const noto='BCFont_NotoSansJP',stix='BCFont_STIXTwoMath';
  if(theme?.componentMessage||theme?.paragraphMessage||theme?.studyMessage)throw Error('部品定義が未対応です: '+(theme.componentMessage??theme.paragraphMessage??theme.studyMessage));
  if(!page)throw Error(savedSettings?.message??'用紙設定が未対応です。');
  const geometry=paperGeometry(page);
  if([typography.body,typography.heading].some(v=>v.fontFamily.startsWith('BCFont_')&&v.fontFamily!==noto&&!fonts.some(f=>f.alias===v.fontFamily&&f.loaded)))throw Error('登録フォントを読み込めません。');
  if(typography.mathFontFamily&&typography.mathFontFamily!==stix&&!fonts.some(f=>f.alias===typography.mathFontFamily&&f.loaded&&f.hasMathTable&&f.weight===400))throw Error('登録数式フォントを読み込めません。');
  const rev=String(job),fingerprint='desktop-poc-'+job+'-'+bundledFingerprint+'-'+JSON.stringify(typography)+'-'+fonts.map(f=>f.sha256).join(',')+'-'+JSON.stringify({page,order,headingDesign:theme?.headingDesign,headingLevels:theme?.headingLevels,paragraphDesign:theme?.paragraphDesign,studyDesigns:theme?.studyDesigns,library:theme?.library});
  const needsContext=raw.includes(':ref{')||/:::layout\{/.test(raw)||raw.includes('answer-to')||hasDynamicLabels(theme?.headingDesign)||Object.values(theme?.headingLevels??{}).some(hasDynamicLabels)||Object.values(theme?.studyDesigns??{}).some(hasStudyNumbering)||(theme?.library?.entries??[]).some(e=>e.usage==='study'&&hasStudyNumbering(e.design));
  return {whole,file,raw,typography,theme,fonts,order,geometry,rev,fingerprint,needsContext};
}

export function collectLayoutDocuments(input,snapshot){
  const {whole,needsContext,order,file,raw,rev}=input;
  let documents;
  if(whole||needsContext){
    const byId=new Map(snapshot.map(d=>[d.documentId,d]));
    documents=order.map(s=>{
      const d=byId.get(s.id);if(!d)throw Error('原稿構成が変わりました。');
      if(file?.id===s.id&&file.revision!==d.revision)throw Error('原稿が外部変更されました。再読込してください。');
      return {...d,startOn:s.startOn,...(file?.id===s.id?{source:raw,revision:rev}:{})};
    });
  }else{
    const section=order.find(s=>s.id===file.id);
    if(!section||!['page','continuous'].includes(section.startOn))throw Error('このセクションの開始面はプレビュー未対応です。');
    documents=[{documentId:file.id,revision:rev,source:raw,startOn:section.startOn}];
  }
  return documents;
}

export function prepareLayoutOptions(input,documents,prepareBookBrowserPreview,deps){
  const {whole,needsContext,file,theme,rev,fingerprint,geometry,typography}=input;
  for(const [id,message] of Object.entries(theme?.studyResourceErrors??{}))if(documents.some(d=>d.source.includes(id)))throw Error('登録部品の素材が利用できません: '+message);
  const prepared=prepareBookBrowserPreview(documents,rev,fingerprint,geometry.content,deps,typography,theme?.headingDesign,theme?.headingLevels,theme?.paragraphDesign,theme?.studyDesigns,theme?.library);
  const options=prepared.options&&!whole&&needsContext?{...prepared.options,sections:prepared.options.sections.filter(s=>s.id===file.id)}:prepared.options;
  return {options,diagnostics:prepared.diagnostics};
}

// Mirror the pinned engine's current block ceiling before entering the physical
// measurement lane. Keep the engine's validation authoritative.
export const PREVIEW_BLOCK_LIMIT=128;
export function validateLayoutOptions(options,fonts){
  const count=options.sections.reduce((sum,section)=>sum+section.blocks.length,0);
  if(count>PREVIEW_BLOCK_LIMIT)throw Object.assign(Error('現在の実測組版上限は '+PREVIEW_BLOCK_LIMIT+' ブロックです（今回 '+count+'）。選択原稿を小さく分けて確認してください。大規模組版は今後対応予定です。'),{code:'PREVIEW_BLOCK_LIMIT'});
  const noto='BCFont_NotoSansJP';
  for(const section of options.sections)for(const block of section.blocks){
    if('kind' in block)continue;
    for(const request of [block.request,...(block.namedSlots??[]).map(s=>s.request)])for(const run of request.inlineStyles??[]){
      const family=run.fontFamily??request.fontFamily,weight=run.fontWeight??request.fontWeight;
      if(family.startsWith('BCFont_')&&family!==noto&&!fonts.some(f=>f.alias===family&&f.loaded&&f.weight===weight))throw Error('インライン書式の登録フォントまたは指定ウェイトを利用できません。');
    }
  }
}
