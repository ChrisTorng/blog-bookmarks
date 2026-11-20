import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../tampermonkey/BlogBookmarks.user.js', import.meta.url), 'utf8');
const instrumented = source.replace(/\n\}\)\(\);\s*$/, `
    globalThis.__test = { controls, saved, checked, errors, positionControl,
        toggleArticle, showError, clearError, layoutErrors, render, scoreAppearance, previewScores };
})();`);

function element(tag = 'div') {
  const el = {
    tag, children: [], parentNode: null, attrs: {}, styles: {},
    isConnected: true, offsetWidth: 300, offsetHeight: 60,
    style: {
      setProperty(key, value) { el.styles[key] = value; },
      removeProperty(key) { delete el.styles[key]; }
    },
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
    const summary = element('summary');
    summary.rect = { left: 100, right: 500, top: 420, bottom: 745, width: 400, height: 325 };
    const summaryText = element('summary-text');
    summaryText.rect = { left: 100, right: 500, top: 640, bottom: 740, width: 400, height: 100 };
    const meta = element('post-meta');
    meta.rect = { left: 100, right: 500, top: 350, bottom: 405, width: 400, height: 55 };
    summary.querySelector = selector => selector === '.summary-text' ? summaryText :
      selector === 'a.feature-image img' ? img : null;
    article.collapsed = false;
    article.classList = { contains: name => name === 'auto-open-new-articles-collapsed' && article.collapsed };
    const img = image ? element('img') : null;
    if (img) {
      img.rect = { left: 120, right: 480, top: 435, bottom: 630, width: 360, height: 195 };
      img.complete = true;
      img.naturalWidth = 220;
    }
    article.querySelector = selector => selector === '.post-summary' ? summary :
      selector === '.post-meta' ? meta :
      selector.includes('feature-image') ? img :
      selector === '.post-title' ? title :
      selector === '.summary-text' ? { textContent: 'Original summary' } : null;
    const link = {
      href: url, textContent: 'Example ' + ++nextId, isConnected: true,
      getAttribute: () => null,
      closest: () => article
    };
    const button = element('button');
    button.offsetWidth = 38;
    button.offsetHeight = 52;
    button.rect = { left: 200, right: 238, top: y, bottom: y + 52, width: 38, height: 52 };
    const control = { link, button, url };
    api.controls.set(link, control);
    return { article, title, meta, summary, summaryText, img, link, button, control };
  }
  return { api, document, window: sandbox.window, replies, requests, addArticle };
}

test('expanded star uses native CSS fixed positioning between article stops and reaches screen edge', () => {
  const { api, document, addArticle } = harness();
  const row = addArticle('https://example.org/long-article');
  const placeAt = (top, bottom) => {
    row.article.rect.top = top;
    row.article.rect.bottom = bottom;
    row.article.rect.height = bottom - top;
    row.title.rect.top = top;
    row.title.rect.bottom = top + 40;
    api.positionControl(row.control);
  };
  // Entering from below: dock at the title; relative left extends to the viewport edge.
  placeAt(600, 1250);
  assert.equal(row.button.attrs['data-bookmarks-position'], 'title');
  assert.equal(row.button.styles.top, '12px');
  assert.equal(row.button.styles.left, '252px'); // viewport 390 - article left 100 - star 38
  assert.equal(row.button.parentNode, row.article);

  // The middle mode belongs to CSS, not to per-frame JS coordinate changes.
  placeAt(300, 950);
  assert.equal(row.button.attrs['data-bookmarks-position'], 'center');
  assert.equal(row.button.parentNode, document.body);
  assert.equal(row.button.styles.top, undefined);
  assert.equal(row.button.styles.left, undefined);
  placeAt(100, 750);
  assert.equal(row.button.attrs['data-bookmarks-position'], 'center');
  assert.equal(row.button.parentNode, document.body);
  assert.equal(row.button.styles.top, undefined);
  assert.equal(row.button.styles.left, undefined);

  // Exiting above: reattach to article and cap before its bottom divider.
  placeAt(-350, 300);
  assert.equal(row.button.attrs['data-bookmarks-position'], 'bottom');
  assert.equal(row.button.parentNode, row.article);
  assert.equal(row.button.styles.top, '594px');
  assert.equal(-350 + 594 + 52, 296);
});

