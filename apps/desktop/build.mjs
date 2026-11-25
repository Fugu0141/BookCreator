import {build} from 'esbuild';
import {mkdir,readFile,writeFile,copyFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
// All inputs are trusted, pinned build dependencies. No remote runtime font requests.
await rm('build',{recursive:true,force:true});await mkdir('build',{recursive:true});
await build({stdin:{contents:'@import "@fontsource-variable/noto-sans-jp";',resolveDir:process.cwd(),loader:'css'},bundle:true,outfile:'build/fonts.css',assetNames:'fonts/[name]-[hash]',loader:{'.woff2':'file','.woff':'file'}});
const original=await readFile('build/fonts.css','utf8');
const fontCss=original.replace(/(['"]?)Noto Sans JP Variable\1/g,'"BCFont_NotoSansJP"');
if(fontCss===original||!fontCss.includes('BCFont_NotoSansJP'))throw Error('Unexpected bundled font family');
await writeFile('build/fonts.css',fontCss);
const license='node_modules/@fontsource-variable/noto-sans-jp/LICENSE';
await copyFile(license,'build/NotoSansJP-LICENSE.txt');
const assets=(await readdir('build/fonts')).sort();
if(!assets.length||assets.some(name=>!/^[A-Za-z0-9_-]+\.(?:woff2|woff)$/.test(name)))throw Error('Unexpected font asset');
const hash=createHash('sha256').update(fontCss);
for(const name of assets){hash.update(name+'\0');hash.update(await readFile(join('build/fonts',name)));}
const fingerprint=hash.digest('hex');
await writeFile('build/fonts-manifest.json',JSON.stringify({schemaVersion:1,family:'BCFont_NotoSansJP',fingerprint,assets},null,2));
await build({entryPoints:['renderer.jsx'],bundle:true,format:'esm',platform:'browser',target:'chrome156',outfile:'build/renderer.js',define:{'process.env.NODE_ENV':'"production"','__BUNDLED_FONT_FINGERPRINT__':JSON.stringify(fingerprint)},legalComments:'inline'});
