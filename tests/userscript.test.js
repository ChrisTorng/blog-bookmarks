import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../tampermonkey/BlogBookmarks.user.js', import.meta.url), 'utf8');

test('userscript installs from blog-bookmarks and parses', () => {
  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /\/\/ @name\s+Blog Bookmarks\n/);
  assert.match(source, /\/\/ @version\s+0\.5\.0\n/);
  assert.match(source, /raw\.githubusercontent\.com\/ChrisTorng\/blog-bookmarks\/main\/tampermonkey\/BlogBookmarks\.user\.js/);
  assert.match(source, /\/\/ @match\s+https:\/\/hackernews\.betacat\.io\/\*/);
  assert.doesNotMatch(source, /cloudmark-christorng|cloudmark\.site/);
});

test('single click toggles empty/full star without category modal', () => {
  assert.match(source, /const label = exists \? '★' : '☆'/);
  assert.match(source, /button\.addEventListener\('click', event => \{/);
  assert.match(source, /void toggleArticle\(link\)/);
  assert.match(source, /request\('\/remove', 'POST', \{ url: key \}\)/);
  assert.match(source, /request\('', 'POST', articleData\(link\)\)/);
  assert.match(source, /status: 0, tags: \[\]/);
  assert.doesNotMatch(source, /panel\.showPopover/);
  assert.doesNotMatch(source, /openMenu/);
});

test('toolbar continues to share space with collapse control on mobile', () => {
  assert.match(source, /tm-betacat-article-tools/);
  assert.match(source, /oldCollapseButton/);
  assert.match(source, /toolbar\.appendChild\(button\)/);
  assert.match(source, /touch-action:manipulation/);
  assert.match(source, /flex:0 0 38px/);
  assert.match(source, /GM_registerMenuCommand\('Blog Bookmarks 設定'/);
  assert.match(source, /attachShadow\(\{ mode: 'closed' \}\)/);
});

test('original title is recovered from source HTML, not only translated DOM', () => {
  assert.match(source, /fetch\(location\.href, \{ credentials: 'same-origin', cache: 'no-store' \}\)/);
  assert.match(source, /new DOMParser\(\)\.parseFromString/);
  assert.match(source, /originalTitles\.set\(key, title\)/);
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
