import {readFileSync,writeFileSync} from 'node:fs';
const read=path=>readFileSync(path,'utf8').replaceAll('\r\n','\n');
const adminJs=read('public/bookmarks/admin.js');
const adminCss=read('public/bookmarks/admin.css');
const quickJs=read('public/bookmarks/admin-quick.js');
const quickCss=read('public/bookmarks/admin-quick.css');
const content='// Generated from public/bookmarks/admin.js, admin.css, admin-quick.js and admin-quick.css. Do not edit manually.\n'
 +'export const adminJavaScript = '+JSON.stringify(adminJs)+';\n'
 +'export const adminStylesheet = '+JSON.stringify(adminCss)+';\n'
 +'export const quickJavaScript = '+JSON.stringify(quickJs)+';\n'
 +'export const quickStylesheet = '+JSON.stringify(quickCss)+';\n';
const destination='src/ui-assets.js';
if(process.argv.includes('--check')){
 if(readFileSync(destination,'utf8')!==content)throw Error('Embedded admin assets are stale. Run npm run build:ui.');
}else{
 writeFileSync(destination,content);
}
