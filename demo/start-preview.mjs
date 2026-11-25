import {startPreviewServer} from './preview-server.mjs';
const server=await startPreviewServer();
console.log('BookCreator preview: http://127.0.0.1:'+server.address().port);
