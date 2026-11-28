import {createPreparationService} from './preview-preparation-service.mjs';
import {createInlineParseSession,createManuscriptScanSession,prepareBookBrowserPreview} from '../../dist/index.js';
import {scanDocument,scanDocumentIncremental,validateScannedBlocks,indexBlockIds,parseReferenceToken} from '../../../BookCreator_Markdown/dist/index.js';
import {parsePreviewMath,parseDisplayMath} from '../../../BookCreator_LayoutEngine/dist/index.js';
const deps={scan:scanDocument,validate:validateScannedBlocks,index:indexBlockIds,validateDisplayMath:parseDisplayMath,validateInlineMath:parsePreviewMath,parseReference:parseReferenceToken};
const service=createPreparationService({prepare:prepareBookBrowserPreview,deps,createScanSession:()=>createManuscriptScanSession({scan:scanDocument,scanIncremental:scanDocumentIncremental}),createInlineSession:createInlineParseSession});
self.onmessage=event=>self.postMessage(service.handle(event.data));
