// ==UserScript==
// @name         Blog Bookmarks
// @namespace    https://christorng.idv.tw/
// @version      0.4.1
// @description  Collect links into private bookmarks
// @homepageURL  https://github.com/ChrisTorng/blog-bookmarks
// @updateURL    https://raw.githubusercontent.com/ChrisTorng/blog-bookmarks/main/tampermonkey/BlogBookmarks.user.js
// @downloadURL  https://raw.githubusercontent.com/ChrisTorng/blog-bookmarks/main/tampermonkey/BlogBookmarks.user.js
// @match        https://hackernews.betacat.io/*
// @connect      christorng.idv.tw
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// @noframes
// ==/UserScript==

(() => {
    'use strict';

    const ENDPOINT = 'https://christorng.idv.tw/bookmarks/api/ingest';
    const TOKEN_KEY = 'blog-bookmarks-ingest-token';
    const TAGS_KEY = 'blog-bookmarks-tags-cache';
    const BUTTON_CLASS = 'tm-blog-bookmarks-save';
    const TOOLBAR_CLASS = 'tm-betacat-article-tools';

    let token = GM_getValue(TOKEN_KEY, '');
    const categories = new Set(GM_getValue(TAGS_KEY, ['default']));
    const controls = new Map();
    const saved = new Map();
    const checked = new Set();
    const pending = new Set();
    const revisions = new Map();
    const failures = new Map();
    let menu = null;
    let settingsHost = null;
    let noticeHost = null;
    let scanScheduled = false;
    let preloadTimer = null;
    let preloadTask = null;
    let tagsTask = null;

    const normalize = value => {
        const url = new URL(value, location.href);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
            throw new Error('僅支援 HTTP(S) 網址');
        }
        url.hash = '';
        return url.href;
    };
    const currentRevision = url => revisions.get(url) || 0;

    function request(path, method = 'GET', body, overrideToken = token) {
        return new Promise((resolve, reject) => {
            if (!overrideToken) return reject(new Error('尚未設定 Bookmarks Token'));
            let settled = false;
            let transport;
            const finish = (fn, value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                fn(value);
            };
            const fail = message => finish(reject, new Error(message));
            const timer = setTimeout(() => {
                fail('連線逾時，請重試');
                transport?.abort?.();
            }, 15000);
            try {
                transport = GM_xmlhttpRequest({
                    method,
                    url: ENDPOINT + path,
                    timeout: 15000,
                    anonymous: true,
                    redirect: 'error',
                    headers: {
                        Authorization: 'Bearer ' + overrideToken,
                        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
                    },
                    data: body === undefined ? undefined : JSON.stringify(body),
                    onload(response) {
                        try {
                            if (response.finalUrl && new URL(response.finalUrl).origin !== new URL(ENDPOINT).origin) {
                                throw new Error('伺服器發生非預期轉址');
                            }
                            const result = JSON.parse(response.responseText);
                            if (response.status < 200 || response.status >= 300) {
                                throw new Error(result.error || '書籤服務回應錯誤');
                            }
                            finish(resolve, result);
                        } catch (error) {
                            finish(reject, error);
                        }
                    },
                    onerror: () => fail('無法連線到 Bookmarks 服務'),
                    ontimeout: () => fail('連線逾時，請重試'),
                    onabort: () => fail('連線已取消'),
                });
            } catch (error) { finish(reject, error); }
        });
    }

    function articleData(link) {
        const article = link.closest('article.post-item');
        if (!article) throw new Error('找不到文章');
        const url = normalize(link.href);
        const clean = text => String(text || '').replace(/\s+/g, ' ').trim();
        const title = clean(link.textContent).slice(0, 500);
        const summary = clean(article.querySelector('.summary-text')?.textContent).slice(0, 5000);
        return { url, title: title || new URL(url).hostname, summary };
    }

    function render() {
        for (const [link, control] of controls) {
            if (!link.isConnected || !control.button.isConnected) {
                controls.delete(link);
                continue;
            }
            const { button, url } = control;
            const entry = saved.get(url);
            const tags = entry?.tags || [];
            const label = entry ? (tags.length ? tags.join(', ') : '✓') : '☆';
            if (button.textContent !== label) button.textContent = label;
            button.disabled = pending.has(url);
            button.setAttribute('aria-pressed', String(Boolean(entry)));
            button.setAttribute('aria-busy', String(pending.has(url)));
            button.setAttribute('aria-expanded', String(menu?.link === link));
            const hint = failures.get(url) ? '儲存失敗，請重試' :
                entry ? '已收藏：' + (tags.join('、') || '無標籤') + '。點擊管理分類' :
                    '加入私人未讀書籤';
            button.title = hint;
            button.setAttribute('aria-label', hint);
        }
    }

    function rememberCategories() {
        GM_setValue(TAGS_KEY, [...categories]);
    }
    function loadCategories() {
        if (!token) return Promise.resolve();
        if (tagsTask) return tagsTask;
        const currentToken = token;
        tagsTask = request('/tags', 'GET', undefined, currentToken)
            .then(result => {
                if (token !== currentToken) return;
                for (const item of result) if (item.name) categories.add(item.name);
                rememberCategories();
                updateMenuCategories();
            }).catch(() => {
                // Previously loaded categories remain usable offline.
            }).finally(() => { tagsTask = null; });
        return tagsTask;
    }

    function schedulePreload() {
        if (!token) return;
        clearTimeout(preloadTimer);
        preloadTimer = setTimeout(() => void preload(), 250);
    }
    async function preload() {
        if (!token || preloadTask) return;
        const currentToken = token;
        const urls = [...new Set([...controls.values()].map(item => item.url))]
            .filter(url => !checked.has(url) && !pending.has(url));
        if (!urls.length) return;
        let loadedSuccessfully = true;
        preloadTask = (async () => {
            for (let i = 0; i < urls.length; i += 75) {
                const batch = urls.slice(i, i + 75);
                const originalRevisions = new Map(batch.map(url => [url, currentRevision(url)]));
                const result = await request('/status', 'POST', { urls: batch }, currentToken);
                if (currentToken !== token) return;
                for (const url of batch) {
                    if (currentRevision(url) === originalRevisions.get(url)) {
                        checked.add(url);
                    }
                }
                for (const item of result) {
                    if (currentRevision(item.url) !== originalRevisions.get(item.url)) continue;
                    saved.set(item.url, { id: item.id, tags: item.tags || [], status: item.status });
                    for (const tag of item.tags || []) categories.add(tag);
                }
                rememberCategories();
                render();
                updateMenuCategories();
            }
        })().catch(error => { loadedSuccessfully = false; console.warn('Blog Bookmarks preload:', error.message); })
            .finally(() => { preloadTask = null; });
        await preloadTask;
        if (loadedSuccessfully && currentToken === token) {
            const remain = [...controls.values()].some(item => !checked.has(item.url) && !pending.has(item.url));
            if (remain) schedulePreload();
        }
    }

    function dismissFailures() {
        if (failures.size) return;
        noticeHost?.remove();
        noticeHost = null;
    }
    function showFailures() {
        dismissFailures();
        if (!failures.size) return;
        if (!noticeHost) {
            noticeHost = document.createElement('div');
            noticeHost.style.cssText = 'position:fixed;z-index:2147483647;bottom:max(12px,env(safe-area-inset-bottom));left:12px;right:12px;pointer-events:none';
            const root = noticeHost.attachShadow({ mode: 'closed' });
            const style = document.createElement('style');
            style.textContent = `
                :host{all:initial}
                .stack{max-width:28rem;max-height:40dvh;overflow:auto;margin:auto;font:14px/1.45 system-ui,sans-serif;color:#172033}
                .notice{position:relative;pointer-events:auto;margin-top:8px;padding:12px;background:#fff;border:1px solid #b34242;border-radius:10px;box-shadow:0 4px 20px #0003}
                p{margin:0 30px 8px 0;overflow-wrap:anywhere}
                .actions{display:flex;flex-wrap:wrap;gap:7px}
                button{min-height:38px;border:1px solid #9aa9b8;border-radius:6px;padding:5px 10px;background:#f1f7ff;color:#172033;font:inherit;cursor:pointer}
                button:hover{background:#dbeaff}
                .dismiss{position:absolute;right:4px;top:4px;padding:2px 9px;border:0;background:transparent}
            `;
            const stack = document.createElement('div');
            stack.className = 'stack';
            root.append(style, stack);
            noticeHost.stack = stack;
            document.body.appendChild(noticeHost);
        }
        const stack = noticeHost.stack;
        stack.replaceChildren();
        for (const [url, failure] of failures) {
            const card = document.createElement('div');
            card.className = 'notice';
            card.setAttribute('role', 'alert');
            const message = document.createElement('p');
            message.textContent = 'Bookmarks · ' + failure.article.title.slice(0, 65) + '：' + failure.message;
            const actions = document.createElement('div');
            actions.className = 'actions';
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.textContent = '重試';
            retry.addEventListener('click', () => void saveArticle(failure.link, failure.tags));
            const choose = document.createElement('button');
            choose.type = 'button';
            choose.textContent = '選擇分類';
            choose.disabled = !failure.link.isConnected;
            choose.addEventListener('click', () => openMenu(failure.link));
            const dismiss = document.createElement('button');
            dismiss.type = 'button';
            dismiss.className = 'dismiss';
            dismiss.textContent = '×';
            dismiss.setAttribute('aria-label', '關閉錯誤訊息');
            dismiss.addEventListener('click', () => {
                failures.delete(url);
                showFailures();
            });
            actions.append(retry, choose);
            card.append(message, actions, dismiss);
            stack.appendChild(card);
        }
    }

    async function saveArticle(link, nextTags) {
        let article;
        try { article = articleData(link); }
        catch (error) { console.warn('Blog Bookmarks:', error); return; }
        const url = article.url;
        if (!token) return openSettings(link);
        if (pending.has(url)) return;
        const selected = [...new Set(nextTags.map(String).map(s => s.trim()).filter(Boolean))];
        let existing = saved.get(url);
        if (checked.has(url) && existing && JSON.stringify(existing.tags) === JSON.stringify(selected)) {
            closeMenu();
            return;
        }
        closeMenu(); // Never wait for network traffic before returning the user to the article.
        pending.add(url);
        revisions.set(url, currentRevision(url) + 1);
        failures.delete(url);
        showFailures();
        render();
        try {
            // A fast tap can race with the background prefetch. Resolve that URL before deciding
            // whether to create or update, without keeping the category popover open.
            if (!checked.has(url)) {
                const found = await request('/status', 'POST', { urls: [url] });
                checked.add(url);
                if (found.length) {
                    const entry = found[0];
                    existing = { id: entry.id, tags: entry.tags || [], status: entry.status };
                    saved.set(url, existing);
                }
            }
            if (existing && JSON.stringify(existing.tags) === JSON.stringify(selected)) return;
            const result = existing ?
                await request('/update-tags', 'POST', { url, tags: selected }) :
                await request('', 'POST', { ...article, tags: selected });
            const item = result.item || result;
            saved.set(url, { id: item.id, status: item.status, tags: item.tags || selected });
            checked.add(url);
            for (const category of selected) categories.add(category);
            rememberCategories();
            revisions.set(url, currentRevision(url) + 1);
        } catch (error) {
            failures.set(url, { link, tags: selected, article, message: error.message });
            showFailures();
        } finally {
            pending.delete(url);
            render();
        }
    }

    function closeMenu() {
        if (!menu) return;
        const closing = menu;
        menu = null;
        closing.host.remove();
        render();
    }
    function positionMenu() {
        if (!menu) return;
        const { panel, link } = menu;
        const button = controls.get(link)?.button;
        if (!button?.isConnected) return closeMenu();
        const rect = button.getBoundingClientRect();
        const viewport = window.visualViewport;
        const left = viewport?.offsetLeft ?? 0;
        const top = viewport?.offsetTop ?? 0;
        const width = viewport?.width ?? window.innerWidth;
        const height = viewport?.height ?? window.innerHeight;
        panel.style.setProperty('--menu-height', height + 'px');
        const bounds = panel.getBoundingClientRect();
        panel.style.left = Math.max(left + 8, Math.min(rect.left, left + width - bounds.width - 8)) + 'px';
        panel.style.top = Math.max(top + 8, Math.min(rect.bottom + 4, top + height - bounds.height - 8)) + 'px';
    }

    function updateMenuCategories() {
        if (!menu) return;
        const { panel, link } = menu;
        const group = panel.querySelector('.category-list');
        if (!group) return;
        const article = articleData(link);
        const selected = saved.get(article.url)?.tags || [];
        const busy = pending.has(article.url);
        group.replaceChildren();
        for (const category of [...new Set([...categories, ...selected])]) {
            const picked = selected.includes(category);
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'category';
            button.textContent = category + (picked ? ' ✓' : '');
            button.setAttribute('aria-pressed', String(picked));
            button.disabled = busy;
            button.addEventListener('click', () => {
                const tags = picked ? selected.filter(x => x !== category) : [...selected, category];
                void saveArticle(link, tags);
            });
            group.appendChild(button);
        }
        positionMenu();
    }
    function drawMenu() {
        if (!menu) return;
        const { panel, link } = menu;
        panel.replaceChildren();
        const header = document.createElement('div');
        header.className = 'menu-header';
        const heading = document.createElement('span');
        heading.className = 'caption';
        heading.textContent = '書籤分類';
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'menu-close';
        close.textContent = '×';
        close.setAttribute('aria-label', '關閉分類選單');
        close.addEventListener('click', closeMenu);
        const settings = document.createElement('button');
        settings.type = 'button';
        settings.className = 'menu-settings';
        settings.textContent = '⚙';
        settings.title = '設定';
        settings.setAttribute('aria-label', 'Bookmarks 設定');
        settings.addEventListener('click', () => { closeMenu(); openSettings(); });
        header.append(heading, settings, close);
        const list = document.createElement('div');
        list.className = 'category-list';
        const actions = document.createElement('div');
        actions.className = 'menu-actions';
        const addButton = document.createElement('button');
        addButton.type = 'button';
        addButton.textContent = '+ 新增分類';
        addButton.addEventListener('click', () => {
            const form = document.createElement('form');
            form.className = 'new-category';
            const input = document.createElement('input');
            input.placeholder = '分類名稱';
            input.maxLength = 80;
            input.autocapitalize = 'off';
            input.setAttribute('aria-label', '新增分類');
            const confirm = document.createElement('button');
            confirm.type = 'submit';
            confirm.textContent = '加入';
            form.append(input, confirm);
            actions.replaceChildren(form);
            form.addEventListener('submit', event => {
                event.preventDefault();
                const category = input.value.trim();
                if (!category || category.length > 80) return;
                categories.add(category);
                rememberCategories();
                const url = articleData(link).url;
                const existing = saved.get(url)?.tags || [];
                void saveArticle(link, [...existing, category]);
            });
            input.focus();
            positionMenu();
        });
        const manage = document.createElement('button');
        manage.type = 'button';
        manage.textContent = '管理書籤';
        manage.addEventListener('click', () => window.open('https://christorng.idv.tw/bookmarks/admin/', '_blank', 'noopener,noreferrer'));
        actions.append(addButton, manage);
        panel.append(header, list, actions);
        updateMenuCategories();
    }

    function openMenu(link) {
        if (menu?.link === link) return closeMenu();
        if (!token) return openSettings(link);
        closeMenu();
        const host = document.createElement('div');
        const shadow = host.attachShadow({ mode: 'closed' });
        const style = document.createElement('style');
        style.textContent = `
            :host{all:initial}
            .panel{box-sizing:border-box;position:fixed;z-index:2147483647;margin:0;padding:8px;width:min(360px,calc(100vw - 16px));
                max-height:calc(var(--menu-height,100dvh) - 16px);overflow:auto;border:1px solid #91a4b8;border-radius:10px;
                background:#fff;color:#18212b;box-shadow:0 6px 24px #0003;font:14px/1.35 system-ui,sans-serif}
            .panel::backdrop{background:transparent}
            button,input{box-sizing:border-box;display:block;width:100%;min-height:40px;margin:2px 0;padding:6px 9px;
                border:1px solid #c1cbd5;border-radius:6px;background:#fff;color:#18212b;font:inherit;text-align:left;overflow-wrap:anywhere}
            button{cursor:pointer;touch-action:manipulation}
            button:hover,button:focus-visible{background:#e5f1ff}
            button:disabled{opacity:.55;cursor:default}
            button[aria-pressed="true"]{color:#166c34;font-weight:700;background:#edf8ef}
            .menu-header{position:sticky;top:-8px;display:flex;align-items:center;justify-content:space-between;gap:5px;background:#fff}
            .caption{font-size:12px;font-weight:650;color:#53667b;padding:5px}
            .menu-close{flex:none;width:40px;font-size:22px;text-align:center;line-height:1}
            .menu-settings{flex:none;width:40px;font-size:20px;text-align:center;line-height:1;margin-left:auto}
            .category-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;min-width:0}
            .category-list button{min-width:0;margin:0;white-space:normal;overflow-wrap:anywhere;line-height:1.4}
            .menu-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:8px}
            .menu-actions button{min-width:0;margin:0;white-space:normal}
            .menu-actions .new-category{grid-column:1/-1}
            .new-category{display:flex;align-items:center;gap:4px;margin:3px 0}
            .new-category input{min-width:0;flex:1;font-size:16px}
            .new-category button{flex:none;width:auto}
        `;
        const panel = document.createElement('div');
        panel.className = 'panel';
        panel.setAttribute('popover', 'auto');
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Blog Bookmarks 分類');
        shadow.append(style, panel);
        document.body.appendChild(host);
        menu = { host, panel, link };
        panel.addEventListener('toggle', event => {
            if (event.newState === 'closed' && menu?.host === host) closeMenu();
        });
        panel.addEventListener('click', event => event.stopPropagation());
        drawMenu();
        panel.showPopover();
        positionMenu();
        panel.querySelector('.category')?.focus();
        render();
        // Cached categories appear instantly; refreshing never blocks this menu.
        void loadCategories();
    }

    function openSettings(resumeLink = null) {
        closeMenu();
        if (settingsHost) return;
        const host = document.createElement('div');
        const shadow = host.attachShadow({ mode: 'closed' });
        const style = document.createElement('style');
        style.textContent = `
            :host{all:initial}
            dialog{box-sizing:border-box;width:min(28rem,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;
                margin:auto;padding:20px;border:1px solid #9ba6b2;border-radius:12px;background:#fff;color:#18212b;
                font:16px/1.5 system-ui,sans-serif}
            dialog::backdrop{background:#0007}
            h2{font-size:20px;margin:0 0 12px}
            p{font-size:14px;margin:8px 0}
            label{display:block;margin-top:12px;font-size:14px}
            input{box-sizing:border-box;width:100%;min-height:44px;margin-top:5px;padding:8px;
                font:16px system-ui,sans-serif;border:1px solid #8996a3;border-radius:6px}
            .actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}
            button{min-height:44px;padding:8px 12px;border:1px solid #8996a3;border-radius:6px;font:inherit;cursor:pointer}
            button:disabled{opacity:.6}
            a{color:#1666a7}
            .error{color:#a21616;overflow-wrap:anywhere}
        `;
        const dialog = document.createElement('dialog');
        const heading = document.createElement('h2');
        heading.textContent = 'Blog Bookmarks 設定';
        const guide = document.createElement('p');
        guide.textContent = '在書籤管理後台產生 Tampermonkey Token，貼到這裡。Token 僅儲存在此裝置的 Tampermonkey。';
        const link = document.createElement('a');
        link.href = 'https://christorng.idv.tw/bookmarks/admin/';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = '開啟書籤管理後台 ↗';
        const label = document.createElement('label');
        label.textContent = '新增書籤 Token';
        const input = document.createElement('input');
        input.type = 'password';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.value = token;
        label.appendChild(input);
        const error = document.createElement('p');
        error.className = 'error';
        error.setAttribute('role', 'alert');
        const actions = document.createElement('div');
        actions.className = 'actions';
        const cancel = document.createElement('button');
        cancel.textContent = '取消';
        const apply = document.createElement('button');
        apply.textContent = '儲存';
        actions.append(cancel, apply);
        dialog.append(heading, guide, link, label, error, actions);
        shadow.append(style, dialog);
        document.body.appendChild(host);
        settingsHost = host;
        function close() {
            input.value = '';
            host.remove();
            if (settingsHost === host) settingsHost = null;
        }
        cancel.addEventListener('click', close);
        dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
        apply.addEventListener('click', async () => {
            const next = input.value.trim();
            if (!next) { error.textContent = '請輸入 Token'; return; }
            apply.disabled = true;
            error.textContent = '';
            try {
                const response = await request('/tags', 'GET', undefined, next);
                token = next;
                GM_setValue(TOKEN_KEY, token);
                checked.clear();
                saved.clear();
                for (const entry of response) if (entry.name) categories.add(entry.name);
                rememberCategories();
                render();
                close();
                schedulePreload();
                if (resumeLink?.isConnected) openMenu(resumeLink);
            } catch (e) {
                if (settingsHost === host) error.textContent = e.message;
            } finally { apply.disabled = false; }
        });
        dialog.showModal();
    }

    function scan() {
        let added = 0;
        for (const link of document.querySelectorAll('article.post-item .post-title a.post-url')) {
            if (controls.get(link)?.button.isConnected) continue;
            try { articleData(link); } catch { continue; }
            const article = link.closest('article.post-item');
            const title = link.closest('.post-title');
            if (!article || !title) continue;
            let toolbar = article.querySelector(':scope > .' + TOOLBAR_CLASS);
            if (!toolbar) {
                toolbar = document.createElement('div');
                toolbar.className = TOOLBAR_CLASS;
                const anchor = article.querySelector(':scope > .post-title') ||
                    [...article.children].find(child => child.contains(title)) || article.firstChild;
                article.insertBefore(toolbar, anchor);
            }
            const oldCollapseButton = article.querySelector(':scope > .auto-open-new-articles-item-toggle');
            if (oldCollapseButton) toolbar.prepend(oldCollapseButton);
            const button = document.createElement('button');
            button.type = 'button';
            button.className = BUTTON_CLASS;
            button.setAttribute('aria-haspopup', 'dialog');
            button.setAttribute('aria-live', 'polite');
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopImmediatePropagation();
                openMenu(link);
            });
            toolbar.appendChild(button);
            controls.set(link, { button, url: normalize(link.href) });
            added++;
        }
        render();
        if (added) schedulePreload();
    }
    function start() {
        const style = document.createElement('style');
        style.textContent = `
            article.post-item.auto-open-new-articles-managed{padding-left:0!important}
            article.post-item > .${TOOLBAR_CLASS}{display:flex!important;align-items:flex-start!important;
                justify-content:space-between!important;gap:8px!important;min-height:32px!important;
                min-width:0!important;width:100%!important;box-sizing:border-box!important;
                padding:0!important;margin:0 0 6px!important;clear:both!important}
            article.post-item > .${TOOLBAR_CLASS} > .auto-open-new-articles-item-toggle{
                position:static!important;left:auto!important;top:auto!important;flex:0 0 28px!important;
                width:28px!important;height:28px!important;min-height:28px!important;line-height:26px!important}
            .${BUTTON_CLASS}{all:unset!important;display:block!important;box-sizing:border-box!important;
                flex:0 1 auto!important;max-width:calc(100% - 38px)!important;min-width:35px!important;min-height:32px!important;
                margin:0 0 0 auto!important;padding:4px 8px!important;border:1px solid #87a6c2!important;
                border-radius:6px!important;font:500 17px/1.3 system-ui,sans-serif!important;
                color:#145486!important;background:#f1f7ff!important;
                white-space:normal!important;overflow-wrap:anywhere!important;word-break:normal!important;
                text-align:right!important;cursor:pointer!important;touch-action:manipulation!important}
            .${BUTTON_CLASS}:hover,.${BUTTON_CLASS}:focus-visible{
                background:#dbeaff!important;outline:2px solid #3777b7!important}
            .${BUTTON_CLASS}:disabled{opacity:.7!important;cursor:default!important}
            .${BUTTON_CLASS}[aria-pressed="true"]{font-size:13px!important;color:#166c34!important;border-color:#519467!important}
        `;        document.head.appendChild(style);
        scan();
        new MutationObserver(() => {
            if (scanScheduled) return;
            scanScheduled = true;
            requestAnimationFrame(() => { scanScheduled = false; scan(); });
        }).observe(document.body, { childList: true, subtree: true });
        window.addEventListener('resize', positionMenu);
        window.addEventListener('scroll', positionMenu);
        window.visualViewport?.addEventListener('resize', positionMenu);
        window.visualViewport?.addEventListener('scroll', positionMenu);
        GM_registerMenuCommand('Blog Bookmarks 設定', () => openSettings());
        void loadCategories();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else start();
})();
