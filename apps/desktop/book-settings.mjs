// Shared pure project settings subset. All resolved lengths are integer micrometres.
const PRESETS={A4:[210000,297000],A5:[148000,210000],B5:[182000,257000]}; // B5 = JIS B5
const DEFAULT={top:18000,bottom:20000,inner:23000,outer:18000};
const keys=['top','bottom','inner','outer'];
const invalid=message=>{throw Object.assign(Error(message),{code:'PAGE'});};
function length(v){
  if(typeof v!=='string')invalid('Expected physical margin length');
  const m=/^(\d+(?:\.\d+)?)(mm|pt|in)$/.exec(v);
  if(!m)invalid('Unsupported margin length');
  const n=Math.round(Number(m[1])*({mm:1000,pt:25400/72,in:25400}[m[2]]));
  if(!Number.isSafeInteger(n)||n<0||n>2000000)invalid('Invalid margin');return n;
}
export function resolvePageSettings(page){
  if(!page||typeof page!=='object'||!Object.hasOwn(PRESETS,page.size)||(page.binding??'left')!=='left'||!['right','left'].includes(page.firstInteriorSide??'right'))invalid('Unsupported page size or binding');
  if(page.margin!==undefined&&(!page.margin||typeof page.margin!=='object'||Array.isArray(page.margin)||Object.keys(page.margin).some(k=>!keys.includes(k))))invalid('Unsupported page margin');
  const margin=Object.fromEntries(keys.map(k=>[k,page.margin?.[k]===undefined?DEFAULT[k]:length(page.margin[k])]));
  const settings={size:page.size,firstSide:page.firstInteriorSide??'right',margin};
  paperGeometry(settings);return settings;
}
export function paperGeometry(s){
  if(!s||!Object.hasOwn(PRESETS,s.size)||!['right','left'].includes(s.firstSide)||!s.margin||Object.keys(s.margin).length!==4||!keys.every(k=>Number.isSafeInteger(s.margin[k])&&s.margin[k]>=0))invalid('Invalid paper settings');
  const [width,height]=PRESETS[s.size],{top,bottom,inner,outer}=s.margin;
  const content={width:width-inner-outer,height:height-top-bottom};
  if(content.width<=0||content.height<=0)invalid('Margins leave no content area');
  return {paper:{width,height,top,bottom,inner,outer,firstSide:s.firstSide},content};
}
export const marginString=n=>String(n/1000)+'mm';
