// Platform-neutral release gate; UI/BCM/Engine integrations follow the PoCs.
export const requiredPreviewChecks = ['source-editing','gui-editing','component-editor','local-save','basic-layout','html-preview','pdf-export','source-preservation','security','license-review'] as const;
export type PreviewCheck = typeof requiredPreviewChecks[number];
export type CheckStatus = 'not-run'|'pass'|'fail'|'blocked';
export function assessPreview(checks: Partial<Record<PreviewCheck,CheckStatus>>) {
  const missing = requiredPreviewChecks.filter(key => checks[key] !== 'pass');
  return { ready: missing.length === 0, missing };
}
export interface DocumentSnapshot { readonly documentId: string; readonly revision: number; readonly source: string }
export interface SourceEdit { readonly start: number; readonly end: number; readonly expected: string; readonly replacement: string }
// A host supplies the BCM patch implementation; no duplicate parser or patch engine.
export type PatchAdapter = (source: string, edits: readonly SourceEdit[]) => string;
export function editDocument(snapshot: DocumentSnapshot, expectedRevision: number, edits: readonly SourceEdit[], apply: PatchAdapter): DocumentSnapshot {
  if (snapshot.revision !== expectedRevision) throw new Error('Stale document revision');
  const source = apply(snapshot.source, edits);
  if (source === snapshot.source) return snapshot;
  if (!Number.isSafeInteger(snapshot.revision + 1)) throw new RangeError('Revision overflow');
  return Object.freeze({ ...snapshot, source, revision: snapshot.revision + 1 });
}
export interface LayoutTicket { readonly revision: string; readonly fingerprint: string; readonly completeness: 'full'|'partial'; readonly publicationReady?: boolean }
export function canAcceptLayout(current: Pick<LayoutTicket,'revision'|'fingerprint'>, result: LayoutTicket): boolean {
  return current.revision === result.revision && current.fingerprint === result.fingerprint;
}
export function canReviewLayout(current: Pick<LayoutTicket,'revision'|'fingerprint'>, result: LayoutTicket): boolean {
  return canAcceptLayout(current,result) && result.completeness === 'full' && result.publicationReady === true;
}
export {compileMeasuredManuscript, type Manuscript, type SemanticItem} from './manuscript-poc.js';
