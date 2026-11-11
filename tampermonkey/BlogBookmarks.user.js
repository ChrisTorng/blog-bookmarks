// ==UserScript==
// @name         Blog Bookmarks
// @namespace    https://christorng.idv.tw/
// @version      0.5.8
// @description  Overlay bookmark stars on BetaCat images or titles with persistent per-article error indicators
// @homepageURL  https://github.com/ChrisTorng/blog-bookmarks
// @updateURL    https://raw.githubusercontent.com/ChrisTorng/blog-bookmarks/main/tampermonkey/BlogBookmarks.user.js
// @downloadURL  https://raw.githubusercontent.com/ChrisTorng/blog-bookmarks/main/tampermonkey/BlogBookmarks.user.js
// @match        https://hackernews.betacat.io/*
// @connect      christorng.idv.tw
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// @noframes
// ==/UserScript==

(() => {
    'use strict';
    const ENDPOINT = 'https://christorng.idv.tw/bookmarks/api/ingest';
    const TOKEN_KEY = 'blog-bookmarks-ingest-token';
    const BUTTON_CLASS = 'tm-blog-bookmarks-save';
    const ERROR_CLASS = 'tm-bookmarks-error-notice';
    const controls = new Map();
    const saved = new Map();
    const checked = new Set();
    const pending = new Set();
    const revisions = new Map();
    const errors = new Map();
    const originalTitles = new Map();
    let token = GM_getValue(TOKEN_KEY, '');
    let originalTitleTask;
    let preloadTask;
    let preloadTimer;
    let settingsHost;
    let scanScheduled = false;
    let positionScheduled = false;
    let errorLayoutScheduled = false;
    let positionObserver;
    let topErrorStack;
    let bottomErrorStack;

    function normalize(value) {
        const url = new URL(value, location.href);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
            throw new Error('僅接受 HTTP(S) 網址');
        url.hash = '';
        return url.href;
    }

    // Mirrors the deterministic mappings in TampermonkeyScripts/src/RedirectUrls.user.js.
    // X's first mirror is a preferred URL, not a verified reachable final destination.

    // Mirrors the @match domains in InternetArchive.user.js and ArchiveToday.user.js.
    // All 11 hosts were tested to reach Archive Today; there is no overlap now.
    const ARCHIVE_TODAY_HOSTS = new Set([
        "www.404media.co",
        "www.bloomberg.com",
        "www.economist.com",
        "www.ft.com",
        "www.nature.com",
        "www.newscientist.com",
        "www.newyorker.com",
        "www.nytimes.com",
        "www.theatlantic.com",
        "www.wired.com",
        "www.wsj.com"
    ]);
    const INTERNET_ARCHIVE_HOSTS = new Set([
        "fortune.com",
        "nautil.us",
        "www.australiangeographic.com.au",
        "www.bbc.com",
        "www.cnbc.com",
        "www.lrb.co.uk",
        "www.scientificamerican.com",
        "www.rawstory.com",
        "www.scmp.com",
        "www.smh.com.au",
        "www.thetimes.com",
        "www.theverge.com",
        "www.washingtonpost.com"
    ]);

    function redirectedUrl(input) {
        const url = new URL(input);
        const host = url.hostname.toLowerCase();
        if (url.protocol !== 'https:') return null; // Align with source userscript @match.
        const post = url.pathname.match(/^\/([^/]+)\/status\/(\d+)(?:\/|$)/);
        if (['x.com', 'twitter.com'].includes(host) && post)
            return 'https://nitter.tiekoetter.com/' + post[1] + '/status/' + post[2];
        if (host === 'old.reddit.com') {
            url.hostname = 'www.reddit.com';
            return url.href;
        }
        if (host === 'www.reddit.com' && /^\/login\/?$/.test(url.pathname) &&
            url.searchParams.get('reason') === 'lor2') {
            try {
                const dest = new URL(url.searchParams.get('dest'));
                if (dest.hostname === 'old.reddit.com' && dest.protocol === 'https:' &&
                    !dest.username && !dest.password && !dest.port) {
                    dest.hostname = 'www.reddit.com';
                    return dest.href;
                }
            } catch {}
        }
        if (host === 'github.com' && url.searchParams.get('tab') === 'readme-ov-file') {
            url.searchParams.delete('tab');
            return url.href;
        }
        if (host === 'arxiv.org' && /^\/(abs|pdf)\//.test(url.pathname)) {
            const id = url.pathname.replace(/^\/(abs|pdf)\//, '').replace(/\.pdf$/, '');
            if (id) return 'https://arxiv.org/html/' + id;
        }
        if (ARCHIVE_TODAY_HOSTS.has(host))
            return 'https://archive.is/submit/?url=' + encodeURIComponent(url.href);
        if (INTERNET_ARCHIVE_HOSTS.has(host))
            return 'https://web.archive.org/' + url.href;
        return null;
    }

    function sourceAndTarget(input) {
        const url = normalize(input);
        const parsed = new URL(url);
        // Article lists may already point to an archive entry point. Retain both.
        if (parsed.hostname === 'web.archive.org') {
            const match = parsed.pathname.match(/^\/(?:web\/[^/]+\/)?(https?:\/\/.*)$/i);
            if (match) {
                try { return { url: normalize(match[1] + parsed.search), redirect_url: url }; }
                catch {}
            }
        }
        if (['archive.is','archive.ph'].includes(parsed.hostname) &&
            parsed.pathname === '/submit/' && parsed.searchParams.get('url')) {
            try {
                return { url: normalize(parsed.searchParams.get('url')), redirect_url: url };
            } catch {}
        }
        if (['nitter.tiekoetter.com', 'nitter.meowing.monster', 'xnologin.com',
            'shitter.thepixora.com'].includes(parsed.hostname) &&
            /^\/[^/]+\/status\/\d+/.test(parsed.pathname)) {
            return { url: 'https://x.com' + parsed.pathname, redirect_url: url };
        }
        return { url, redirect_url: redirectedUrl(url) };
    }

    function request(path, method = 'GET', body, secret = token) {
        return new Promise((resolve, reject) => {
            if (!secret) return reject(new Error('尚未設定 Bookmarks Token'));
            let done = false, transport;
            const finish = (fn, value) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                fn(value);
            };
            const timer = setTimeout(() => {
                finish(reject, new Error('連線逾時'));
                transport?.abort?.();
            }, 15000);
            try {
                transport = GM_xmlhttpRequest({
                    method, url: ENDPOINT + path, timeout: 15000,
                    anonymous: true, redirect: 'error',
                    headers: {
                        Authorization: 'Bearer ' + secret,
                        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
                    },
                    data: body === undefined ? undefined : JSON.stringify(body),
                    onload(response) {
                        try {
                            if (response.finalUrl &&
                                new URL(response.finalUrl).origin !== new URL(ENDPOINT).origin)
                                throw new Error('非預期的 API 重導向');
                            const result = JSON.parse(response.responseText);
                            if (response.status < 200 || response.status >= 300)
                                throw new Error(result.error || 'HTTP ' + response.status);
                            finish(resolve, result);
                        } catch (error) { finish(reject, error); }
                    },
                    onerror: () => finish(reject, new Error('無法連線到書籤服務')),
                    ontimeout: () => finish(reject, new Error('連線逾時')),
                    onabort: () => finish(reject, new Error('連線已取消'))
                });
            } catch (error) { finish(reject, error); }
        });
    }

    // Capture every original title as early as the browser inserts it into the DOM.
    // Do not overwrite the first English title with Edge's later translated text.
    function captureOriginalTitles() {
        for (const link of document.querySelectorAll('article.post-item .post-title a.post-url')) {
            try {
                const key = normalize(link.getAttribute('href') || link.href);
                if (originalTitles.has(key)) continue;
                const title = (link.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 500);
                if (title && !/[\u3400-\u9fff]/.test(title)) originalTitles.set(key, title);
            } catch {}
        }
    }

    // One immediate, page-load-only fallback request for untranslated BetaCat HTML.
    // A changing news feed cannot mix titles because keys are the article URLs.
    // This function is never called from the star-click handler.
    function loadOriginalTitles() {
        if (originalTitleTask) return originalTitleTask;
        originalTitleTask = fetch(location.href, { credentials: 'same-origin', cache: 'no-store' })
            .then(response => {
                if (!response.ok) throw new Error('無法讀取原始文章清單');
                return response.text();
            })
            .then(html => {
                const doc = new DOMParser().parseFromString(html, 'text/html');
                for (const link of doc.querySelectorAll('article.post-item .post-title a.post-url')) {
                    try {
                        const key = normalize(link.getAttribute('href'));
                        const title = (link.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 500);
                        if (title && !originalTitles.has(key)) originalTitles.set(key, title);
                    } catch {}
                }
            })
            .catch(error => console.debug('Blog Bookmarks: original title unavailable', error));
        return originalTitleTask;
    }


    function articleData(link) {
        const article = link.closest('article.post-item');
        if (!article) throw new Error('找不到文章');
        const key = normalize(link.href);
        const text = value => String(value || '').replace(/\s+/g, ' ').trim();
        const visibleTitle = text(link.textContent).slice(0, 500);
        const sourceTitle = originalTitles.get(key) ||
            text(link.getAttribute('data-original-title')).slice(0, 500) ||
            (/[\u3400-\u9fff]/.test(visibleTitle) ? '' : visibleTitle);
        const urls = sourceAndTarget(key);
        return {
            ...urls,
            title: visibleTitle || sourceTitle || new URL(key).hostname,
            title_zh: /[\u3400-\u9fff]/.test(visibleTitle) ? visibleTitle : null,
            title_original: sourceTitle || null,
            summary: text(article.querySelector('.summary-text')?.textContent).slice(0, 5000),
            tags: []
        };
    }

    function render() {
        for (const [link, control] of controls) {
            if (!link.isConnected || !control.button.isConnected) {
                controls.delete(link);
                continue;
            }
            const { button, url } = control;
            const exists = saved.has(url);
            const label = exists ? '★' : '☆';
            if (button.textContent !== label) button.textContent = label;
            button.disabled = pending.has(url);
            button.setAttribute('aria-pressed', String(exists));
            button.setAttribute('aria-busy', String(pending.has(url)));
            if (errors.has(url)) {
                button.setAttribute('data-bookmarks-error', 'true');
                button.setAttribute('aria-invalid', 'true');
            } else {
                button.removeAttribute('data-bookmarks-error');
                button.removeAttribute('aria-invalid');
            }
            const hint = exists ? '取消收藏' : '加入未讀收藏';
            button.title = hint;
            button.setAttribute('aria-label', hint);
        }
    }

    // The button remains a direct child of the article, not inside an image link.
    // Absolute positioning avoids adding any height or an extra toolbar row.
    function positionControl(control) {
        const article = control.link.closest('article.post-item');
        if (!article || !article.isConnected) return;
        const image = article.querySelector('.post-summary a.feature-image img');
        const imageRect = image?.getBoundingClientRect();
        const hasImage = imageRect && imageRect.width >= 24 && imageRect.height >= 24 &&
            !(image.complete && image.naturalWidth === 0);
        const anchor = hasImage ? image : article.querySelector('.post-title') || control.link;
        const rect = anchor.getBoundingClientRect();
        const articleRect = article.getBoundingClientRect();
        const width = control.button.offsetWidth || 38;
        const height = control.button.offsetHeight || 34;
        const left = Math.max(0, Math.min(rect.right - articleRect.left - width - 4,
            (article.clientWidth || articleRect.width) - width));
        const top = Math.max(0, rect.bottom - articleRect.top - height - 4);
        control.button.style.setProperty('left', Math.round(left) + 'px', 'important');
        control.button.style.setProperty('top', Math.round(top) + 'px', 'important');
    }

    function schedulePositions() {
        if (positionScheduled) return;
        positionScheduled = true;
        requestAnimationFrame(() => {
            positionScheduled = false;
            for (const control of controls.values()) positionControl(control);
            scheduleErrorLayout();
        });
    }

    function ensureErrorStacks() {
        if (topErrorStack) return;
        topErrorStack = document.createElement('div');
        topErrorStack.id = 'tm-bookmarks-errors-top';
        bottomErrorStack = document.createElement('div');
        bottomErrorStack.id = 'tm-bookmarks-errors-bottom';
        document.body.append(topErrorStack, bottomErrorStack);
    }

    // Every failed URL owns a message. Offscreen failures are kept in
    // independently scrollable top/bottom stacks, never dismissed on a timer.
    function layoutErrors() {
        if (!errors.size) return;
        ensureErrorStacks();
        const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        const above = [], below = [], visible = [];
        for (const [url, entry] of errors) {
            const matching = [...controls.values()].filter(control =>
                control.url === url && control.button.isConnected);
            const control = matching.find(({ button }) => {
                const rect = button.getBoundingClientRect();
                return rect.bottom > 0 && rect.top < viewportHeight;
            }) || matching[0];
            const rect = control?.button.getBoundingClientRect();
            if (!rect || rect.bottom <= 0) above.push(entry);
            else if (rect.top >= viewportHeight) below.push(entry);
            else visible.push({ entry, rect });
        }
        for (const entry of above) topErrorStack.appendChild(entry.notice);
        for (const entry of below) bottomErrorStack.appendChild(entry.notice);
        for (const { entry, rect } of visible) {
            if (entry.notice.parentNode !== document.body) document.body.appendChild(entry.notice);
            const noticeWidth = entry.notice.offsetWidth || 300;
            const noticeHeight = entry.notice.offsetHeight || 60;
            const left = Math.max(8, Math.min(rect.left, viewportWidth - noticeWidth - 8));
            // Prefer below the star; place above only if the message would be clipped.
            const lowerEdge = rect.bottom + 6;
            const top = lowerEdge + noticeHeight <= viewportHeight - 8
                ? lowerEdge : Math.max(8, rect.top - noticeHeight - 6);
            entry.notice.style.setProperty('left', Math.round(left) + 'px', 'important');
            entry.notice.style.setProperty('top', Math.round(top) + 'px', 'important');
        }
    }

    function scheduleErrorLayout() {
        if (errorLayoutScheduled) return;
        errorLayoutScheduled = true;
        requestAnimationFrame(() => {
            errorLayoutScheduled = false;
            layoutErrors();
        });
    }

    function showError(url, link, message) {
        ensureErrorStacks();
        let entry = errors.get(url);
        if (!entry) {
            const notice = document.createElement('div');
            notice.className = ERROR_CLASS;
            notice.setAttribute('role', 'alert');
            notice.tabIndex = 0;
            notice.addEventListener('click', () => {
                const control = [...controls.values()].find(item =>
                    item.url === url && item.button.isConnected);
                control?.button.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
            notice.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    notice.click();
                }
            });
            entry = { notice, title: '' };
            errors.set(url, entry);
        }
        entry.title = (link.textContent || entry.title || url).replace(/\s+/g, ' ').trim().slice(0, 70);
        entry.notice.textContent = 'Bookmarks｜' + entry.title + '：' +
            (message || '操作失敗') + '。點此返回星號重試。';
        scheduleErrorLayout();
    }

    function clearError(url) {
        const entry = errors.get(url);
        if (!entry) return;
        entry.notice.remove();
        errors.delete(url);
        scheduleErrorLayout();
    }

    async function toggleArticle(link) {
        if (!token) return openSettings(link);
        if (!controls.has(link)) return;
        const key = controls.get(link).url;
        if (pending.has(key)) return;
        const previous = saved.get(key);
        const previouslyChecked = checked.has(key);
        const revision = (revisions.get(key) || 0) + 1;
        revisions.set(key, revision);
        pending.add(key);
        checked.add(key);
        // Optimistic star, independent of request latency.
        if (previous) saved.delete(key);
        else saved.set(key, { id: null, status: 0, tags: [] });
        render();
        let serverEntry = previous;
        let statusKnown = previouslyChecked;
        try {
            if (!previouslyChecked) {
                const matches = await request('/status', 'POST', { urls: [key] });
                serverEntry = matches.find(row => row.url === key) || null;
                statusKnown = true;
            }
            if (serverEntry) {
                await request('/remove', 'POST', { url: key });
                saved.delete(key);
            } else {
                // Use the title snapshot, never refetch or wait on a click.
                const article = articleData(link);
                // No server-side publisher fetch: submit the cached BetaCat title as-is.
                const result = await request('', 'POST', article);
                const item = result.item || result;
                saved.set(key, { id: item.id, status: item.status, tags: item.tags || [] });
            }
            clearError(key);
        } catch (error) {
            // A first status check might reveal an existing server-side bookmark.
            // Restore that authoritative state when the subsequent removal fails.
            if (serverEntry) saved.set(key, serverEntry);
            else saved.delete(key);
            if (!statusKnown) checked.delete(key);
            showError(key, link, error.message);
        } finally {
            pending.delete(key);
            render();
        }
    }

    function schedulePreload() {
        if (!token) return;
        clearTimeout(preloadTimer);
        preloadTimer = setTimeout(() => void preload(), 200);
    }
    async function preload() {
        if (!token || preloadTask) return;
        const urls = [...new Set([...controls.values()].map(x => x.url))]
            .filter(url => !checked.has(url) && !pending.has(url));
        if (!urls.length) return;
        const currentToken = token;
        preloadTask = (async () => {
            for (let i = 0; i < urls.length; i += 75) {
                const batch = urls.slice(i, i + 75);
                const versions = new Map(batch.map(url => [url, revisions.get(url) || 0]));
                const found = await request('/status', 'POST', { urls: batch }, currentToken);
                if (token !== currentToken) return;
                for (const url of batch)
                    if ((revisions.get(url) || 0) === versions.get(url)) checked.add(url);
                for (const item of found)
                    if ((revisions.get(item.url) || 0) === versions.get(item.url))
                        saved.set(item.url, { id: item.id, status: item.status, tags: item.tags || [] });
                render();
            }
        })().catch(error => console.warn('Blog Bookmarks preload:', error))
            .finally(() => { preloadTask = null; });
        await preloadTask;
        if (currentToken === token && [...controls.values()].some(x => !checked.has(x.url)))
            schedulePreload();
    }

    function openSettings(resumeLink = null) {
        if (settingsHost) return;
        const host = document.createElement('div');
        const shadow = host.attachShadow({ mode: 'closed' });
        const style = document.createElement('style');
        style.textContent = 'dialog{box-sizing:border-box;width:min(28rem,calc(100vw - 24px));padding:20px;border:1px solid #9ba6b2;border-radius:12px;background:#fff;color:#18212b;font:16px/1.5 system-ui,sans-serif}dialog::backdrop{background:#0007}h2{margin:0 0 12px;font-size:20px}p{font-size:14px}label{display:block;margin-top:12px}input{box-sizing:border-box;width:100%;min-height:44px;margin-top:5px;padding:8px;border:1px solid #8996a3;border-radius:6px;font:16px system-ui,sans-serif}.actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}button{min-height:44px;padding:8px 12px;font:inherit;cursor:pointer}a{color:#1666a7}.error{color:#a21616}';
        const dialog = document.createElement('dialog');
        const heading = document.createElement('h2');
        heading.textContent = 'Blog Bookmarks 設定';
        const guide = document.createElement('p');
        guide.textContent = '在書籤管理後台產生 Token，貼到這裡。分類、公開與推薦都在後台操作。';
        const admin = document.createElement('a');
        admin.href = 'https://christorng.idv.tw/bookmarks/admin/';
        admin.target = '_blank';
        admin.rel = 'noopener noreferrer';
        admin.textContent = '開啟書籤管理後台 ↗';
        const label = document.createElement('label');
        label.textContent = 'Bookmarks Token';
        const input = document.createElement('input');
        input.type = 'password';
        input.autocomplete = 'off';
        input.value = token;
        label.appendChild(input);
        const error = document.createElement('p');
        error.className = 'error';
        const actions = document.createElement('div');
        actions.className = 'actions';
        const cancel = document.createElement('button');
        cancel.textContent = '取消';
        const apply = document.createElement('button');
        apply.textContent = '儲存';
        actions.append(cancel, apply);
        dialog.append(heading, guide, admin, label, error, actions);
        shadow.append(style, dialog);
        document.body.appendChild(host);
        settingsHost = host;
        function close() {
            input.value = '';
            host.remove();
            if (settingsHost === host) settingsHost = null;
        }
        cancel.onclick = close;
        dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
        apply.onclick = async () => {
            const next = input.value.trim();
            if (!next) { error.textContent = '請輸入 Token'; return; }
            apply.disabled = true;
            try {
                await request('/tags', 'GET', undefined, next);
                token = next;
                GM_setValue(TOKEN_KEY, token);
                saved.clear();
                checked.clear();
                render();
                close();
                schedulePreload();
                if (resumeLink?.isConnected) void toggleArticle(resumeLink);
            } catch (e) {
                error.textContent = e.message;
            } finally { apply.disabled = false; }
        };
        dialog.showModal();
    }

    function scan() {
        let added = 0;
        for (const link of document.querySelectorAll('article.post-item .post-title a.post-url')) {
            if (controls.get(link)?.button.isConnected) continue;
            try { sourceAndTarget(link.href); } catch { continue; }
            const article = link.closest('article.post-item');
            const title = link.closest('.post-title');
            if (!article || !title) continue;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = BUTTON_CLASS;
            button.setAttribute('aria-live', 'polite');
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopImmediatePropagation();
                void toggleArticle(link);
            });
            article.appendChild(button);
            const control = { link, button, url: sourceAndTarget(link.href).url };
            controls.set(link, control);
            positionControl(control);
            positionObserver?.observe(article);
            positionObserver?.observe(title);
            const image = article.querySelector('.post-summary a.feature-image img');
            if (image) {
                positionObserver?.observe(image);
                image.addEventListener('load', schedulePositions, { once: true });
                image.addEventListener('error', schedulePositions, { once: true });
            }
            added++;
        }
        render();
        if (added) {
            schedulePositions();
            schedulePreload();
        }
    }

    function start() {
        const style = document.createElement('style');
        style.textContent = `
            article.post-item { position: relative !important; }
            .${BUTTON_CLASS} {
                all: unset !important; position: absolute !important;
                left: 0 !important; top: 0 !important; right: auto !important; bottom: auto !important;
                z-index: 2147483646 !important;
                display: flex !important; align-items: center !important; justify-content: center !important;
                box-sizing: border-box !important; width: 38px !important; height: 34px !important;
                margin: 0 !important; padding: 0 !important;
                border: 1px solid rgba(135,166,194,.7) !important; border-radius: 6px !important;
                font: 600 24px/1 system-ui,sans-serif !important; color: #145486 !important;
                background: rgba(241,247,255,.7) !important; opacity: .58 !important;
                text-align: center !important; cursor: pointer !important; touch-action: manipulation !important;
            }
            .${BUTTON_CLASS}:hover, .${BUTTON_CLASS}:focus-visible {
                background: rgba(219,234,255,.9) !important; opacity: 1 !important;
                outline: 2px solid #3777b7 !important;
            }
            .${BUTTON_CLASS}:disabled { opacity: .4 !important; cursor: default !important; }
            .${BUTTON_CLASS}[aria-pressed="true"] {
                color: #b67d00 !important; border-color: rgba(209,154,6,.8) !important;
                background: rgba(255,249,232,.8) !important; opacity: .82 !important;
            }
            .${BUTTON_CLASS}[data-bookmarks-error="true"] {
                border: 2px solid #d21d2b !important; outline: 2px solid #d21d2b !important;
                outline-offset: 0 !important; box-shadow: 0 0 0 1px #fff !important;
                opacity: 1 !important;
            }
            #tm-bookmarks-errors-top, #tm-bookmarks-errors-bottom {
                position: fixed !important; right: 8px !important;
                z-index: 2147483647 !important; width: min(320px, calc(100vw - 16px)) !important;
                max-height: calc(45vh - 12px) !important; overflow-y: auto !important;
                display: flex !important; flex-direction: column !important; gap: 6px !important;
                pointer-events: none !important;
            }
            #tm-bookmarks-errors-top { top: 8px !important; }
            #tm-bookmarks-errors-bottom { bottom: 8px !important; flex-direction: column-reverse !important; }
            .${ERROR_CLASS} {
                all: unset !important; position: fixed !important;
                z-index: 2147483647 !important; box-sizing: border-box !important;
                width: min(320px, calc(100vw - 16px)) !important; max-height: 150px !important;
                overflow-y: auto !important; padding: 8px 10px !important;
                border: 2px solid #b91c1c !important; border-radius: 7px !important;
                background: #fff !important; color: #8f1616 !important;
                box-shadow: 0 3px 12px #0005 !important;
                font: 13px/1.4 system-ui,sans-serif !important;
                pointer-events: auto !important; cursor: pointer !important;
                overflow-wrap: anywhere !important;
            }
            #tm-bookmarks-errors-top > .${ERROR_CLASS},
            #tm-bookmarks-errors-bottom > .${ERROR_CLASS} {
                position: relative !important; top: auto !important; left: auto !important;
                flex: 0 0 auto !important;
            }
        `;
        document.head.appendChild(style);
        ensureErrorStacks();
        positionObserver = typeof ResizeObserver === 'function'
            ? new ResizeObserver(schedulePositions) : null;
        window.addEventListener('resize', schedulePositions, { passive: true });
        window.addEventListener('scroll', scheduleErrorLayout, { passive: true, capture: true });
        captureOriginalTitles();
        scan();
        const observer = new MutationObserver(() => {
            if (scanScheduled) return;
            scanScheduled = true;
            requestAnimationFrame(() => { scanScheduled = false; scan(); });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // Start before document-end/Edge Translate. Keep collecting new article
    // nodes if the listing updates, without making any further page requests.
    const originalTitleObserver = new MutationObserver(captureOriginalTitles);
    originalTitleObserver.observe(document, { childList: true, subtree: true, characterData: true });
    captureOriginalTitles();
    void loadOriginalTitles();

    GM_registerMenuCommand('Blog Bookmarks 設定', () => openSettings());
    GM_registerMenuCommand('開啟書籤管理', () =>
        window.open('https://christorng.idv.tw/bookmarks/admin/', '_blank', 'noopener,noreferrer'));
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
