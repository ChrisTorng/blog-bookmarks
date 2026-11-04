import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../tampermonkey/BlogBookmarks.user.js', import.meta.url), 'utf8');

test('Tampermonkey userscript parses and updates from the new repository', () => {
  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /\/\/ @name\s+Blog Bookmarks\n/);
  assert.match(source, /\/\/ @version\s+0\.4\.0\n/);
  assert.match(source, /\/\/ @updateURL\s+https:\/\/raw\.githubusercontent\.com\/ChrisTorng\/blog-bookmarks\/main\/tampermonkey\/BlogBookmarks\.user\.js/);
  assert.match(source, /\/\/ @downloadURL\s+https:\/\/raw\.githubusercontent\.com\/ChrisTorng\/blog-bookmarks\/main\/tampermonkey\/BlogBookmarks\.user\.js/);
  assert.match(source, /\/\/ @match\s+https:\/\/hackernews\.betacat\.io\/\*/);
  assert.doesNotMatch(source, /cloudmark-christorng|cloudmark\.site/);
});

test('mobile controls mirror the CloudMark title-corner badge and popover', () => {
  assert.match(source, /article\.post-item \.post-title a\.post-url/);
  assert.match(source, /toolbar\.appendChild\(button\)/);
  assert.match(source, /tm-betacat-article-tools/);
  assert.match(source, /min-height:32px/);
  assert.match(source, /max-width:calc\(100% - 38px\)/);
  assert.match(source, /touch-action:manipulation/);
  assert.match(source, /attachShadow\(\{ mode: 'closed' \}\)/);
  assert.match(source, /panel\.showPopover\(\)/);
  assert.match(source, /window\.visualViewport/);
  assert.match(source, /width:min\(360px,calc\(100vw - 16px\)\)/);
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

test('no permanent mobile footer toolbar; settings live inside menu or Tampermonkey', () => {
  assert.doesNotMatch(source, /position:fixed;right:8px;bottom:8px/);
  assert.match(source, /GM_registerMenuCommand\('Blog Bookmarks 設定'/);
  assert.match(source, /settings\.addEventListener\('click',/);
  assert.match(source, /textContent = '管理書籤'/);
  assert.match(source, /saved\.set\(url, existing\)/);
});

test('controls share the BetaCat toolbar and labels show the complete category list', () => {
 assert.match(source,/const TOOLBAR_CLASS = 'tm-betacat-article-tools'/);
 assert.match(source,/tags\.join\(', '\)/);
 assert.match(source,/toolbar\.appendChild\(button\)/);
 assert.match(source,/white-space:normal!important/);
 assert.match(source,/word-break:normal!important/);
 assert.match(source,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(source,/\.menu-actions/);
});
