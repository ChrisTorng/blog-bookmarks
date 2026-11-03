import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../tampermonkey/BlogBookmarks.user.js', import.meta.url), 'utf8');

test('Tampermonkey userscript parses and updates from the new repository', () => {
  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /\/\/ @name\s+Blog Bookmarks\n/);
  assert.match(source, /\/\/ @version\s+0\.3\.0\n/);
  assert.match(source, /\/\/ @updateURL\s+https:\/\/raw\.githubusercontent\.com\/ChrisTorng\/blog-bookmarks\/main\/tampermonkey\/BlogBookmarks\.user\.js/);
  assert.match(source, /\/\/ @downloadURL\s+https:\/\/raw\.githubusercontent\.com\/ChrisTorng\/blog-bookmarks\/main\/tampermonkey\/BlogBookmarks\.user\.js/);
  assert.match(source, /\/\/ @match\s+https:\/\/hackernews\.betacat\.io\/\*/);
  assert.doesNotMatch(source, /cloudmark-christorng|cloudmark\.site/);
});

test('mobile controls mirror the CloudMark title-corner badge and popover', () => {
  assert.match(source, /article\.post-item \.post-title a\.post-url/);
  assert.match(source, /title\.appendChild\(button\)/);
  assert.match(source, /grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(source, /min-height:36px/);
  assert.match(source, /max-width:6rem/);
  assert.match(source, /touch-action:manipulation/);
  assert.match(source, /attachShadow\(\{ mode: 'closed' \}\)/);
  assert.match(source, /panel\.showPopover\(\)/);
  assert.match(source, /window\.visualViewport/);
  assert.match(source, /width:min\(240px,calc\(100vw - 16px\)\)/);
  assert.match(source, /\.new-category/);
  assert.match(source, /GM_registerMenuCommand\('Blog Bookmarks 設定'/);
});

test('background save, safe category update and failure retry remain available', () => {
  assert.match(source, /closeMenu\(\); \/\/ Never wait for network traffic/);
  assert.match(source, /request\('\/status', 'POST', \{ urls: \[url\] \}\)/);
  assert.match(source, /request\('\/update-tags', 'POST', \{ url, tags: selected \}\)/);
  assert.match(source, /request\('', 'POST', \{ \.\.\.article, tags: selected \}\)/);
  assert.match(source, /textContent = '重試'/);
  assert.match(source, /textContent = '選擇分類'/);
  assert.match(source, /revisions\.set\(url/);
  assert.match(source, /let loadedSuccessfully = true/);
});
