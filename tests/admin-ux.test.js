import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const admin=readFileSync(new URL('../public/bookmarks/admin.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/bookmarks/admin.css',import.meta.url),'utf8');
const script=readFileSync(new URL('../tampermonkey/BlogBookmarks.user.js',import.meta.url),'utf8');

test('admin filter/search remain URL-driven',()=>{
 assert.match(admin,/for\(const id of \['filter','tag','sort'\]\)/);
 assert.match(admin,/addEventListener\('change'/);
 assert.match(admin,/id="searchBtn"/);
 assert.match(admin,/id="manageTags"/);
 assert.match(admin,/id="tagsDialog"/);
 assert.match(admin,/name_zh/);
});

test('inline multi-tag assignment under full-length summary',()=>{
 assert.match(admin,/class="category-picker"/);
 assert.match(admin,/data-tag-name/);
 assert.match(admin,/data-add-tag/);
 assert.match(admin,/class="summary"/);
 assert.doesNotMatch(admin,/id="editTags"/);
 assert.doesNotMatch(css,/-webkit-line-clamp/);
});

test('three choices replace checkbox workflow and refresh review queue',()=>{
 for(const level of ['2','3','4'])assert.match(admin,new RegExp('data-decision="'+level+'"'));
 assert.match(admin,/itemElement\.remove\(\)/);
 assert.match(admin,/await refresh\(\)/);
 assert.doesNotMatch(admin,/data-level/);
 assert.doesNotMatch(admin,/data-finish/);
});

test('source and redirected URL plus original title are editable and visible',()=>{
 assert.match(admin,/id="editOriginalTitle"/);
 assert.match(admin,/id="editRedirectUrl"/);
 assert.match(admin,/source-reference/);
 assert.match(admin,/original-title/);
 assert.match(admin,/b\.preferred_url\|\|b\.redirect_url\|\|b\.url/);
});

test('BetaCat bookmark star overlays the article instead of creating a toolbar',()=>{
 assert.match(script,/article\.appendChild\(button\)/);
 assert.match(script,/position: absolute !important/);
 assert.match(script,/querySelector\('\.post-summary a\.feature-image img'\)/);
 assert.match(script,/hasImage \? image : article\.querySelector\('\.post-title'\)/);
 assert.match(script,/opacity: \.58 !important/);
 assert.doesNotMatch(script,/tm-betacat-article-tools|oldCollapseButton/);
});