test('adjacent articles have independent fixed/title stops without competing center stars', () => {
  const { api, document, addArticle } = harness();
  const current = addArticle('https://example.org/first');
  const following = addArticle('https://example.org/next', { image: false });
  current.article.rect = { left: 100, right: 500, top: -300, bottom: 430, width: 400, height: 730 };
  current.title.rect = { left: 100, right: 460, top: -300, bottom: -260, width: 360, height: 40 };
  following.article.rect = { left: 100, right: 500, top: 430, bottom: 1200, width: 400, height: 770 };
  following.title.rect = { left: 100, right: 460, top: 430, bottom: 470, width: 360, height: 40 };
  api.positionControl(current.control);
  api.positionControl(following.control);
  assert.equal(current.button.attrs['data-bookmarks-position'], 'center');
  assert.equal(current.button.parentNode, document.body);
  assert.equal(following.button.attrs['data-bookmarks-position'], 'title');
  assert.equal(following.button.styles.top, '12px');
});

test('visual viewport midpoint still controls article transition thresholds', () => {
  const { api, window, document, addArticle } = harness();
  const row = addArticle('https://example.org/mobile');
  row.article.rect.top = 100;
  row.article.rect.bottom = 750;
  row.title.rect.top = 100;
  row.title.rect.bottom = 140;
  window.visualViewport = { offsetTop: 40, height: 500 };
  api.positionControl(row.control);
  assert.equal(row.button.attrs['data-bookmarks-position'], 'center');
  assert.equal(row.button.parentNode, document.body);
});

test('collapsed or visually hidden summaries pin the star to the title and never the screen center', () => {
  const { api, document, addArticle } = harness();
  const row = addArticle('https://example.org/toggle');
  api.positionControl(row.control);
  assert.equal(row.button.attrs['data-bookmarks-position'], 'center');
  assert.equal(row.button.parentNode, document.body);
  row.article.collapsed = true;
  api.positionControl(row.control);
  assert.equal(row.button.attrs['data-bookmarks-position'], 'title');
  assert.equal(row.button.styles.left, '252px');
  assert.equal(row.button.styles.top, '12px');
  assert.equal(row.button.parentNode, row.article);
  row.article.collapsed = false;
  api.positionControl(row.control);
  assert.equal(row.button.attrs['data-bookmarks-position'], 'center');
  row.summary.rect.width = 0;
  api.positionControl(row.control);
  assert.equal(row.button.attrs['data-bookmarks-position'], 'title');
  assert.equal(row.button.styles.top, '12px');
});

