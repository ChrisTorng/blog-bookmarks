import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { createHarness, createLink, createMouseEvent } = require('./support/betacat-dom-harness.cjs');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(repoRoot, 'tampermonkey', 'BlogBookmarks.user.js');
const fullScript = fs.readFileSync(scriptPath, 'utf8');
function extract(name) {
    const a = fullScript.indexOf('// BEGIN ' + name + '\n');
    const b = fullScript.indexOf('// END ' + name, a);
    assert(a >= 0 && b > a, 'Missing BetaCat section ' + name);
    return fullScript.slice(a + ('// BEGIN ' + name + '\n').length, b);
}
const scriptContents = extract('BETACAT_READING');

function createAutoOpenHarness(url, storageSeed, openCalls, browserNow = null, options = {}) {
    const gmStore = new Map(Object.entries(storageSeed || {}));
    const harness = createHarness({ url, readyState: 'loading', sessionStorageSeed: options.sessionStorageSeed || {} });
    harness.context.GM_getValue = (key, fallbackValue) => gmStore.has(key) ? gmStore.get(key) : fallbackValue;
    harness.context.GM_setValue = (key, value) => gmStore.set(key, value);
    harness.context.GM_openInTab = (href, options) => openCalls.push({ href, options });
    if (browserNow !== null) {
        harness.window.performance.timeOrigin = browserNow - 1;
        harness.window.performance.getEntriesByType = type => type === 'navigation'
            ? [{ type: options.navigationType || 'navigate', transferSize: options.transferSize ?? 1000,
                responseEnd: 1, responseStatus: options.responseStatus ?? 200, workerStart: 0 }]
            : [];
        harness.context.Date = class BrowserDate extends Date {
            constructor(...args) {
                super(...(args.length > 0 ? args : [browserNow]));
            }
            static now() {
                return browserNow;
            }
        };
    }
    return { harness, gmStore };
}

function runAutoOpenScript(harness) {
    harness.context.globalThis = harness.context;
    harness.context.global = harness.context;
    vm.runInNewContext(scriptContents, harness.context, { filename: scriptPath });
}

function assertCollapseControlLayout(button) {
    assert.equal(button.style.getPropertyValue('position'), 'fixed');
    assert.equal(button.style.getPropertyValue('top'), 'auto');
    assert.equal(button.style.getPropertyValue('right'), 'auto');
    assert.equal(button.style.getPropertyValue('bottom'), '16px');
    assert.equal(button.style.getPropertyValue('left'), '16px');
    assert.equal(button.style.getPropertyValue('opacity'), '0.5');
    assert.equal(button.style.getPropertyValue('width'), '44px');
    assert.equal(button.style.getPropertyValue('height'), '34px');
    for (const property of ['position', 'top', 'right', 'bottom', 'left', 'opacity', 'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height']) {
        assert.equal(button.style.getPropertyPriority(property), 'important', `${property} must resist page CSS`);
    }
}

function buildHackerNewsDateMenu(harness, dates) {
    const menu = harness.document.createElement('ul');
    menu.id = 'daily-links-menu';
    dates.forEach((date) => {
        menu.appendChild(createLink(harness.document, `https://hackernews.betacat.io/daily/${date}`, {
            textContent: date
        }));
    });
    harness.appendToBody(menu);
}

function buildHackerNewsUpdateFooter(harness, isoTimestamp) {
    const footer = harness.document.createElement('footer');
    const updated = harness.document.createElement('li');
    updated.className = 'last-updated';
    updated.setAttribute('data-submitted', isoTimestamp);
    footer.appendChild(updated);
    harness.appendToBody(footer);
}

function localTimeLabel(isoTimestamp, referenceTime = new Date()) {
    const date = new Date(isoTimestamp);
    const now = new Date(referenceTime);
    const hhmm = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    return date.getFullYear() === now.getFullYear()
        && date.getMonth() === now.getMonth()
        && date.getDate() === now.getDate()
        ? hhmm
        : `${date.getMonth() + 1}/${date.getDate()} ${hhmm}`;
}

function buildHackerNewsArticle(harness, id, title) {
    const article = harness.document.createElement('article');
    article.className = 'post-item';
    const titleContainer = harness.document.createElement('div');
    titleContainer.className = 'post-title';
    titleContainer.appendChild(createLink(harness.document, `https://example.com/${id}`, { textContent: title }));
    article.appendChild(titleContainer);
    const commentLink = createLink(harness.document, `https://news.ycombinator.com/item?id=${id}`, {
        textContent: 'comments'
    });
    commentLink.setAttribute('rel', 'comment');
    article.appendChild(commentLink);
    const summary = harness.document.createElement('div');
    summary.className = 'post-summary';
    summary.textContent = `Summary for ${title}`;
    article.appendChild(summary);
    harness.appendToBody(article);
    return article;
}


