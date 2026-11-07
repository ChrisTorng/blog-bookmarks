import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../tampermonkey/BlogBookmarks.user.js', import.meta.url), 'utf8');

test('userscript installs from blog-bookmarks and parses', () => {
  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /\/\/ @name\s+Blog Bookmarks\n/);
  assert.match(source, /\/\/ @version\s+0\.5\.7\n/);
  assert.match(source, /raw\.githubusercontent\.com\/ChrisTorng\/blog-bookmarks\/main\/tampermonkey\/BlogBookmarks\.user\.js/);
  assert.match(source, /\/\/ @match\s+https:\/\/hackernews\.betacat\.io\/\*/);
  assert.doesNotMatch(source, /cloudmark-christorng|cloudmark\.site/);
  assert.match(source, /\/\/ @run-at\s+document-start/);
  assert.match(source, /originalTitleObserver\.observe\(document/);
});

test('single click toggles empty/full star without category modal', () => {
  assert.match(source, /const label = exists \? '★' : '☆'/);
  assert.match(source, /button\.addEventListener\('click', event => \{/);
  assert.match(source, /void toggleArticle\(link\)/);
  assert.match(source, /request\('\/remove', 'POST', \{ url: key \}\)/);
  assert.match(source, /request\('', 'POST', article\)/);
  assert.match(source, /status: 0, tags: \[\]/);
  assert.doesNotMatch(source, /panel\.showPopover/);
  assert.doesNotMatch(source, /openMenu/);
});

test('bookmark star overlays each article bottom-right without a toolbar row', () => {
  assert.match(source, /article\.post-item\{position:relative!important\}/);
  assert.match(source, /article\.appendChild\(button\)/);
  assert.match(source, /position:absolute!important;right:4px!important;bottom:4px!important/);
  assert.match(source, /opacity:\.58!important/);
  assert.match(source, /touch-action:manipulation/);
  assert.doesNotMatch(source, /tm-betacat-article-tools|oldCollapseButton/);
  assert.match(source, /GM_registerMenuCommand\('Blog Bookmarks 設定'/);
  assert.match(source, /attachShadow\(\{ mode: 'closed' \}\)/);
});

test('original title is recovered from source HTML, not only translated DOM', () => {
  assert.match(source, /fetch\(location\.href, \{ credentials: 'same-origin', cache: 'no-store' \}\)/);
  assert.match(source, /new DOMParser\(\)\.parseFromString/);
  assert.match(source, /originalTitles\.set\(key, title\)/);
  assert.match(source, /function captureOriginalTitles\(\)/);
  assert.match(source, /if \(originalTitles\.has\(key\)\) continue/);
  assert.doesNotMatch(source, /await Promise\.race\(\[loadOriginalTitles\(\)/);
  assert.match(source, /title_original: sourceTitle \|\| null/);
  assert.match(source, /title_zh: .*visibleTitle/);
});

test('redirect mappings and optimistic updates preserve source URL', () => {
  assert.match(source, /nitter\.tiekoetter\.com/);
  assert.match(source, /old\.reddit\.com/);
  assert.match(source, /readme-ov-file/);
  assert.match(source, /arxiv\.org\/html/);
  assert.match(source, /sourceAndTarget\(key\)/);
  assert.match(source, /Optimistic star/);
  assert.match(source, /revisions\.set\(key, revision\)/);
});

test('all automatic archive-host redirects are included without triggering manual floating menu',()=>{
  assert.match(source,/ARCHIVE_TODAY_HOSTS/);
  assert.match(source,/INTERNET_ARCHIVE_HOSTS/);
  assert.match(source,/www\.nytimes\.com/);
  assert.match(source,/www\.bbc\.com/);
  assert.match(source,/web\.archive\.org\/'/);
  assert.match(source,/archive\.is\/submit\/\?url=/);
  assert.match(source,/parsed\.hostname === 'web\.archive\.org'/);
  assert.match(source,/sourceAndTarget/);
});

test('no publisher fetching happens in the userscript and API is the only cross-origin host',()=>{
 assert.doesNotMatch(source,/originalSiteTitle|publisherTitle/);
 assert.doesNotMatch(source,/\/\/ @connect\s+\*/);
 assert.match(source,/\/\/ @connect\s+christorng\.idv\.tw/);
 assert.match(source,/const article = articleData\(link\)/);
 assert.match(source,/void loadOriginalTitles\(\)/);
});

test('Archive Today uses generic submit URLs and contains no hardcoded snapshots',()=>{
 assert.doesNotMatch(source,/const KNOWN_ARCHIVE_SNAPSHOTS|const ORIGINAL_BY_SNAPSHOT/);
 assert.ok(source.includes('encodeURIComponent(url.href)'));
 assert.ok(source.includes('https://archive.is/submit/?url='));
});
