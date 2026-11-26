// Experimental print projection only: never sets publicationReady or writes files.
export interface TrialPrintTicket {
  readonly revision:string;
  readonly fingerprint:string;
}
export interface TrialPrintPlan extends TrialPrintTicket {
  readonly completeness:'full'|'partial';
  readonly publicationReady:false;
  readonly pages:readonly {readonly index:number}[];
  readonly diagnostics:readonly {readonly severity:string}[];
}
export interface TrialPaper {readonly width:number;readonly height:number}
export function assertTrialPrintPlan(current:TrialPrintTicket,plan:TrialPrintPlan,paper:TrialPaper){
  if(!current.revision||!current.fingerprint||plan.revision!==current.revision||plan.fingerprint!==current.fingerprint)throw RangeError('Stale trial print plan');
  if(plan.completeness!=='full'||plan.publicationReady!==false||plan.diagnostics.some(d=>d.severity==='error'))throw RangeError('Trial print requires a complete experimental plan without errors');
  if(!plan.pages.length||plan.pages.length>512||plan.pages.some((p,i)=>p.index!==i))throw RangeError('Invalid trial print page sequence');
  if(![paper.width,paper.height].every(n=>Number.isSafeInteger(n)&&n>=30000&&n<=300000))throw RangeError('Unsupported trial paper dimensions');
}
export function trialPrintStyles(paper:TrialPaper){
  if(![paper.width,paper.height].every(n=>Number.isSafeInteger(n)&&n>=30000&&n<=300000))throw RangeError('Unsupported trial paper dimensions');
  return '@page{size:'+paper.width/1000+'mm '+paper.height/1000+'mm;margin:0}html,body{margin:0;padding:0;background:white}';
}
/** Consume a freshly rendered, detached preview in an isolated print document.
 * The engine owns page geometry; never scale or repaginate content here. */
export function prepareTrialPrint(current:TrialPrintTicket,preview:{element:HTMLElement;plan:TrialPrintPlan;publicationReady:false},paper:TrialPaper){
  assertTrialPrintPlan(current,preview.plan,paper);
  if(preview.publicationReady!==false||preview.element.isConnected)throw RangeError('Expected a detached experimental preview');
  const root=preview.element.shadowRoot;
  if(!root)throw RangeError('Missing preview page root');
  const pages=Array.from(root.children);
  const matches=(value:string,um:number)=>/^\d+(?:\.\d+)?px$/.test(value)&&Math.abs(Number.parseFloat(value)-um*96/25400)<0.1;
  // Validate everything before changing any DOM styling.
  if(pages.length!==preview.plan.pages.length||pages.some((p,i)=>{
    const page=p as HTMLElement;
    return p.localName!=='div'||page.dataset.page!==String(i)||!matches(page.style.width,paper.width)||!matches(page.style.height,paper.height);
  }))throw RangeError('Print pages do not match measured paper geometry');
  for(const [i,p] of pages.entries()){
    const page=p as HTMLElement;
    Object.assign(page.style,{border:'0',margin:'0',breakInside:'avoid',breakAfter:i===pages.length-1?'auto':'page',printColorAdjust:'exact',webkitPrintColorAdjust:'exact'});
    for(const guide of page.querySelectorAll<HTMLElement>(':scope > [data-content-guide]'))guide.style.display='none';
  }
  return {element:preview.element,css:trialPrintStyles(paper),pageCount:pages.length,publicationReady:false as const};
}
