import {readFileSync,writeFileSync} from 'node:fs';
const js=readFileSync('public/bookmarks/admin.js','utf8');
const css=readFileSync('public/bookmarks/admin.css','utf8');
const content='// Generated from public/bookmarks/admin.js and admin.css. Do not edit manually.\n'
 +'export const adminJavaScript = '+JSON.stringify(js)+';\n'
 +'export const adminStylesheet = '+JSON.stringify(css)+';\n';
const destination='src/ui-assets.js';
if(process.argv.includes('--check')){
 if(readFileSync(destination,'utf8')!==content)throw Error('Embedded admin assets are stale. Run npm run build:ui.');
}else{
 writeFileSync(destination,content);
}
