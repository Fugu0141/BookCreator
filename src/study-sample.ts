import {prepareManuscript,createEquationResolver,type Scan,type PreparationDependencies} from './manuscript-poc.js';
import {parsePreviewInline,previewSampleInline} from './inline-preview.js';
import {validNamedSlot} from './preview-component.js';

interface SampleSlot {name:string;text:string}
const sampleId='component-00000000-0000-4000-8000-000000000001';

/** Disposable manuscript context. Primary sample precedes visible named slots
 * in the supplied order, independent of the component's visual arrangement.
 * No sample ID, reference, or source range is persisted in the theme. */
export function previewStudySamples<S extends Scan>(primary:string,slots:readonly SampleSlot[],bcm:boolean,deps:PreparationDependencies<S>){
  if(typeof primary!=='string'||primary.length>10000||slots.length>8||slots.some(s=>!validNamedSlot(s.name)||typeof s.text!=='string'||s.text.length>10000)||new Set(slots.map(s=>s.name)).size!==slots.length)throw RangeError('Invalid study samples');
  const samples=[{name:'content',text:primary},...slots];
  const project=(p:ReturnType<typeof parsePreviewInline>)=>({text:p.text,...(p.inlineStyles.length?{inlineStyles:p.inlineStyles}:{}),...(p.inlineMath.length?{inlineMath:p.inlineMath}:{})});
  if(!bcm)return samples.map(s=>({name:s.name,request:{text:s.text}}));
  if(!deps.validateInlineMath||!deps.validateDisplayMath)throw RangeError('Math validator unavailable');
  // Preserve the existing lightweight parser for samples without layout/reference markup.
  if(!samples.some(s=>/(?:^|\n):{3,}layout\{|:ref\{/.test(s.text)))return samples.map(s=>({name:s.name,request:previewSampleInline(s.text,true,deps.validateInlineMath!,true,deps.validateDisplayMath)}));
  // A real scanner and semantic compiler own the wrapper syntax, IDs and numbering.
  // Fixed enclosing fences permit ordinary three-colon layout wrappers only.
  let source=':::::component{name="'+sampleId+'"}\n';
  const ranges=samples.map(s=>{
    source+='::::slot{name="'+s.name+'"}\n';
    const start=source.length;
    source+=s.text;
    const end=source.length;
    source+=(s.text.endsWith('\n')?'':'\n')+'::::\n\n';
    return {...s,start,end};
  });
  source+=':::::\n';
  const documentId='lab-sample',doc={documentId,revision:'1',source,startOn:'page' as const};
  const prepared=prepareManuscript([doc],'1','lab-sample',{width:100000,height:100000},deps);
  if(!prepared.input||prepared.items.length!==1||prepared.items[0].kind!=='study')throw RangeError('Invalid numbered study sample: '+prepared.diagnostics.map(d=>d.message).join('; '));
  const item=prepared.items[0],actual=[{name:'content',text:item.text,start:item.sourceTextStart},...(item.namedSlots??[]).map(s=>({name:s.name,text:s.text,start:s.sourceTextStart}))];
  if(item.componentId!==sampleId||item.origin.range.start!==0||item.origin.range.end!==source.length||actual.length!==ranges.length)throw RangeError('Sample cannot change enclosing component structure');
  const resolver=createEquationResolver(prepared.items,deps,documentId);
  return ranges.map((s,i)=>{
    const a=actual[i];
    // The compiler discards outer blank lines; check exact interior ownership
    // before parsing the original sample (including its own line endings).
    if(a.name!==s.name||a.start===undefined||a.start<s.start||a.start+a.text.length>s.end||source.slice(a.start,a.start+a.text.length)!==a.text||!/^[ \t\r\n]*$/.test(source.slice(s.start,a.start))||!/^[ \t\r\n]*$/.test(source.slice(a.start+a.text.length,s.end)))throw RangeError('Sample cannot change slot structure');
    return {name:s.name,request:project(parsePreviewInline(s.text,s.start,deps.validateInlineMath,resolver,true,deps.validateDisplayMath,item.componentEquations))};
  });
}
