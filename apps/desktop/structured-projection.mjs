import {projectBlocks} from './structured-blocks.mjs';
import {projectStudy} from './structured-study.mjs';
import {projectEquation} from './structured-equation.mjs';

// Reuse exactly one full-document scan for a read-only editor projection.
// Fragment scans still use the normal scanner; never reuse this snapshot
// for a different source or for subsequent edit validation.
export function projectStructuredEditor(source,scan,parseInline){
  const snapshot=scan(source);
  const scopedScan=value=>value===source?snapshot:scan(value);
  const result=projectBlocks(source,scopedScan,parseInline);
  if(!result.diagnostics.length){
    for(const row of result.rows){
      if(row.kind!=='directive')continue;
      row.study=projectStudy(source,snapshot.blocks[row.index]);
      row.equation=projectEquation(source,row,scopedScan);
    }
  }
  return result;
}
