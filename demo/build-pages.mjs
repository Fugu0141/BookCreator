// Build only the read-only browser demo and compiled library modules.
// No project files, fonts, test PDF pages, credentials, or desktop bundle are published.
import {mkdir,readdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=join(root,'dist-pages');
await mkdir(output); // fail rather than overwrite an existing directory
const targets=[
  ['app/dist',join(root,'dist')],
  ['bcm/dist',join(root,'../BookCreator_Markdown/dist')],
  ['engine/dist',join(root,'../BookCreator_LayoutEngine/dist')],
];
for(const [target,source] of targets){
  const dest=join(output,target);
  await mkdir(dest,{recursive:true});
  const files=(await readdir(source,{withFileTypes:true})).filter(e=>e.isFile()&&/^[a-z][a-z0-9-]*\.js$/.test(e.name));
  if(!files.some(e=>e.name==='index.js'))throw Error('Missing compiled library: '+source);
  for(const file of files)await copyFile(join(source,file.name),join(dest,file.name));
}
await mkdir(join(output,'demo'));
await mkdir(join(output,'fixtures'));
const html=await readFile(join(root,'demo/preview.html'),'utf8');
const policy="default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'";
if(!html.includes('src="/demo/preview.mjs"'))throw Error('Unexpected demo entry');
await writeFile(join(output,'index.html'),html.replace('<meta charset="utf-8">','<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+policy+'">').replace('src="/demo/preview.mjs"','src="./demo/preview.mjs"'),{flag:'wx'});
const module=await readFile(join(root,'demo/preview.mjs'),'utf8');
const relative=module.replace(/from '\/(app\/dist|bcm\/dist|engine\/dist|fixtures)\//g,"from '../$1/");
if(/from ['"]\//.test(relative))throw Error('Unresolved root-relative module import');
await writeFile(join(output,'demo/preview.mjs'),relative,{flag:'wx'});
await copyFile(join(root,'tests/fixtures/math-textbook.mjs'),join(output,'fixtures/math-textbook.mjs'));
await writeFile(join(output,'.nojekyll'),'');
console.log('Built static BookCreator browser demo in dist-pages');
