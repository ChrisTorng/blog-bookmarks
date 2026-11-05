import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const js=read('public/bookmarks/admin-quick.js');
const css=read('public/bookmarks/admin-quick.css');
const old=read('public/bookmarks/admin.js');
const api=read('src/api.js');
const data=read('src/data.js');
const worker=read('src/index.js');
const views=read('src/views.js');
const generator=read('scripts/sync-ui.mjs');

test('quick admin has a separate protected route and switches back to full manager',()=>{
 assert.match(worker,/\/bookmarks\/admin\/quick/);
 assert.match(views,/quickAdminPage/);
 assert.match(js,/href="\/bookmarks\/admin\/"/);
 assert.match(old,/href="\/bookmarks\/admin\/quick\/"/);
 assert.match(generator,/admin-quick\.js/);
});
test('queue includes 3+3, 5+5, or 10+10 with a real pending count',()=>{
 assert.match(js,/choices = \[6,10,20\]/);
 assert.match(js,/state\.size\/2/);
 assert.match(js,/state\.remaining\.toLocaleString/);
 assert.doesNotMatch(css,/\.quick-toolbar\{[^}]*position:sticky/);
 assert.match(js,/scrollIntoView/);
 assert.match(js,/focus\(\{preventScroll:true\}\)/);
 assert.match(api,/reviewWindow\(env\.DB/);
 assert.match(data,/b\.stage IN \(0,1\)/);
 assert.match(data,/SELECT COUNT\(\*\) n FROM bookmarks WHERE stage IN \(0,1\)/);
 assert.match(data,/Math\.max\(12,size\)/);
});
test('quick card shows Chinese heading, full summary, added time and vertical multi-select tags',()=>{
 assert.match(js,/b\.title_zh\|\|b\.title/);
 assert.match(js,/b\.summary/);
 assert.match(js,/dateText\(b\.created_at\)/);
 assert.match(js,/b\.title_original/);
 assert.doesNotMatch(js,/new URL\(b\.url\)\.hostname/);
 assert.match(js,/aria-pressed/);
 assert.match(css,/flex-direction:column/);
 assert.match(css,/white-space:pre-wrap/);
 assert.doesNotMatch(css,/-webkit-line-clamp/);
});
test('publishing requires tags on both manager screens and backend',()=>{
 assert.match(data,/公開或推薦必須先選擇至少一個分類/);
 assert.match(old,/const blocked=!b\.tags\.length\|\|b\.savingTags/);
 assert.match(js,/if\(level>=3&&!b\.tags\.length\)/);
 assert.match(js,/selected&&b\.status>=3&&old\.length===1/);
});
test('decisions immediately advance, retain undo history, and reconcile prefetched data',()=>{
 assert.match(js,/state\.pending=state\.pending\.filter/);
 assert.match(js,/state\.recent=\[\.\.\.state\.recent/);
 assert.match(js,/render\(\{focus:wasPending/);
 assert.match(js,/state\.changeVersion/);
 assert.match(js,/reconcile\(\)/);
 assert.match(js,/Roll back only this record/);
 assert.match(js,/state\.remaining\+\+/);
});

test('quick review shows total pending and latest decision with selected Chinese categories',()=>{
 assert.match(js,/待處理 '\+state\.remaining\.toLocaleString/);
 assert.match(js,/last\.status===4\?'已推薦'/);
 assert.match(js,/last\.status===3\?'已公開'/);
 assert.match(js,/quick-latest/);
 assert.match(js,/t\?\.name_zh\|\|t\?\.name\|\|name/);
 assert.match(js,/pending-label/);
 assert.doesNotMatch(js,/quick-category-heading/);
 assert.doesNotMatch(js,/quick-hint/);
});
test('quick screen edits all content without duplicating status or tag controls',()=>{
 for(const field of ['editTitle','editOriginalTitle','editUrl','editRedirectUrl','editSummary'])
  assert.match(js,new RegExp(field));
 assert.match(js,/data-edit/);
 assert.match(js,/data-delete/);
 assert.match(js,/request\('\/'\+id,'PATCH',raw\)/);
 assert.match(js,/request\('\/'\+b\.id,'DELETE'\)/);
 assert.match(js,/confirm\('確定永久刪除這筆書籤？'\)/);
 assert.match(css,/\.quick-delete/);
 assert.match(css,/\.quick-main\{min-width:0;display:flex;flex-direction:column/);
 assert.doesNotMatch(js,/quick-danger/);
 assert.match(js,/class="quick-content"/);
 assert.match(css,/\.quick-actions \.quick-delete\{/);
 assert.doesNotMatch(css,/max-height:min/);
 assert.doesNotMatch(css,/\.quick-categories\{[^}]*overflow-y:auto/);
});

test('mobile preserves 3+3, 5+5 and 10+10 as scrollable entries',()=>{
 assert.match(js,/state\.recent\.slice\(-half\(\)\)/);
 assert.match(js,/state\.pending\.slice\(0,half\(\)\)/);
 assert.doesNotMatch(js,/mobileView/);
 assert.doesNotMatch(js,/showPrevious/);
 assert.match(js,/recent\.map\(b=>card\(b,'recent'\)\)\.join/);
 assert.match(js,/pending\.map\(b=>card\(b,'pending'\)\)\.join/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/\.quick-toolbar\{display:flex\}/);
 assert.match(css,/\.pending-label\{display:grid;grid-template-columns:max-content minmax\(0,1fr\)/);
 assert.match(css,/\.quick-latest\{justify-self:end/);
 assert.doesNotMatch(css,/\.quick-categories\{[^}]*overscroll-behavior:contain/);
});
test('delete stays in left content area and edit dialog does not focus input',()=>{
 assert.match(js,/'<div class="quick-danger"><button type="button" class="quick-delete"/);
 assert.match(js,/'<aside class="quick-categories"/);
 assert.match(js,/id="editHeading" tabindex="-1" autofocus/);
 assert.match(js,/\$\('editHeading'\)\.focus\(\{preventScroll:true\}\)/);
 assert.doesNotMatch(js,/editTitle'\)\.focus/);
 assert.match(js,/data-scroll-previous/);
});

test('edit dialog uses browser history for Back and avoids the mobile keyboard',()=>{
 assert.match(js,/history\.pushState\(/);
 assert.match(js,/quickReviewEditing:true/);
 assert.match(js,/window\.addEventListener\('popstate'/);
 assert.match(js,/history\.back\(\)/);
 assert.match(js,/\$\('cancelEdit'\)\.onclick=closeEdit/);
 assert.match(js,/addEventListener\('cancel',event=>/);
 assert.match(js,/\$\('editHeading'\)\.focus\(\{preventScroll:true\}\)/);
 assert.doesNotMatch(js,/\$\('editTitle'\)\.focus\(/);
});
test('compact mobile edit modal keeps action buttons visible and makes decisions equally wide',()=>{
 assert.match(css,/#editDialog\{/);
 assert.match(css,/width:min\(calc\(100vw - 12px\),880px\)/);
 assert.match(css,/#editDialog #editForm\{/);
 assert.match(css,/#editDialog \.dialog-actions\{/);
 assert.match(css,/position:sticky/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/\.quick-actions\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/\.quick-actions \[data-edit\]\{grid-column:2;grid-row:2\}/);
});

test('mobile classification uses intrinsic width and leaves room for the article',()=>{
 assert.match(css,/\.quick-item\{grid-template-columns:minmax\(0,1fr\) fit-content\(28vw\)/);
 assert.match(css,/\.quick-categories \.category\{width:100%;min-width:0/);
 assert.doesNotMatch(css,/\.quick-categories\{[^}]*overflow-y:auto/);
});
test('mobile card keeps exactly two footer action rows visible while long text scrolls',()=>{
 assert.match(js,/const actions=\[3,4,2\]/);
 assert.match(js,/'<div class="quick-actions">'\+actions/);
 assert.match(js,/data-edit>編輯/);
 assert.match(js,/data-delete>刪除/);
 assert.match(css,/\.quick-main\{min-width:0;min-height:0;display:flex;flex-direction:column/);
 assert.match(css,/\.quick-content\{overflow-y:auto;overscroll-behavior:contain/);
 assert.match(css,/\.quick-item\{grid-template-columns:minmax\(0,1fr\) fit-content\(28vw\)[^}]*height:calc\(100dvh - 90px\)/);
 assert.match(css,/\.quick-actions\{flex:0 0 auto;margin-top:8px;padding-top:8px;border-top:1px solid var\(--line\)/);
 assert.match(css,/\.quick-actions \[data-decision="3"\]\{grid-column:1 \/ span 2;grid-row:1\}/);
 assert.match(css,/\.quick-actions \[data-decision="4"\]\{grid-column:3;grid-row:1\}/);
 assert.match(css,/\.quick-actions \[data-decision="2"\]\{grid-column:1;grid-row:2\}/);
 assert.match(css,/\.quick-actions \[data-edit\]\{grid-column:2;grid-row:2\}/);
 assert.match(css,/\.quick-actions \[data-delete\]\{grid-column:3;grid-row:2\}/);
 assert.match(js,/const contentScroll=item\.querySelector\('\.quick-content'\)\?\.scrollTop/);
 assert.doesNotMatch(js,/esc\(domain\)/);
});
