import {createEditPreviewTracker} from './edit-preview-metrics.mjs';
import {createLayoutScheduler} from './layout-scheduler.mjs';
import {createCancelledPreviewLog} from './cancelled-preview-log.mjs';
import {createPaperDisplay} from './paper-display.mjs';
import {createLivePreviewDelay} from './live-preview-delay.mjs';

// One owner per workspace. Keep editor operation generations distinct from
// scheduler job IDs: submitting a preview does not invalidate an open draft.
export function createWorkspacePreviewLifecycle({
  editPreviewTracker=createEditPreviewTracker(),
  layoutScheduler=createLayoutScheduler(),
  cancelledPreviewLog=createCancelledPreviewLog(),
  paperDisplay=createPaperDisplay(),
  liveDelay=createLivePreviewDelay()
}={}){
  const generation={current:0};
  const pendingDiagnostic={current:null},pendingSource={current:null};
  function invalidate(){
    editPreviewTracker.reset();
    generation.current++;
    liveDelay.cancel();
    layoutScheduler.invalidate();
    pendingDiagnostic.current=null;
    pendingSource.current=null;
  }
  // The React adapter still owns visible layout state and DOM publication.
  return {generation,pendingDiagnostic,pendingSource,editPreviewTracker,layoutScheduler,cancelledPreviewLog,paperDisplay,liveDelay,invalidate};
}