test('changing viewport width recomputes absolute edge only without moving a centered star', () => {
  const { api, document, addArticle } = harness();
  const row = addArticle('https://example.org/narrow');
  row.article.collapsed = true;
  api.positionControl(row.control);
  assert.equal(row.button.styles.left, '252px');
  document.documentElement.clientWidth = 420;
  api.positionControl(row.control);
  assert.equal(row.button.styles.left, '282px');
  row.article.collapsed = false;
  api.positionControl(row.control);
  assert.equal(row.button.attrs['data-bookmarks-position'], 'center');
  document.documentElement.clientWidth = 440;
  api.positionControl(row.control);
  assert.equal(row.button.styles.left, undefined);
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
  assert.equal(api.errors.get(visible.link.href).notice.styles.top, '238px');
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


test('translated glyph never duplicates stars after 100 renders and updates',()=>{
  const {api,document,addArticle}=harness();
  const row=addArticle('https://example.org/translation');
  const glyph=document.createElement('span');
  glyph.className='tm-bookmarks-glyph notranslate';
  glyph.textContent='☆';
  const scoreBadge=document.createElement('span');
  scoreBadge.className='tm-bookmarks-predict notranslate';
  scoreBadge.textContent='75';
  row.button.append(scoreBadge,glyph);
  row.control.glyph=glyph;
  row.control.scoreBadge=scoreBadge;
  // Edge translation can wrap the first text node with another HTML element.
  // Rendering must never mistake this for a missing star and insert a new node.
  row.button.firstChild={nodeType:1,tagName:'FONT'};
  for(let i=0;i<100;i++){
    if(i%2===0)api.saved.set(row.link.href,{id:'saved',status:0});
    else api.saved.delete(row.link.href);
    api.render();
    assert.equal(row.button.children.length,2);
    assert.ok(['☆','★'].includes(glyph.textContent));
    assert.equal(row.button.children[0],scoreBadge);
    assert.equal(row.button.children[1],glyph);
  }
});


test('score brightness grows linearly with percentage; score and glyph stay one click target',()=>{
  const {api,document,addArticle}=harness();
  const row=addArticle('https://example.org/score');
  const glyph=document.createElement('span');
  glyph.textContent='☆';
  const scoreBadge=document.createElement('span');
  scoreBadge.textContent='…';
  row.button.append(scoreBadge,glyph);
  row.control.glyph=glyph;
  row.control.scoreBadge=scoreBadge;
  const bg=value=>api.scoreAppearance(value).background;
  const channels=value=>{
    const match=bg(value).match(/^rgba\((\d+), (\d+), (\d+), 0\.82\)$/);
    assert.ok(match,'opaque or invalid score color: '+bg(value));
    return match.slice(1).map(Number);
  };
  assert.deepEqual(channels(0),[70,52,2]);
  assert.deepEqual(channels(50),[163,136,4]);
  assert.deepEqual(channels(100),[255,220,6]);
  assert.match(bg(null),/rgba\(63, 63, 48, 0\.82\)/);
  // The same score must be more vivid at every level, including on dark pages.
  // Composite the semitransparent color against both black and white backgrounds.
  const brightness=(value,underlay)=>{
    const rgb=channels(value).map(v=>v*.82+underlay*.18);
    return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
  };
  for(const underlay of [0,255]){
    assert.ok(brightness(0,underlay)<brightness(50,underlay));
    assert.ok(brightness(50,underlay)<brightness(80,underlay));
    assert.ok(brightness(80,underlay)<brightness(100,underlay));
  }
  assert.equal(api.scoreAppearance(0).foreground,'#ffffff');
  assert.equal(api.scoreAppearance(80).foreground,'#15190e');
  for(const value of [0,9,50,99,100]){
    const key=row.link.href;
    api.previewScores.set(key,{publish:value,recommend:95,interest:100});
    api.render();
    assert.equal(scoreBadge.textContent,String(value));
    assert.equal(row.button.styles['--tm-bookmarks-score-bg'],bg(value));
    assert.equal(row.button.children.length,2);
    assert.equal(row.button.children[0],scoreBadge);
    assert.equal(row.button.children[1],glyph);
  }
  // A recommendation score must not add a second star beside the number.
  assert.equal(scoreBadge.textContent,'100');
  assert.equal(glyph.textContent,'☆');
});


test('saved and unsaved stars differ while score tint remains independent',()=>{
  const {api,document,addArticle}=harness();
  const row=addArticle('https://example.org/saved-color');
  const badge=document.createElement('span'),glyph=document.createElement('span');
  badge.textContent='…';glyph.textContent='☆';
  row.button.append(badge,glyph);
  row.control.scoreBadge=badge;
  row.control.glyph=glyph;
  api.previewScores.set(row.link.href,{publish:80,recommend:15,interest:90});
  api.render();
  const color=row.button.styles['--tm-bookmarks-score-bg'];
  assert.equal(row.button.attrs['aria-pressed'],'false');
  assert.equal(glyph.textContent,'☆');
  api.saved.set(row.link.href,{id:'saved',status:0});
  api.render();
  assert.equal(row.button.attrs['aria-pressed'],'true');
  assert.equal(glyph.textContent,'★');
  assert.equal(row.button.styles['--tm-bookmarks-score-bg'],color,
    'Saved state must not alter the yellow score or its brightness');
  api.saved.delete(row.link.href);
  api.render();
  assert.equal(row.button.attrs['aria-pressed'],'false');
  assert.equal(glyph.textContent,'☆');
  assert.equal(row.button.children.length,2,
    'Translation and rerenders must not create extra glyphs');
});
