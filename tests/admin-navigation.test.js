import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src=readFileSync(new URL('../public/bookmarks/admin.js',import.meta.url),'utf8');
test('admin navigation is URL backed',()=>{
 assert.match(src,/readLocationState/);
 assert.match(src,/updateLocation/);
 assert.match(src,/popstate/);
 assert.match(src,/scrollTop:true/);
 assert.match(src,/replace:true/);
 assert.match(src,/refreshGeneration/);
});
