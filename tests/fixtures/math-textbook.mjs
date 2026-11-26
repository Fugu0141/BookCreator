// Original, compact Japanese mathematics reference book. Shared by node and Chrome.
export const componentId='component-00000000-0000-4000-8000-000000000001';
export const makeLibrary=defaultHeadingDesign=>({schemaVersion:3,entries:[{id:componentId,name:'例題・ヒント',usage:'study',design:{...defaultHeadingDesign(),direction:'column',children:[{id:'content',type:'content'},{id:'hint',type:'slot',name:'hint',width:'fill',fontSize:3500,lineHeight:1.5,color:'#123456'}]}}]});
export const typography={body:{fontFamily:'serif',fontWeight:400},heading:{fontFamily:'sans-serif',fontWeight:700},mathFontFamily:'BCFont_STIXTwoMath'};
export const size={width:140000,height:180000};
export const formulas={
  quadratic:'x^2-5x+6=0',
  factor:'(x-2)(x-3)=0',
  discriminant:'D=b^2-4ac',
  derivative:'\\lim_{h\\to0}\\frac{f(x+h)-f(x)}{h}',
  aligned:['\\begin{aligned}','f(x)&=x^2 \\\\','f\'(x)&=2x','\\end{aligned}'],
  cases:'\\begin{cases}x&x\\geq0\\\\-x&x<0\\end{cases}',
  matrix:'\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}',
};
const ref=(id,format='label-number')=>':ref{target="'+id+'" format="'+format+'"}';
const wrap=(id,formula,numbered=true)=>[':::layout{#'+id+' numbered="'+numbered+'"}','$$',...Array.isArray(formula)?formula:[formula],'$$',':::'];
export function makeMathTextbook(nl='\n'){
  const docs=[
    ['quadratic',[
      '# 二次方程式','','**係数** $a\\ne0$ のとき、二次方程式を考える。','','次章の定義は '+ref('eq-derivative')+' を参照。',
      '',...wrap('eq-quadratic',formulas.quadratic),'',
      ':::::component{#example-quadratic name="'+componentId+'"}',
      '::::slot{name="hint"}','判別式の定義。','',...wrap('eq-discriminant',formulas.discriminant),'::::','',
      '::::slot{name="content"}','式 '+ref('eq-quadratic','number')+' を因数分解する。','',...wrap('eq-factor',formulas.factor),'','解は $x=2$ または $x=3$。','::::',':::::','',
      '確認：'+ref('eq-factor')+' と '+ref('eq-discriminant')+'。','']],
    ['calculus',[
      '# 微分','','前章の '+ref('eq-quadratic')+' から関数を考える。','','...独立式の定義。','',...wrap('eq-derivative',formulas.derivative),'',
      '::::callout{kind="note"}','途中式：','',...wrap('eq-aligned',formulas.aligned),'','式 '+ref('eq-derivative','number')+' を用いた。','::::','',
      '絶対値の定義：','',...wrap('eq-cases',formulas.cases,false),'']],
    ['appendix',[
      '行列の例。','','...参考：'+ref('eq-aligned')+'。','',...wrap('eq-matrix',formulas.matrix),'',
      '式 '+ref('eq-matrix','number')+' を確認する。','']]
  ];
  return docs.map(([documentId,lines])=>({documentId,revision:'1',source:lines.join(nl),startOn:'page'}));
}
export const expectedNumbers=[['eq-quadratic','1.1'],['eq-discriminant','1.2'],['eq-factor','1.3'],['eq-derivative','2.1'],['eq-aligned','2.2'],['eq-matrix','3.1']];
