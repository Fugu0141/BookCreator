import {build} from 'esbuild';
await build({entryPoints:['renderer.jsx'],bundle:true,format:'esm',platform:'browser',target:'chrome156',outfile:'build/renderer.js',define:{'process.env.NODE_ENV':'"production"'},legalComments:'inline'});
