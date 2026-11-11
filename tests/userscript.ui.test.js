import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../tampermonkey/BlogBookmarks.user.js', import.meta.url), 'utf8');
const instrumented = source.replace(/\n\}\)\(\);\s*$/, `
    globalThis.__test = { controls, saved, checked, errors, positionControl,
        toggleArticle, showError, clearError, layoutErrors };
})();`);

function element(tag = 'div') {
  const el = {
    tag, children: [], parentNode: null, attrs: {}, styles: {},
    isConnected: true, offsetWidth: 300, offsetHeight: 60,
    style: { setProperty(key, value) { el.styles[key] = value; } },
    setAttribute(key, value) { el.attrs[key] = value; },
    removeAttribute(key) { delete el.attrs[key]; },
    addEventListener() {},
    getBoundingClientRect() { return el.rect || { left: 0, right: 0, top: 0, bottom: 0 }; },
    appendChild(child) {
      if (child.parentNode) child.parentNode.children = child.parentNode.children.filter(x => x !== child);
      child.parentNode = el;
      el.children.push(child);
    },
    append(...children) { children.forEach(child => el.appendChild(child)); },
    remove() {
      if (el.parentNode) el.parentNode.children = el.parentNode.children.filter(x => x !== el);
      el.parentNode = null;
    },
    scrollIntoView() { el.scrolledIntoView = true; }
  };
  return el;
}

function harness() {
  const document = {
    readyState: 'loading',
    documentElement: { clientWidth: 390, clientHeight: 760 },
    body: element('body'),
    querySelectorAll: () => [],
    addEventListener() {},
    createElement: element
  };
  const replies = [];
  const requests = [];
  const sandbox = {
    document,
    window: { innerHeight: 760, innerWidth: 390 },
    location: { href: 'https://hackernews.betacat.io/' },
    URL,
    fetch: async () => ({ ok: true, text: async () => '<html></html>' }),
    DOMParser: class { parseFromString() { return { querySelectorAll: () => [] }; } },
    GM_getValue: () => 'mock-bookmark-token',
    GM_setValue() {},
    GM_registerMenuCommand() {},
    GM_xmlhttpRequest(request) {
      const response = replies.shift();
      assert.ok(response, 'Unexpected GM_xmlhttpRequest: ' + request.url);
      requests.push(request.url);
      queueMicrotask(() => request.onload({
        status: response.status,
        responseText: JSON.stringify(response.body),
        finalUrl: request.url
      }));
      return { abort() {} };
    },
    MutationObserver: class { observe() {} },
    setTimeout: () => 1,
    clearTimeout() {},
    requestAnimationFrame(callback) { callback(); },
    console: { debug() {}, warn() {} }
  };
  assert.notEqual(instrumented, source);
  runInNewContext(instrumented, sandbox, { filename: 'BlogBookmarks.user.js' });
  const api = sandbox.__test;
  assert.ok(api);
  let nextId = 0;
  function addArticle(url, { y = 150, image = true } = {}) {
    const article = element('article');
    article.clientWidth = 400;
    article.rect = { left: 100, right: 500, top: 300, bottom: 650, width: 400, height: 350 };
    const title = element('title');
    title.rect = { left: 100, right: 460, top: 300, bottom: 340, width: 360, height: 40 };
    const img = image ? element('img') : null;
    if (img) {
      img.rect = { left: 120, right: 340, top: 320, bottom: 460, width: 220, height: 140 };
      img.complete = true;
      img.naturalWidth = 220;
    }
    article.querySelector = selector => selector.includes('feature-image') ? img :
      selector === '.post-title' ? title :
      selector === '.summary-text' ? { textContent: 'Original summary' } : null;
    const link = {
      href: url, textContent: 'Example ' + ++nextId, isConnected: true,
      getAttribute: () => null,
      closest: () => article
    };
    const button = element('button');
    button.offsetWidth = 38;
    button.offsetHeight = 34;
    button.rect = { left: 200, right: 238, top: y, bottom: y + 34, width: 38, height: 34 };
    const control = { link, button, url };
    api.controls.set(link, control);
    return { article, title, img, link, button, control };
  }
  return { api, document, replies, requests, addArticle };
}

