import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../tampermonkey/BlogBookmarks.user.js', import.meta.url), 'utf8');

test('userscript installs from blog-bookmarks and parses', () => {
  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /\/\/ @name\s+Blog Bookmarks\n/);
  assert.match(source, /\/\/ @version\s+0\.5\.28\n/);
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

test('bookmark star is CSS-fixed at screen-right center with absolute per-article stops', () => {
  assert.match(source, /article\.post-item \{ position: relative !important; \}/);
  assert.match(source, /article\.appendChild\(button\)/);
  assert.match(source, /querySelector\('\.post-summary'\)/);
  assert.match(source, /const collapsed = article\.classList\?\.contains/);
  assert.match(source, /const targetTop = pinnedStarY\(\)/);
  assert.match(source, /--tm-bookmarks-screen-anchor-base/);
  assert.match(source, /32dvh/);
  assert.match(source, /const mode = collapsed/);
  assert.match(source, /document.body.appendChild\(control.button\)/);
  assert.match(source, /data-bookmarks-position/);
  assert.match(source, /right: 0 !important/);
  assert.match(source, /top: 50dvh !important/);
  assert.match(source, /transform: translateY\(-50%\) !important/);
  assert.match(source, /mode === 'center'\) return/);
  assert.match(source, /control.positionLeft/);
  assert.match(source, /const titleTop = Math\.max/);
  assert.match(source, /const bottomStop = Math\.max/);
  assert.match(source, /window\.addEventListener\('scroll', schedulePositions/);
  assert.match(source, /window\.visualViewport\?\.addEventListener\('resize'/);
  assert.match(source, /collapseObserver\?\.observe\(article/);
  assert.match(source, /position: absolute !important/);
  assert.match(source, /positionControl\(control\)/);
  assert.match(source, /new ResizeObserver\(schedulePositions\)/);
  assert.match(source, /background: var\(--tm-bookmarks-score-bg, rgba\(63,63,48,\.82\)\) !important/);
  assert.match(source, /touch-action: manipulation !important/);
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

test('per-URL failures persist with scroll-aware top/bottom messages and red stars', () => {
  assert.match(source, /const errors = new Map\(\)/);
  assert.match(source, /data-bookmarks-error/);
  assert.match(source, /function layoutErrors\(\)/);
  assert.match(source, /rect\.bottom <= 0\) above\.push\(entry\)/);
  assert.match(source, /rect\.top >= viewportHeight\) below\.push\(entry\)/);
  assert.match(source, /bottomErrorStack\.appendChild\(entry\.notice\)/);
  assert.match(source, /topErrorStack\.appendChild\(entry\.notice\)/);
  assert.match(source, /window\.addEventListener\('scroll', schedulePositions/);
  assert.match(source, /for \(const control of controls\.values\(\)\) positionControl\(control\);\s*if \(errors\.size\) scheduleErrorLayout\(\)/);
  assert.match(source, /entry\.notice\.textContent = 'Bookmarks｜' \+ entry\.title/);
  assert.match(source, /clearError\(key\)/);
  assert.doesNotMatch(source, /tm-bookmarks-error';/);
});

test('failed removal restores known server state and success clears only its own error', () => {
  assert.match(source, /let serverEntry = previous/);
  assert.match(source, /serverEntry = matches\.find\(row => row\.url === key\) \|\| null/);
  assert.match(source, /if \(serverEntry\) saved\.set\(key, serverEntry\)/);
  assert.match(source, /showError\(key, link, error\.message\)/);
  assert.match(source, /errors\.delete\(url\)/);
  assert.match(source, /if \(!statusKnown\) checked\.delete\(key\)/);
});

test('mobile screen anchor compensates Edge toolbar visibility in provided screenshots', () => {
  const mobile = source.match(/    function useMobileScreenAnchor\(\) \{[\s\S]*?\n    \}/)?.[0];
  const pinned = source.match(/    function pinnedStarY\(\) \{[\s\S]*?\n    \}/)?.[0];
  assert(mobile && pinned);
  const run = new Function('window', 'document', `${mobile}\n${pinned}\nreturn pinnedStarY();`);
  const viewport = height => ({ screen: { height: 1536 }, visualViewport: { height, width: 709, offsetTop: 0 }, innerWidth: 709, innerHeight: height });
  const doc = { documentElement: { clientHeight: 1080 } };
  // Screenshot A: top translation bar shown and browser bottom bar visible.
  const visibleBarY = 145 + run(viewport(1080), doc);
  // Screenshot B: both bars collapsed after scrolling.
  const hiddenBarY = 50 + run(viewport(1390), doc);
  assert(Math.abs(visibleBarY - hiddenBarY) < 10, `Screen-position drift: ${visibleBarY} vs ${hiddenBarY}`);
  assert(Math.abs(visibleBarY - 680) < 20);
  assert.match(source, /top: calc\(var\(--tm-bookmarks-screen-anchor-base, 84px\) \+ 32dvh\)/);
});


test('single vertical score and star share the same 38px translucent button', () => {
  assert.match(source, /const STAR_WIDTH = 38/);
  assert.match(source, /const STAR_HEIGHT = 52/);
  assert.match(source, /flex-direction: column !important/);
  assert.match(source, /width: 38px !important; height: 52px !important/);
  assert.match(source, /button\.append\(scoreBadge, glyph\)/);
  assert.doesNotMatch(source, /right:calc\(100% \+ 1px\)/);
  assert.match(source, /const red = Math\.round\(70 \+ 185 \* ratio\)/);
  assert.match(source, /const green = Math\.round\(52 \+ 168 \* ratio\)/);
  assert.match(source, /background: var\(--tm-bookmarks-score-bg/);
  assert.match(source, /rgba\(20,166,79,\.84\)/);
  assert.match(source, /\.tm-bookmarks-glyph \{[\s\S]*?rgba\(37,68,50,\.80\)/);
  assert.match(source, /overflow: hidden !important/);
  assert.match(source, /translate', 'no'/);
});

test('capture bridge registers only source links opened from quick review and waits through verification',()=>{
 assert.match(source,/\/\/ @match\s+\*:\/\/\*\/\*/);
 assert.match(source,/GM_addValueChangeListener/);
 assert.match(source,/blog-bookmarks:capture-request/);
 assert.match(source,/blog-bookmarks:capture-result/);
 assert.match(source,/blog-bookmarks:capture-deliver/);
 assert.match(source,/function send\(text\)/);
 assert.match(source,/isChallenge\(\)/);
 assert.match(source,/MutationObserver/);
 assert.match(source,/tm-blog-bookmarks-capture-article/);
 assert.match(source,/if\(!inFrame&&location\.hostname==='christorng\.idv\.tw'/);
 assert.match(source,/GM_setValue\(resultsKey,results\)/);
 assert.doesNotMatch(source,/GM_xmlhttpRequest\(\{[^}]*capture-results/);
});

test('already-open source tab receives a manual capture request without navigation',()=>{
 const bridge=source.slice(source.indexOf('(function articleCaptureBridge()'),source.indexOf('\n\n(() => {'));
 const jobsKey='blog-bookmarks:capture-jobs:v1',resultsKey='blog-bookmarks:capture-results:v1';
 const listeners=new Map(),store=new Map();
 const paragraph={textContent:'A meaningful research paragraph. '.repeat(25)};
 const article={cloneNode:()=>({querySelectorAll:q=>q.startsWith('script')?[]:[paragraph,paragraph],textContent:paragraph.textContent})};
 const button={style:{},addEventListener(){},remove(){}};
 const doc={readyState:'complete',title:'Research publication',body:{textContent:paragraph.textContent,appendChild(){}},querySelectorAll:()=>[article],createElement:()=>button,addEventListener(){},removeEventListener(){}};
 const win={addEventListener(){}};
 const loc=new URL('https://www.researchgate.net/publication/12345_Updated_title?utm_source=test');
 const run=new Function('document','window','location','GM_getValue','GM_setValue','GM_addValueChangeListener','setTimeout','clearTimeout','setInterval','clearInterval','MutationObserver',bridge);
 run(doc,win,loc,(key,fallback)=>store.get(key)??fallback,(key,value)=>store.set(key,value),(key,fn)=>listeners.set(key,fn),()=>1,()=>{},()=>1,()=>{},class{observe(){} disconnect(){}});
 assert.equal(store.has(resultsKey),false);
 const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
 store.set(jobsKey,{[id]:{id,url:'https://researchgate.net/publication/12345_Old_title',nonce:'retry',manual:true,createdAt:Date.now()}});
 listeners.get(jobsKey)();
 assert.equal(store.get(resultsKey)[id].nonce,'retry');
 assert.ok(store.get(resultsKey)[id].content.includes('meaningful research paragraph'));
});


test('embedded capture is authorized by matching pending job and never posts text to the parent',()=>{
 assert.doesNotMatch(source,/\/\/ @noframes/);
 assert.match(source,/event\.source!==window\.parent/);
 assert.match(source,/new URL\(job\.url\)\.origin!==event\.origin/);
 assert.match(source,/job\.nonce!==data\.nonce/);
 assert.match(source,/iframe-viewer-content/);
 assert.match(source,/frame\.contentWindow\.postMessage/);
});


test('matching direct iframe returns stable text through GM storage without opening a new tab',()=>{
 const bridge=source.slice(source.indexOf('(function articleCaptureBridge()'),source.indexOf('\n\n(() => {'));
 const jobsKey='blog-bookmarks:capture-jobs:v1',resultsKey='blog-bookmarks:capture-results:v1';
 const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', url='https://example.org/article';
 const job={id,url,nonce:'frame-job',createdAt:Date.now()};
 const store=new Map([[jobsKey,{[id]:job}]]), listeners=new Map();
 const parent={},win={parent,top:parent,addEventListener:(key,fn)=>listeners.set(key,fn)};
 const content='A rendered artifact paragraph. '.repeat(30);
 const doc={title:'Article',body:{querySelector:()=>null,cloneNode:()=>({querySelectorAll:()=>[],textContent:content})}};
 const run=new Function('document','window','location','GM_getValue','GM_setValue',bridge);
 run(doc,win,new URL('https://embed.example.net/frame'),(key,fallback)=>store.get(key)??fallback,(key,value)=>store.set(key,value));
 const receive=event=>listeners.get('message')(event);
 const data={channel:'blog-bookmarks:embedded-capture:v1',id,url,nonce:'frame-job',manual:true};
 receive({source:parent,origin:'https://wrong.example',data});
 assert.equal(store.has(resultsKey),false);
 receive({source:parent,origin:'https://example.org',data:{...data,nonce:'wrong'}});
 assert.equal(store.has(resultsKey),false);
 receive({source:parent,origin:'https://example.org',data});
 assert.equal(store.get(resultsKey)[id].content,content.trim());
 assert.equal(store.get(resultsKey)[id].url,url);
});

 test('reading insights remains a separate fixed, draggable control',()=>{
 assert.match(source,/BEGIN READING_INSIGHTS/);
 assert.match(source,/position:fixed!important;z-index:2147483639/);
 assert.match(source,/pointermove/);
 assert.match(source,/GM_setValue\(positionKey,pos\)/);
 assert.match(source,/value\.summary&&value\.auto_expand&&!touched/);
 assert.match(source,/精讀摘要：顯示／恢復/);
});
