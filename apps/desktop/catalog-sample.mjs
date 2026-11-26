// Build a disposable catalog sample using the same Core component compilers.
// No project writes, editor state or DOM access.
export function catalogSampleOptions(card,{typography,width,height,revision},core){
  const {category,design,sample,registered,key,name}=card;
  let compiled;
  const context={'chapter-number':'1','chapter-title':'はじめに','heading-number':key==='heading-default'||registered?'1':'1.'+key.slice(8),'heading-title':sample,'heading-level':registered||key==='heading-default'?'1':key.slice(8)};
  if(category==='heading'&&design)compiled=core.compileHeadingDesign(design,typography.heading,context);
  else if(category==='paragraph'&&design)compiled=core.compileParagraphDesign(design,typography.body);
  else if(category==='study'){
    const number={chapter:1,index:1,sequence:1},answer={number,kind:'練習問題',title:'基本計算'};
    compiled=registered?core.compileCustomStudyBlock({id:key.slice(11),name,usage:'study',design},'サンプル',typography.body,number,answer):core.compileStudyBlock(key.slice(6),undefined,typography.body,design,number,answer);
  }
  let component=compiled?.component,namedSlots=[];
  if(compiled&&category==='study'&&design){
    ({component,namedSlots}=core.resolveNamedSlotPresence(compiled,core.namedSlotDefinitions(design).map(({name})=>({name,text:'追加の原稿サンプルです。'}))));
  }
  const request={text:sample,width,fontSize:compiled?.fontSize??(category==='heading'?6500:4200),lineHeight:compiled?.lineHeight??1.8,...(compiled?.textStyle??(category==='heading'?typography.heading:typography.body)),...core.multilineTextOptions(sample,compiled?.paragraphGap),...(typography.mathFontFamily?{mathFontFamily:typography.mathFontFamily}:{})};
  return {revision,fingerprint:'catalog-'+revision+'-'+key,width,height,blocks:[{origin:{documentId:'catalog',revision,blockKey:key},request,splitPolicy:category==='paragraph'?'allow':'strict',...(component?{component}:{}),...(namedSlots.length?{namedSlots}:{})}]};
}