describe('AutoOpenNewArticles on Hacker News Summary', () => {
    test('collapses seen items without marking newly listed items as read during page load or review', () => {
        const storageKey = 'autoOpenNewArticles:lastSeen:hackernews-summary:listings';
        const openCalls = [];
        const { harness, gmStore } = createAutoOpenHarness(
            'https://hackernews.betacat.io/#sort=time&order=asc',
            { [storageKey]: ['hackernews:101', 'hackernews:100'] },
            openCalls
        );
        const newest = buildHackerNewsArticle(harness, '102', 'Newly submitted');
        const previouslyListed = buildHackerNewsArticle(harness, '101', 'Previously listed');
        const lateArrival = buildHackerNewsArticle(harness, '99', 'Older but newly promoted');

        runAutoOpenScript(harness);
        harness.dispatchDocumentEvent('DOMContentLoaded');

        const injectedStyle = harness.document.getElementById('auto-open-new-articles-style').textContent;
        assert.match(injectedStyle, /\.auto-open-new-articles-seen\s*\{\s*opacity: 0\.68 !important;/);
        assert.match(injectedStyle, /article\.post-item\.auto-open-new-articles-managed > \.post-title/);
        assert.match(injectedStyle, /padding-left: 34px !important/);
        assert.match(injectedStyle, /:not\(\.tm-blog-bookmarks-save\)/);
        assert.equal(newest.classList.contains('auto-open-new-articles-seen'), false);
        assert.equal(previouslyListed.classList.contains('auto-open-new-articles-seen'), true);
        assert.equal(previouslyListed.classList.contains('auto-open-new-articles-collapsed'), true);
        assert.equal(lateArrival.classList.contains('auto-open-new-articles-seen'), false);
        assert.equal(lateArrival.querySelector('.post-title a').href, 'https://example.com/99');
        const itemToggle = previouslyListed.querySelector('.auto-open-new-articles-item-toggle');
        assert.equal(itemToggle.textContent, '▶');
        assert.equal(itemToggle.getAttribute('aria-expanded'), 'false');
        assert.equal(itemToggle.parentNode, previouslyListed.querySelector('.post-title'));
        assert.equal(previouslyListed.querySelector('.tm-betacat-article-tools'), null);
        itemToggle.click();
        assert.equal(previouslyListed.classList.contains('auto-open-new-articles-collapsed'), false);
        assert.equal(previouslyListed.classList.contains('auto-open-new-articles-seen'), false);
        assert.equal(itemToggle.textContent, '▼');

        const allToggle = harness.document.getElementById('auto-open-new-articles-all-toggle');
        assert(allToggle);
        assertCollapseControlLayout(allToggle);
        assert.equal(allToggle.getAttribute('aria-pressed'), 'false');
        assert.equal(allToggle.style.getPropertyValue('background-color'), 'rgba(0, 0, 0, 0.55)');
        allToggle.click();
        assert.equal(newest.classList.contains('auto-open-new-articles-collapsed'), true);
        assert.equal(previouslyListed.classList.contains('auto-open-new-articles-collapsed'), true);
        assert.equal(lateArrival.classList.contains('auto-open-new-articles-collapsed'), true);
        allToggle.click();
        assert.equal(newest.classList.contains('auto-open-new-articles-collapsed'), false);
        assert.equal(allToggle.getAttribute('aria-pressed'), 'true');
        assert.equal(allToggle.style.getPropertyValue('background-color'), 'rgba(34, 139, 34, 0.85)');
        assert.equal(previouslyListed.classList.contains('auto-open-new-articles-seen'), false);
        assert.deepEqual(Array.from(gmStore.get(storageKey)), ['hackernews:101', 'hackernews:100']);
        assert.equal(openCalls.length, 0);
    });

    test('does not mark Hacker News Summary items as read when the page is reloaded', () => {
        const storageKey = 'autoOpenNewArticles:lastSeen:hackernews-summary:listings';
        const storageSeed = { [storageKey]: ['hackernews:401'] };
        const firstRun = createAutoOpenHarness(
            'https://hackernews.betacat.io/#sort=time&order=asc',
            storageSeed,
            []
        );
        buildHackerNewsArticle(firstRun.harness, '402', 'Unread before reload');
        buildHackerNewsArticle(firstRun.harness, '401', 'Already read');
        runAutoOpenScript(firstRun.harness);
        firstRun.harness.dispatchDocumentEvent('DOMContentLoaded');

        assert.deepEqual(Array.from(firstRun.gmStore.get(storageKey)), ['hackernews:401']);

        const secondRun = createAutoOpenHarness(
            'https://hackernews.betacat.io/#sort=time&order=asc',
            Object.fromEntries(firstRun.gmStore),
            []
        );
        const unreadAfterReload = buildHackerNewsArticle(secondRun.harness, '402', 'Unread after reload');
        const alreadyReadAfterReload = buildHackerNewsArticle(secondRun.harness, '401', 'Already read after reload');
        runAutoOpenScript(secondRun.harness);
        secondRun.harness.dispatchDocumentEvent('DOMContentLoaded');

        assert.equal(unreadAfterReload.classList.contains('auto-open-new-articles-seen'), false);
        assert.equal(unreadAfterReload.classList.contains('auto-open-new-articles-collapsed'), false);
        assert.equal(alreadyReadAfterReload.classList.contains('auto-open-new-articles-seen'), true);
        assert.deepEqual(Array.from(secondRun.gmStore.get(storageKey)), ['hackernews:401']);
    });

    test('marks every item as seen and jumps immediately to the top when scrollUp is clicked', () => {
        const storageKey = 'autoOpenNewArticles:lastSeen:hackernews-summary:listings';
        const openCalls = [];
        const { harness, gmStore } = createAutoOpenHarness(
            'https://hackernews.betacat.io/#sort=time&order=asc',
            {},
            openCalls
        );
        const first = buildHackerNewsArticle(harness, '202', 'First');
        const second = buildHackerNewsArticle(harness, '201', 'Second');
        const scrollUp = harness.document.createElement('a');
        scrollUp.id = 'scrollUp';
        harness.appendToBody(scrollUp);
        const scrollCalls = [];
        harness.context.window.scrollTo = (options) => scrollCalls.push(options);

        runAutoOpenScript(harness);
        harness.dispatchDocumentEvent('DOMContentLoaded');
        scrollUp.click();

        assert.equal(first.classList.contains('auto-open-new-articles-seen'), true);
        assert.equal(second.classList.contains('auto-open-new-articles-seen'), true);
        assert.equal(first.classList.contains('auto-open-new-articles-collapsed'), false);
        assert.equal(first.querySelector('.auto-open-new-articles-item-toggle').textContent, '▼');
        assert.deepEqual(Array.from(gmStore.get(storageKey)), ['hackernews:202', 'hackernews:201']);
        assert.equal(scrollCalls.length, 1);
        assert.equal(scrollCalls[0].top, 0);
        assert.equal(scrollCalls[0].left, 0);
        assert.equal(scrollCalls[0].behavior, 'auto');
    });

    test('adds larger short-date navigation using only dates available in the archive menu', () => {
        const openCalls = [];
        const { harness } = createAutoOpenHarness('https://hackernews.betacat.io/daily/2026-03-07', {}, openCalls);
        buildHackerNewsDateMenu(harness, ['2026-03-08', '2026-03-07', '2026-03-05']);
        buildHackerNewsArticle(harness, '302', 'First archive item');
        buildHackerNewsArticle(harness, '301', 'Last archive item');

        runAutoOpenScript(harness);
        harness.dispatchDocumentEvent('DOMContentLoaded');

        const navigation = harness.document.querySelectorAll('.auto-open-new-articles-date-nav');
        assert.equal(navigation.length, 2);
        navigation.forEach((nav) => {
            assert.equal(nav.children[0].textContent, '‹ 03-05');
            assert.equal(nav.children[0].href, '/daily/2026-03-05');
            assert.equal(nav.children[1].textContent, '03-07');
            assert.equal(nav.children[1].href, '/daily/2026-03-07');
            assert.equal(nav.children[2].textContent, '03-08 ›');
            assert.equal(nav.children[2].href, '/daily/2026-03-08');
        });
        const injectedStyle = harness.document.getElementById('auto-open-new-articles-style').textContent;
        assert.match(injectedStyle, /font-size: 18px !important/);
        assert.match(injectedStyle, /min-height: 44px !important/);
    });

    test('treats the homepage as Latest rather than the newest dated archive', () => {
        const { harness } = createAutoOpenHarness('https://hackernews.betacat.io/#sort=time&order=asc', {}, []);
        buildHackerNewsDateMenu(harness, ['2026-03-08', '2026-03-07', '2026-03-05']);
        buildHackerNewsArticle(harness, '402', 'Live latest item');

        runAutoOpenScript(harness);
        harness.dispatchDocumentEvent('DOMContentLoaded');

        const navigations = harness.document.querySelectorAll('.auto-open-new-articles-date-nav');
        assert.equal(navigations.length, 2);
        navigations.forEach((navigation) => {
            assert.equal(navigation.children[0].textContent, '‹ 03-08');
            assert.equal(navigation.children[0].href, '/daily/2026-03-08');
            assert.equal(navigation.children[1].textContent, 'Latest');
            assert.equal(navigation.children[1].href, '/');
            assert.equal(navigation.children[2].textContent, '›');
            assert.equal(navigation.children[2].tagName, 'SPAN');
            assert.equal(navigation.children[2].getAttribute('aria-disabled'), 'true');
            assert.equal(navigation.children[2].getAttribute('href'), null);
        });
    });

    test('Latest records the browser load at 23:44 instead of the site footer at 23:22', () => {
        const key = 'autoOpenNewArticles:hackerNewsSummary:verifiedLatestLoads';
        const oldKey = 'autoOpenNewArticles:hackerNewsSummary:updateHistory';
        const browserNow = new Date(2026, 10, 17, 23, 44).getTime();
        const { harness, gmStore } = createAutoOpenHarness('https://hackernews.betacat.io/', {
            [oldKey]: { current: '2026-11-17T15:22:00Z', previous: '2026-11-17T08:54:00Z' }
        }, [], browserNow);
        buildHackerNewsDateMenu(harness, ['2026-11-16', '2026-11-15']);
        buildHackerNewsArticle(harness, '900', 'Fresh story');
        buildHackerNewsUpdateFooter(harness, '2026-11-17T15:22:00Z');

        runAutoOpenScript(harness);
        harness.dispatchDocumentEvent('DOMContentLoaded');

        const navigations = harness.document.querySelectorAll('.auto-open-new-articles-date-nav');
        assert.equal(navigations.length, 2);
        navigations.forEach((nav) => {
            assert.equal(nav.children.length, 5);
            assert.equal(nav.children[0].textContent, '‹ 11-16');
            assert.equal(nav.children[1].textContent, 'Latest');
            assert.equal(nav.children[2].textContent, '›');
            assert.equal(nav.children[3].tagName, 'TIME');
            assert.equal(nav.children[3].textContent, '—');
            assert.equal(nav.children[3].getAttribute('datetime'), null);
            assert.equal(nav.children[4].textContent, '23:44');
            assert.equal(nav.children[4].getAttribute('datetime'), new Date(browserNow).toISOString());
        });
        assert.equal(gmStore.get(key).current, new Date(browserNow).toISOString());
        assert.equal(gmStore.get(key).previous, null);
        assert.equal(gmStore.get(oldKey).current, '2026-11-17T15:22:00Z');

        const styles = harness.document.getElementById('auto-open-new-articles-style').textContent;
        assert.match(styles, /\.auto-open-new-articles-update-time\.previous\s*\{\s*grid-column: 1 !important;/);
        assert.match(styles, /\.auto-open-new-articles-update-time\.current\s*\{\s*grid-column: 2 !important;/);
        assert.match(styles, /white-space: nowrap !important;/);
    });

    test('verified browser refreshes rotate the latest and previous load times even if website timestamp stays the same', () => {
        const key = 'autoOpenNewArticles:hackerNewsSummary:verifiedLatestLoads';
        const footerTime = '2026-11-17T15:22:00Z';
        const t1 = new Date(2026, 10, 17, 23, 44).getTime();
        const t2 = new Date(2026, 10, 18, 0, 14).getTime();
        const t3 = new Date(2026, 10, 18, 0, 30).getTime();
        const render = (browserTime, storage) => {
            const { harness, gmStore } = createAutoOpenHarness('https://hackernews.betacat.io/', storage, [], browserTime);
            buildHackerNewsDateMenu(harness, ['2026-11-16', '2026-11-15']);
            buildHackerNewsArticle(harness, '901', 'Unchanged story');
            buildHackerNewsUpdateFooter(harness, footerTime);
            runAutoOpenScript(harness);
            harness.dispatchDocumentEvent('DOMContentLoaded');
            return { nav: harness.document.querySelector('.auto-open-new-articles-date-nav'), gmStore };
        };

        const visit1 = render(t1, {});
        assert.equal(visit1.nav.children[3].textContent, '—');
        assert.equal(visit1.nav.children[4].textContent, '23:44');

        const visit2 = render(t2, Object.fromEntries(visit1.gmStore));
        assert.equal(visit2.nav.children[3].textContent, '11/17 23:44');
        assert.equal(visit2.nav.children[4].textContent, '00:14');
        assert.equal(visit2.gmStore.get(key).previous, new Date(t1).toISOString());
        assert.equal(visit2.gmStore.get(key).current, new Date(t2).toISOString());

        const visit3 = render(t3, Object.fromEntries(visit2.gmStore));
        assert.equal(visit3.nav.children[3].textContent, '00:14');
        assert.equal(visit3.nav.children[4].textContent, '00:30');
        assert.equal(visit3.gmStore.get(key).previous, new Date(t2).toISOString());
        assert.equal(visit3.gmStore.get(key).current, new Date(t3).toISOString());
    });

    test('cache-restored Latest retains acquisition time, then a verified reload updates it', () => {
        const key = 'autoOpenNewArticles:hackerNewsSummary:verifiedLatestLoads';
        const url = 'https://hackernews.betacat.io/';
        const snapshotKey = key + ':/';
        const morning = new Date(2026, 10, 24, 8, 0).getTime();
        const afternoon = new Date(2026, 10, 24, 15, 0).getTime();
        const render = (time, storage, options) => {
            const { harness, gmStore } = createAutoOpenHarness(url, storage, [], time, options);
            buildHackerNewsDateMenu(harness, ['2026-11-23']);
            buildHackerNewsArticle(harness, '904', 'Same story');
            runAutoOpenScript(harness);
            harness.dispatchDocumentEvent('DOMContentLoaded');
            const nav = harness.document.querySelector('.auto-open-new-articles-date-nav');
            return { harness, gmStore, nav };
        };
        const original = render(morning, {}, {});
        const sessionStorageSeed = { [snapshotKey]: original.harness.sessionStorage.getItem(snapshotKey) };
        const restored = render(afternoon, Object.fromEntries(original.gmStore), {
            transferSize: 0, sessionStorageSeed, navigationType: 'back_forward'
        });
        assert.equal(restored.nav.children[4].textContent, '08:00');
        assert.equal(restored.gmStore.get(key).current, new Date(morning).toISOString());
        const refreshed = render(afternoon, Object.fromEntries(restored.gmStore), {
            transferSize: 300, responseStatus: 304, sessionStorageSeed, navigationType: 'reload'
        });
        assert.equal(refreshed.nav.children[3].textContent, '08:00');
        assert.equal(refreshed.nav.children[4].textContent, '15:00');
        const unknown = render(afternoon, {}, { transferSize: 0 });
        assert.equal(unknown.nav.children[4].textContent, '—');
        assert.equal(unknown.gmStore.has(key), false);
    });

    test('Edge reload without transfer timing verifies the displayed listing through the existing response', async () => {
        const key = 'autoOpenNewArticles:hackerNewsSummary:verifiedLatestLoads';
        const url = 'https://hackernews.betacat.io/';
        const morning = new Date(2026, 10, 24, 8, 0).getTime();
        const now = new Date(2026, 10, 24, 17, 26).getTime();
        const first = createAutoOpenHarness(url, {}, [], morning);
        buildHackerNewsDateMenu(first.harness, ['2026-11-23']);
        buildHackerNewsArticle(first.harness, '907', 'Same story');
        runAutoOpenScript(first.harness);
        first.harness.dispatchDocumentEvent('DOMContentLoaded');
        const sessionStorageSeed = { [key + ':/']: first.harness.sessionStorage.getItem(key + ':/') };
        const render = async (options, remoteId, seed = sessionStorageSeed) => {
            const { harness, gmStore } = createAutoOpenHarness(url, Object.fromEntries(first.gmStore), [], now,
                { transferSize: 0, sessionStorageSeed: seed, ...options });
            buildHackerNewsDateMenu(harness, ['2026-11-23']);
            buildHackerNewsArticle(harness, '907', 'Same story');
            const remote = createAutoOpenHarness(url, {}, [], now).harness;
            buildHackerNewsArticle(remote, remoteId, 'Untranslated story');
            harness.document.wasDiscarded = options.wasDiscarded || false;
            harness.context.blogBookmarksBetaCatPageTask = Promise.resolve({ doc: remote.document, receivedAt: now });
            runAutoOpenScript(harness);
            harness.dispatchDocumentEvent('DOMContentLoaded');
            await Promise.resolve();
            await Promise.resolve();
            return { nav: harness.document.querySelector('.auto-open-new-articles-date-nav'), gmStore };
        };
        const reload = await render({ navigationType: 'reload' }, '907');
        assert.equal(reload.nav.children[3].textContent, '08:00');
        assert.equal(reload.nav.children[4].textContent, '17:26');
        const restored = await render({ navigationType: 'reload', wasDiscarded: true }, '907');
        assert.equal(restored.nav.children[4].textContent, '08:00');
        const cached = await render({ navigationType: 'navigate' }, '907');
        assert.equal(cached.nav.children[4].textContent, '08:00');
        const mismatch = await render({ navigationType: 'reload' }, '999');
        assert.equal(mismatch.nav.children[4].textContent, '08:00');
        const firstUnknown = await render({ navigationType: 'navigate' }, '907', {});
        assert.equal(firstUnknown.nav.children[4].textContent, '17:26');
    });

    test('date navigation replaces legacy copies and removes newly cloned controls', () => {
        const { harness } = createAutoOpenHarness('https://hackernews.betacat.io/', {}, [], Date.now());
        buildHackerNewsDateMenu(harness, ['2026-11-23']);
        buildHackerNewsArticle(harness, '905', 'Same story');
        const article = harness.document.querySelector('article.post-item');
        const duplicate = () => {
            const nav = harness.document.createElement('nav');
            nav.className = 'auto-open-new-articles-date-nav';
            article.parentNode.insertBefore(nav, article);
            return nav;
        };
        duplicate();
        duplicate();
        runAutoOpenScript(harness);
        harness.dispatchDocumentEvent('DOMContentLoaded');
        const navs = harness.document.querySelectorAll('.auto-open-new-articles-date-nav');
        assert.equal(navs.length, 2);
        assert.equal(navs[0].getAttribute('data-betacat-nav-position'), 'top');
        assert.equal(navs[1].getAttribute('data-betacat-nav-position'), 'bottom');
        const cloned = duplicate();
        harness.triggerMutation([cloned], { target: article.parentNode });
        assert.equal(harness.document.querySelectorAll('.auto-open-new-articles-date-nav').length, 2);
        assert.equal(cloned.parentNode, null);
        runAutoOpenScript(harness);
        harness.dispatchDocumentEvent('DOMContentLoaded');
        assert.equal(harness.document.querySelectorAll('.auto-open-new-articles-date-nav').length, 2);
    });

    test('Latest shows browser times with no footer; opening a dated archive never changes Latest load history', () => {
        const key = 'autoOpenNewArticles:hackerNewsSummary:verifiedLatestLoads';
        const browserNow = new Date(2026, 10, 17, 23, 44).getTime();
        const { harness, gmStore } = createAutoOpenHarness('https://hackernews.betacat.io/', {}, [], browserNow);
        buildHackerNewsDateMenu(harness, ['2026-11-16', '2026-11-15']);
        buildHackerNewsArticle(harness, '902', 'No footer needed');
        runAutoOpenScript(harness);
        harness.dispatchDocumentEvent('DOMContentLoaded');
        const latestNav = harness.document.querySelector('.auto-open-new-articles-date-nav');
        assert.equal(latestNav.children.length, 5);
        assert.equal(latestNav.children[4].textContent, '23:44');
        assert.equal(gmStore.get(key).current, new Date(browserNow).toISOString());

        const archive = createAutoOpenHarness(
            'https://hackernews.betacat.io/daily/2026-11-16',
            Object.fromEntries(gmStore), [], browserNow + 60000
        );
        buildHackerNewsDateMenu(archive.harness, ['2026-11-16', '2026-11-15']);
        buildHackerNewsArticle(archive.harness, '903', 'Archived story');
        buildHackerNewsUpdateFooter(archive.harness, '2026-11-16T01:02:03Z');
        runAutoOpenScript(archive.harness);
        archive.harness.dispatchDocumentEvent('DOMContentLoaded');
        assert.equal(archive.harness.document.querySelector('.auto-open-new-articles-date-nav').children.length, 3);
        assert.equal(archive.gmStore.get(key).current, new Date(browserNow).toISOString());
    });

    test('links the newest dated archive forward to the separate Latest view', () => {
        const { harness } = createAutoOpenHarness('https://hackernews.betacat.io/daily/2026-10-28', {}, []);
        buildHackerNewsDateMenu(harness, ['2026-10-28', '2026-10-27', '2026-10-26']);
        buildHackerNewsArticle(harness, '403', 'Newest dated archive item');

        runAutoOpenScript(harness);
        harness.dispatchDocumentEvent('DOMContentLoaded');

        const navigations = harness.document.querySelectorAll('.auto-open-new-articles-date-nav');
        assert.equal(navigations.length, 2);
        navigations.forEach((navigation) => {
            assert.equal(navigation.children[0].textContent, '‹ 10-27');
            assert.equal(navigation.children[0].href, '/daily/2026-10-27');
            assert.equal(navigation.children[1].textContent, '10-28');
            assert.equal(navigation.children[1].href, '/daily/2026-10-28');
            assert.equal(navigation.children[2].textContent, 'Latest ›');
            assert.equal(navigation.children[2].href, '/');
        });
    });

    test('disables navigation before the earliest available dated archive', () => {
        const { harness } = createAutoOpenHarness('https://hackernews.betacat.io/daily/2026-03-05', {}, []);
        buildHackerNewsDateMenu(harness, ['2026-03-08', '2026-03-07', '2026-03-05']);
        buildHackerNewsArticle(harness, '404', 'Oldest archive item');

        runAutoOpenScript(harness);
        harness.dispatchDocumentEvent('DOMContentLoaded');

        const navigation = harness.document.querySelector('.auto-open-new-articles-date-nav');
        assert.equal(navigation.children[0].tagName, 'SPAN');
        assert.equal(navigation.children[0].getAttribute('aria-disabled'), 'true');
        assert.equal(navigation.children[1].textContent, '03-05');
        assert.equal(navigation.children[2].textContent, '03-07 ›');
        assert.equal(navigation.children[2].href, '/daily/2026-03-07');
    });
});


function buildPopularityArticle(harness, id, points, comments, timestamp) {
    const article = buildHackerNewsArticle(harness, id, `Popularity story ${id}`);
    const meta = harness.document.createElement('div');
    meta.className = 'post-meta';

    const score = harness.document.createElement('span');
    score.className = 'score';
    score.title = 'Score';
    const pointsNumber = harness.document.createElement('span');
    pointsNumber.textContent = String(points);
    score.appendChild(pointsNumber);

    const comment = harness.document.createElement('span');
    comment.className = 'comment';
    comment.title = 'Comments';
    const commentLink = createLink(harness.document, `https://news.ycombinator.com/item?id=${id}`);
    const commentNumber = harness.document.createElement('span');
    commentNumber.textContent = String(comments);
    commentLink.appendChild(commentNumber);
    comment.appendChild(commentLink);

    const date = harness.document.createElement('span');
    date.className = 'last-updated';
    if (timestamp) date.setAttribute('data-submitted', timestamp);

    meta.append(score, comment, date);
    article.insertBefore(meta, article.querySelector('.post-summary'));
    return { article, score, comment, pointsNumber, commentNumber, commentLink };
}

function popularityLightness(metric) {
    const color = metric.style.getPropertyValue('--tm-popularity-color');
    const match = color.match(/hsl\(50 [\d.]+% ([\d.]+)%\)/);
    assert(match, `Expected computed popularity color, received ${color}`);
    return Number(match[1]);
}

describe('BetaCat time-normalized popularity highlighting', () => {
    test('same totals are brighter when earned in fewer hours and links remain functional', () => {
        const now = Date.parse('2026-11-18T08:00:00Z');
        const { harness } = createAutoOpenHarness('https://hackernews.betacat.io/', {}, [], now);
        const recent = buildPopularityArticle(harness, '610', 90, 36, new Date(now - 3600000).toISOString());
        const older = buildPopularityArticle(harness, '611', 90, 36, new Date(now - 12 * 3600000).toISOString());

        runAutoOpenScript(harness);
        harness.dispatchDocumentEvent('DOMContentLoaded');

        for (const metric of [recent.pointsNumber, recent.commentNumber, older.pointsNumber, older.commentNumber]) {
            assert(metric.classList.contains('auto-open-new-articles-popularity'));
            assert(metric.classList.contains('auto-open-new-articles-popularity-hot'));
        }
        assert(popularityLightness(recent.pointsNumber) < popularityLightness(older.pointsNumber));
        assert(popularityLightness(recent.commentNumber) < popularityLightness(older.commentNumber));
        // Only numeric glyphs get backgrounds, not chevrons, comment icons or delimiters.
        assert(!recent.score.classList.contains('auto-open-new-articles-popularity'));
        assert(!recent.comment.classList.contains('auto-open-new-articles-popularity'));
        assert.equal(recent.pointsNumber.style.getPropertyValue('--tm-popularity-color').startsWith('hsl(50 '), true);
        assert.equal(recent.pointsNumber.textContent, '90');
        assert.equal(recent.commentNumber.textContent, '36');
        assert.equal(recent.commentLink.href, 'https://news.ycombinator.com/item?id=610');
        assert.match(recent.score.title, /平滑平均/);
        assert.match(recent.comment.title, /非即時增量/);
        assert.equal(recent.article.classList.contains('auto-open-new-articles-collapsed'), false);
    });

    test('page maxima reach full yellow and other values retain continuous proportional differences', () => {
        const now = Date.parse('2026-11-18T08:00:00Z');
        const { harness } = createAutoOpenHarness('https://hackernews.betacat.io/', {}, [], now);
        const medium = buildPopularityArticle(harness, '700', 86, 43, new Date(now - 3600000).toISOString());
        const large = buildPopularityArticle(harness, '701', 190, 90, new Date(now - 3600000).toISOString());
        const huge = buildPopularityArticle(harness, '702', 500, 240, new Date(now - 3600000).toISOString());
        runAutoOpenScript(harness);
        harness.dispatchDocumentEvent('DOMContentLoaded');
        assert(popularityLightness(medium.pointsNumber) > popularityLightness(large.pointsNumber));
        assert(popularityLightness(large.pointsNumber) > popularityLightness(huge.pointsNumber));
        assert(popularityLightness(medium.commentNumber) > popularityLightness(large.commentNumber));
        assert(popularityLightness(large.commentNumber) > popularityLightness(huge.commentNumber));
        // The hottest score AND the hottest comment value each use the vivid yellow maximum.
        assert.equal(popularityLightness(huge.pointsNumber), 54);
        assert.equal(popularityLightness(huge.commentNumber), 54);
        assert(popularityLightness(medium.pointsNumber) >= 80);
        assert.match(huge.score.title, /本頁相對熱度 100\.0%/);
    });

    test('a nearly uniform page gives every article a bright yellow, without a fixed global threshold', () => {
        const now = Date.parse('2026-11-18T08:00:00Z');
        const { harness } = createAutoOpenHarness('https://hackernews.betacat.io/', {}, [], now);
        const a = buildPopularityArticle(harness, '710', 12, 5, new Date(now - 3600000).toISOString());
        const b = buildPopularityArticle(harness, '711', 13, 6, new Date(now - 3600000).toISOString());
        runAutoOpenScript(harness);
        harness.dispatchDocumentEvent('DOMContentLoaded');
        assert.equal(popularityLightness(b.pointsNumber), 54);
        assert.equal(popularityLightness(b.commentNumber), 54);
        assert(popularityLightness(a.pointsNumber) <= 60);
        assert(popularityLightness(a.commentNumber) <= 62);
    });

    test('each metric uses its own page maximum instead of combined score and comment counts', () => {
        const now = Date.parse('2026-11-18T08:00:00Z');
        const { harness } = createAutoOpenHarness('https://hackernews.betacat.io/', {}, [], now);
        const mostPoints = buildPopularityArticle(harness, '720', 300, 5, new Date(now - 3600000).toISOString());
        const mostComments = buildPopularityArticle(harness, '721', 50, 65, new Date(now - 3600000).toISOString());
        runAutoOpenScript(harness);
        harness.dispatchDocumentEvent('DOMContentLoaded');
        assert.equal(popularityLightness(mostPoints.pointsNumber), 54);
        assert.equal(popularityLightness(mostComments.commentNumber), 54);
        assert(popularityLightness(mostPoints.commentNumber) > popularityLightness(mostComments.commentNumber));
        assert(popularityLightness(mostComments.pointsNumber) > popularityLightness(mostPoints.pointsNumber));
    });

    test('a handful of new votes never appears hotter than a sustained fast-growing story', () => {
        const now = Date.parse('2026-11-18T08:00:00Z');
        const { harness } = createAutoOpenHarness('https://hackernews.betacat.io/', {}, [], now);
        const tiny = buildPopularityArticle(harness, '620', 3, 1, new Date(now - 5 * 60000).toISOString());
        const fast = buildPopularityArticle(harness, '621', 110, 45, new Date(now - 2 * 3600000).toISOString());

        runAutoOpenScript(harness);
        harness.dispatchDocumentEvent('DOMContentLoaded');

        assert(tiny.pointsNumber.classList.contains('auto-open-new-articles-popularity-hot'));
        assert(tiny.commentNumber.classList.contains('auto-open-new-articles-popularity-hot'));
        assert(fast.pointsNumber.classList.contains('auto-open-new-articles-popularity-hot'));
        assert(fast.commentNumber.classList.contains('auto-open-new-articles-popularity-hot'));
        assert(popularityLightness(tiny.pointsNumber) > popularityLightness(fast.pointsNumber));
        assert(popularityLightness(tiny.commentNumber) > popularityLightness(fast.commentNumber));
    });

    test('historical archives and missing timestamps keep legible neutral totals, not misleading heat', () => {
        const now = Date.parse('2026-11-18T08:00:00Z');
        const archived = createAutoOpenHarness('https://hackernews.betacat.io/daily/2026-11-17', {}, [], now);
        const old = buildPopularityArticle(archived.harness, '630', 900, 300, new Date(now - 24 * 3600000).toISOString());
        runAutoOpenScript(archived.harness);
        archived.harness.dispatchDocumentEvent('DOMContentLoaded');
        assert(old.pointsNumber.classList.contains('auto-open-new-articles-popularity'));
        assert(!old.pointsNumber.classList.contains('auto-open-new-articles-popularity-hot'));
        assert(!old.commentNumber.classList.contains('auto-open-new-articles-popularity-hot'));

        const latest = createAutoOpenHarness('https://hackernews.betacat.io/', {}, [], now);
        const undated = buildPopularityArticle(latest.harness, '631', 900, 300, null);
        runAutoOpenScript(latest.harness);
        latest.harness.dispatchDocumentEvent('DOMContentLoaded');
        assert(undated.pointsNumber.classList.contains('auto-open-new-articles-popularity'));
        assert(!undated.pointsNumber.classList.contains('auto-open-new-articles-popularity-hot'));
        assert.match(undated.score.title, /不計算熱度/);
    });
});

test('all BetaCat-specific modules are consolidated in BlogBookmarks', () => {
    assert(fullScript.includes('// @grant        GM_openInTab'));
    // The original site template uses <nav class="day-nav"> with .newer/.older
    // links, while #scrollUp is moved into the same nav. Hide ONLY the arrows.
    assert(scriptContents.includes('.day-nav > a.newer, .day-nav > a.older'));
    assert(scriptContents.includes('display: none !important'));
    assert(!scriptContents.includes('.day-nav { display: none'));
    assert(!scriptContents.includes('#scrollUp { display: none'));
    assert(extract('BETACAT_MOBILE_LAYOUT').includes('(orientation: portrait)'));
    assert(extract('BETACAT_MOBILE_LAYOUT').includes('.post-summary .feature-image'));
    assert(extract('BETACAT_EXTERNAL_LINKS').includes('GM_openInTab(url, { active: false, insert: true })'));
});
test('BetaCat external article and Hacker News discussion links open in background, dates do not', () => {
    const opens = [];
    const h = createHarness({url:'https://hackernews.betacat.io/daily/2026-11-22/',readyState:'loading'});
    h.context.GM_openInTab = (href, options) => opens.push({href,options});
    const external = createLink(h.document,'https://example.org/article',{textContent:'external'});
    const discussion = createLink(h.document,'https://news.ycombinator.com/item?id=22',{textContent:'discussion'});
    const author = createLink(h.document,'https://news.ycombinator.com/user?id=abc',{textContent:'author'});
    const date = createLink(h.document,'https://hackernews.betacat.io/daily/2026-11-21/',{textContent:'previous date'});
    for(const link of [external,discussion,author,date])h.appendToBody(link);
    vm.runInNewContext(extract('BETACAT_EXTERNAL_LINKS'), h.context);
    h.dispatchDocumentEvent('DOMContentLoaded');
    assert.equal(date.target,'');
    for(const link of [external,discussion,author]) {
        assert.equal(link.target,'_blank');
        link.dispatchEvent(createMouseEvent('click'));
    }
    assert.deepEqual(opens.map(x=>x.href),[
       'https://example.org/article',
       'https://news.ycombinator.com/item?id=22',
       'https://news.ycombinator.com/user?id=abc'
    ]);
    assert(opens.every(x=>x.options.active === false && x.options.insert === true));
});