test('star stays over image and uses title for missing or broken images', () => {
  const { api, addArticle } = harness();
  const withImage = addArticle('https://example.org/image');
  api.positionControl(withImage.control);
  assert.equal(withImage.button.styles.left, '198px');
  assert.equal(withImage.button.styles.top, '122px');
  withImage.img.naturalWidth = 0;
  api.positionControl(withImage.control);
  assert.equal(withImage.button.styles.left, '318px');
  assert.equal(withImage.button.styles.top, '2px');
  const noImage = addArticle('https://example.org/title', { image: false });
  api.positionControl(noImage.control);
  assert.equal(noImage.button.styles.left, '318px');
  assert.equal(noImage.button.styles.top, '2px');
});

test('three independent errors attach to visible star or top/bottom viewport corners', () => {
  const { api, document, addArticle } = harness();
  const above = addArticle('https://example.org/above', { y: -100 });
  const visible = addArticle('https://example.org/visible', { y: 180 });
  const below = addArticle('https://example.org/below', { y: 900 });
  api.showError(above.link.href, above.link, 'Top error');
  api.showError(visible.link.href, visible.link, 'Visible error');
  api.showError(below.link.href, below.link, 'Bottom error');
  api.layoutErrors();
  const topStack = document.body.children.find(child => child.id === 'tm-bookmarks-errors-top');
  const bottomStack = document.body.children.find(child => child.id === 'tm-bookmarks-errors-bottom');
  assert.equal(api.errors.get(above.link.href).notice.parentNode, topStack);
  assert.equal(api.errors.get(below.link.href).notice.parentNode, bottomStack);
  assert.equal(api.errors.get(visible.link.href).notice.parentNode, document.body);
  assert.equal(api.errors.get(visible.link.href).notice.styles.top, '220px');
  api.clearError(visible.link.href);
  assert.equal(api.errors.size, 2);
  assert.equal(api.errors.get(above.link.href).notice.parentNode, topStack);
});

test('first removal failure restores server-known filled star and later success clears error', async () => {
  const { api, replies, addArticle } = harness();
  const row = addArticle('https://example.org/remove');
  replies.push(
    { status: 200, body: [{ url: row.link.href, id: 'already-saved', status: 1, tags: [] }] },
    { status: 500, body: { error: 'Removal rejected' } }
  );
  await api.toggleArticle(row.link);
  assert.equal(api.saved.get(row.link.href)?.id, 'already-saved');
  assert.equal(row.button.textContent, '★');
  assert.equal(row.button.attrs['data-bookmarks-error'], 'true');
  assert.ok(api.errors.has(row.link.href));
  replies.push({ status: 200, body: { ok: true } });
  await api.toggleArticle(row.link);
  assert.equal(api.saved.has(row.link.href), false);
  assert.equal(api.errors.has(row.link.href), false);
  assert.equal(row.button.textContent, '☆');
  assert.equal(row.button.attrs['data-bookmarks-error'], undefined);
});

test('failed addition keeps empty red star until retry successfully saves', async () => {
  const { api, replies, addArticle } = harness();
  const row = addArticle('https://example.org/add');
  api.checked.add(row.link.href);
  replies.push({ status: 500, body: { error: 'Insert rejected' } });
  await api.toggleArticle(row.link);
  assert.equal(api.saved.has(row.link.href), false);
  assert.equal(row.button.textContent, '☆');
  assert.equal(row.button.attrs['data-bookmarks-error'], 'true');
  replies.push({ status: 200, body: { item: { id: 'new-entry', status: 0, tags: [] } } });
  await api.toggleArticle(row.link);
  assert.equal(api.saved.get(row.link.href)?.id, 'new-entry');
  assert.equal(api.errors.has(row.link.href), false);
  assert.equal(row.button.textContent, '★');
  assert.equal(row.button.attrs['data-bookmarks-error'], undefined);
});
