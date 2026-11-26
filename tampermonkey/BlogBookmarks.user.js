// ==UserScript==
// @name         Blog Bookmarks
// @namespace    https://christorng.idv.tw/
// @version      0.5.29
// @description  BetaCat reading/navigation, popularity, mobile layout, background article tabs and bookmarks
// @homepageURL  https://github.com/ChrisTorng/blog-bookmarks
// @updateURL    https://raw.githubusercontent.com/ChrisTorng/blog-bookmarks/main/tampermonkey/BlogBookmarks.user.js
// @downloadURL  https://raw.githubusercontent.com/ChrisTorng/blog-bookmarks/main/tampermonkey/BlogBookmarks.user.js
// @match        https://hackernews.betacat.io/*
// @match        *://*/*
// @connect      christorng.idv.tw
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @run-at       document-start
// ==/UserScript==

// Share the existing no-store original-title response with the reading controls.
let blogBookmarksBetaCatPageTask;

// Cross-tab article capture. Idle on all non-BetaCat sites unless the admin
// explicitly queued a matching URL. No separate installed script is required.
(function articleCaptureBridge() {
 'use strict';
 const jobsKey='blog-bookmarks:capture-jobs:v1', resultsKey='blog-bookmarks:capture-results:v1';
 const reqEvent='blog-bookmarks:capture-request', queuedEvent='blog-bookmarks:capture-queued';
 const resultEvent='blog-bookmarks:capture-result', ackEvent='blog-bookmarks:capture-ack';
 const ttl=30*60*1000, idOK=id=>/^[a-f0-9-]{36}$/i.test(String(id||''));
 const records=key=>{const v=GM_getValue(key,{});return v&&typeof v==='object'&&!Array.isArray(v)?v:{};};
 const live=key=>Object.fromEntries(Object.entries(records(key)).filter(([,v])=>v&&
  Date.now()-Number(v.createdAt??v.capturedAt)<ttl&&Number(v.createdAt??v.capturedAt)<=Date.now()+60000&&idOK(v.id)));
 const canonical=value=>{try{const u=new URL(value);if(!/^https?:$/.test(u.protocol))return '';u.hash='';u.pathname=u.pathname.replace(/\/+$/,'')||'/';return u.href;}catch{return '';}};
 const inFrame=!!window.top&&window!==window.top;
 const viewer=location.hostname==='christorng.idv.tw'&&location.pathname==='/TampermonkeyScripts/IframeViewer.html';
 const sourceUrl=viewer?canonical(new URL(location.href).searchParams.get('url')):canonical(location.href);
 const frameChannel='blog-bookmarks:embedded-capture:v1';
 const archive=host=>/^archive\.(?:is|today|ph|vn|md)$/.test(host);
 if(!inFrame&&location.hostname==='christorng.idv.tw'&&/^\/bookmarks\/admin\/quick\/?$/.test(location.pathname)){
  window.addEventListener(reqEvent,event=>{
   const {id,url,manual=false}=event.detail||{},target=canonical(url);
   if(!idOK(id)||!target)return;
   const jobs=live(jobsKey),nonce=globalThis.crypto?.randomUUID?.()||String(Date.now())+Math.random();
   jobs[id]={id,url:target,nonce,manual:manual===true,createdAt:Date.now()};
   GM_setValue(jobsKey,jobs);
   window.dispatchEvent(new CustomEvent(queuedEvent,{detail:{id,nonce}}));
  });
  window.addEventListener(ackEvent,event=>{
   const {id,nonce}=event.detail||{};
   if(!idOK(id)||!nonce)return;
   for(const key of [resultsKey,jobsKey]){
    const values=live(key);
    if(values[id]?.nonce===nonce){delete values[id];GM_setValue(key,values);}
   }
  });
  const deliver=()=>{
   const jobs=live(jobsKey);
   for(const result of Object.values(live(resultsKey)))
    if(jobs[result.id]?.nonce===result.nonce)
     window.dispatchEvent(new CustomEvent(resultEvent,{detail:result}));
  };
  if(typeof GM_addValueChangeListener==='function')GM_addValueChangeListener(resultsKey,deliver);
  document.addEventListener('DOMContentLoaded',deliver);
  window.addEventListener('pageshow',deliver);
  window.addEventListener('blog-bookmarks:capture-deliver',deliver);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')deliver();});
  return;
 }
 if(!/^https?:$/.test(location.protocol))return;
 let active=null;
 const identity=value=>{
  try{
   const u=new URL(canonical(value));
   const host=u.hostname.replace(/^www\./,'');
   const rg=host==='researchgate.net'&&u.pathname.match(/^\/publication\/(\d+)(?:_|\/|$)/);
   if(rg)return 'researchgate:'+rg[1];
   for(const k of [...u.searchParams.keys()])if(/^utm_/i.test(k)||/^(fbclid|gclid|msclkid)$/i.test(k))u.searchParams.delete(k);
   u.searchParams.sort();
   return host+u.pathname+u.search;
  }catch{return '';}
 };
 if(inFrame){
  // Only a matching, explicitly queued top-level bookmark can authorize capture.
  // Text goes directly to userscript storage, never to the embedding page.
  let previous='',stableAt=0,previousNonce='';
  window.addEventListener('message',event=>{
   if(event.source!==window.parent||window.parent!==window.top)return;
   const data=event.data;
   if(!data||data.channel!==frameChannel||!idOK(data.id))return;
   const job=live(jobsKey)[data.id];
   if(!job||job.nonce!==data.nonce||identity(job.url)!==identity(data.url))return;
   try{if(new URL(job.url).origin!==event.origin)return;}catch{return;}
   if(live(resultsKey)[job.id]?.nonce===job.nonce||!document.body||document.body.querySelector('input[type="password"]'))return;
   const article=extractEmbedded(document.body,data.manual===true);
   if(!article){previous='';stableAt=0;return;}
   if(previousNonce!==job.nonce||previous!==article){previous=article;previousNonce=job.nonce;stableAt=Date.now();if(!data.manual)return;}
   if(!data.manual&&Date.now()-stableAt<1100)return;
   const results=live(resultsKey);
   results[job.id]={id:job.id,nonce:job.nonce,url:job.url,content:article,capturedAt:Date.now()};
   GM_setValue(resultsKey,results);
  });
  return;
 }
 function extractEmbedded(root,manual){
  const copy=root.cloneNode(true);
  copy.querySelectorAll('script,style,noscript,nav,footer,aside,form,button,svg,iframe,[aria-hidden="true"],[hidden],.ads,.comments,.related-posts,.sidebar').forEach(el=>el.remove());
  const text=(copy.innerText||copy.textContent||'').trim().slice(0,90000);
  if(/^(just a moment|attention required|verify you are human|checking your browser|access denied|security verification|安全驗證)/i.test(document.title||''))return '';
  if(text.length<2800&&/(verify (you are |that you are )?(a )?human|complete (the )?(captcha|security check)|機器人驗證|人機驗證|請完成驗證)/i.test(text))return '';
  return text.length>=(manual?120:300)?text:'';
 }
 function scan(initial=false){
  const jobs=Object.values(live(jobsKey)),here=identity(sourceUrl);
  const matches=jobs.filter(j=>here&&identity(j.url)===here);
  const archived=jobs.filter(j=>{try{return archive(new URL(j.url).hostname)&&archive(location.hostname);}catch{return false;}});
  // Retain the existing archive navigation fallback only during initial navigation,
  // or for a retry of the same bookmark already associated with this tab.
  const job=matches.length===1?matches[0]:!matches.length&&archived.length===1&&
   (initial||active?.id===archived[0].id)?archived[0]:null;
  if(!job||live(resultsKey)[job.id]?.nonce===job.nonce){if(active){active.stop();active=null;}return;}
  if(active?.nonce===job.nonce)return;
  active?.stop();
  active={id:job.id,nonce:job.nonce,stop:start(job)};
 }
 if(typeof GM_addValueChangeListener==='function')GM_addValueChangeListener(jobsKey,()=>scan());
 window.addEventListener('pageshow',()=>scan());
 window.addEventListener('focus',()=>scan());
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scan();});
 document.addEventListener('DOMContentLoaded',()=>scan());
 scan(true);
 function start(job){
 let done=false,button,timer,observer,last='',stableAt=0,checkTimeout,showTimeout;
 const stop=()=>{done=true;clearInterval(timer);clearTimeout(checkTimeout);clearTimeout(showTimeout);observer?.disconnect();button?.remove();document.removeEventListener('DOMContentLoaded',begin);};
 const isChallenge=()=>{
  const title=document.title||'';
  if(/^(just a moment|attention required|verify you are human|checking your browser|access denied|security verification|安全驗證)/i.test(title.trim()))return true;
  const text=(document.body?.textContent||'').slice(0,3000);
  return text.length<2800&&/(verify (you are |that you are )?(a )?human|checking if (the )?site connection is secure|cf-challenge|cloudflare ray id|complete (the )?(captcha|security check)|please (enter|solve).{0,35}captcha|i am not a robot|機器人驗證|人機驗證|請完成驗證)/i.test(text);
 };
 const read=node=>{
  const copy=node.cloneNode(true);
  copy.querySelectorAll('script,style,noscript,nav,footer,aside,form,button,svg,iframe,[aria-hidden="true"],.ads,.comments,.related-posts,.sidebar').forEach(el=>el.remove());
  const blocks=[...copy.querySelectorAll('h1,h2,h3,p,li,blockquote')]
   .map(el=>(el.textContent||'').replace(/\s+/g,' ').trim()).filter(t=>t.length>=28);
  const text=(blocks.length>=3?blocks.join('\n'):copy.textContent||'').trim().slice(0,90000);
  return {text,prose:blocks.filter(t=>t.length>=65).length};
 };
 const extract=(manual=false)=>{
  if(!document.body||isChallenge())return null;
  if(viewer){const root=document.getElementById('iframe-viewer-content');if(!root||document.getElementById('iframe-viewer-status'))return null;const text=extractEmbedded(root,manual);return text?{text}:null;}
  const elements=[...document.querySelectorAll('article,[itemprop="articleBody"],[data-testid="article-body"],.article-body,.article-content,.entry-content,.post-content,.publication-content,.publication-body,.publication-abstract,.nova-legacy-e-text,main,[role="main"],#article')].slice(0,60);
  let best=null;
  for(const el of elements){
   const item=read(el);
   if((manual?item.text.length>=120:item.text.length>=300&&(item.prose>=2||item.prose===1&&item.text.length>=450))&&(!best||item.text.length>best.text.length))best=item;
  }
  if(!best&&manual){const fallback=read(document.body);if(fallback.text.length>=120)best=fallback;}
  return best;
 };
 const requestFrame=manual=>{
  if(viewer)return false;
  const frames=[...document.querySelectorAll('iframe')].map(frame=>{
   if(!frame.contentWindow||!frame.getAttribute?.('src'))return {frame,area:0};
   try{const u=new URL(frame.getAttribute('src'),location.href);if(!/^https?:$/.test(u.protocol)||/(^|\.)(youtube\.com|youtube-nocookie\.com|vimeo\.com|google\.com|recaptcha\.net|doubleclick\.net)$/.test(u.hostname))return {frame,area:0};}catch{return {frame,area:0};}
   const rect=frame.getBoundingClientRect?.();
   return {frame,area:rect&&rect.width>=180&&rect.height>=85?rect.width*rect.height:0};
  }).filter(item=>item.area&&item.frame.contentWindow).sort((a,b)=>b.area-a.area);
  const frame=frames[0]?.frame;
  if(!frame)return false;
  try{frame.contentWindow.postMessage({channel:frameChannel,id:job.id,nonce:job.nonce,url:job.url,manual},'*');return true;}catch{return false;}
 };
 const showButton=()=>{
  if(button||!document.body)return;
  button=document.createElement('button');
  button.type='button';button.textContent='立即擷取本文送回書籤';
  button.id='tm-blog-bookmarks-capture-article';
  button.style.cssText='position:fixed!important;right:12px!important;bottom:max(16px,env(safe-area-inset-bottom))!important;z-index:2147483647!important;padding:11px 15px!important;border-radius:999px!important;border:2px solid #fff!important;background:#126a4f!important;color:#fff!important;font:600 14px/1.3 system-ui,sans-serif!important;box-shadow:0 2px 12px #0006!important;max-width:calc(100vw - 24px)!important;cursor:pointer!important';
  button.addEventListener('click',()=>{
   if(isChallenge()){button.textContent='先完成機器人驗證，再按此鈕';return;}
   const normal=extract(false);
   if(normal){send(normal.text);return;}
   if(requestFrame(true)){button.textContent='正在擷取內嵌正文…';return;}
   const article=extract(true);
   if(!article){button.textContent='尚未取得正文，請稍後再按';return;}
   send(article.text);
  });
  document.body.appendChild(button);
 };
 function send(text){
  if(done||!text||live(jobsKey)[job.id]?.nonce!==job.nonce)return;
  done=true;clearInterval(timer);clearTimeout(checkTimeout);observer?.disconnect();
  const results=live(resultsKey);
  results[job.id]={id:job.id,nonce:job.nonce,url:viewer?job.url:location.href,content:text,capturedAt:Date.now()};
  GM_setValue(resultsKey,results);
  if(button){button.disabled=true;button.textContent='全文已送回書籤頁';setTimeout(()=>button.remove(),3600);}
 }
 const check=()=>{
  if(done)return;
  if(live(jobsKey)[job.id]?.nonce!==job.nonce||live(resultsKey)[job.id]?.nonce===job.nonce){stop();return;}
  let found=extract(false);
  if(!found&&!isChallenge()&&requestFrame(job.manual))return;
  if(!found&&job.manual)found=extract(true);
  if(!found){last='';stableAt=0;return;}
  if(last!==found.text){last=found.text;stableAt=Date.now();return;}
  if(Date.now()-stableAt>=1100)send(found.text);
 };
 function begin(){
  if(done)return;
  if(job.manual){showButton();const normal=extract(false);if(normal){send(normal.text);return;}if(!isChallenge()&&!requestFrame(true)){const found=extract(true);if(found){send(found.text);return;}}}
  check();
  timer=setInterval(check,1700);
  observer=new MutationObserver(()=>{if(!done){clearTimeout(checkTimeout);checkTimeout=setTimeout(check,850);}});
  observer.observe(document.body||document.documentElement,{childList:true,subtree:true});
  showTimeout=setTimeout(()=>{if(!done)showButton();},1500);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',begin,{once:true});
 else begin();
 return stop;
 }
})();


(() => {
    'use strict';
    if ((window.top && window !== window.top) || new URL(location.href).hostname !== 'hackernews.betacat.io') return;
    const ENDPOINT = 'https://christorng.idv.tw/bookmarks/api/ingest';
    const TOKEN_KEY = 'blog-bookmarks-ingest-token';
    const BUTTON_CLASS = 'tm-blog-bookmarks-save';
    const STAR_WIDTH = 38;
    const STAR_HEIGHT = 52;
    const ERROR_CLASS = 'tm-bookmarks-error-notice';
    const controls = new Map();
    const saved = new Map();
    const checked = new Set();
    const pending = new Set();
    const revisions = new Map();
    const errors = new Map();
    const originalTitles = new Map();
    const previewScores = new Map();
    const observedUrls = new Set();
    const viewedUrls = new Set();
    const snapshotId = globalThis.crypto?.randomUUID?.() || '00000000-0000-4000-8000-' + Math.floor(Math.random()*281474976710656).toString(16).padStart(12,'0');
    let previewTimer,previewTask=Promise.resolve(),pollCount=0,summaryObserver;

    let token = GM_getValue(TOKEN_KEY, '');
    let originalTitleTask;
    let preloadTask;
    let preloadTimer;
    let settingsHost;
    let scanScheduled = false;
    let positionScheduled = false;
    let errorLayoutScheduled = false;
    let positionObserver;
    let collapseObserver;
    let topErrorStack;
    let bottomErrorStack;
    let lastScreenHeight = 0;

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
                return { doc, receivedAt: Date.now() };
            })
            .catch(error => { console.debug('Blog Bookmarks: original title unavailable', error); return null; });
        blogBookmarksBetaCatPageTask = originalTitleTask;
        return originalTitleTask;
    }


    function imageUrlForArticle(article) {
        const image = article?.querySelector('.post-summary .feature-image img');
        const source = image?.getAttribute?.('src') || image?.src;
        if (!source) return null;
        try {
            const url = new URL(source, location.href);
            return url.protocol === 'https:' && url.hostname === 'hackernews.betacat.io'
                && url.pathname.startsWith('/image/') ? url.href : null;
        } catch { return null; }
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
            image_url: imageUrlForArticle(article),
            tags: []
        };
    }


    function metaNumber(element) {
        const match=String(element?.textContent||'').replace(/,/g,'').match(/(\d+(?:\.\d+)?)\s*([km])?/i);
        return match?Math.round(Number(match[1])*(match[2]?.toLowerCase()==='k'?1000:match[2]?.toLowerCase()==='m'?1000000:1)):null;
    }
    function previewArticle(control) {
        const article=control.link.closest('article.post-item');
        const data=articleData(control.link);
        let hn_id=null;
        try {
            const u=new URL(article?.querySelector('a[rel="comment"],.post-meta .comment a')?.href||'',location.href);
            if(u.hostname==='news.ycombinator.com')hn_id=u.searchParams.get('id');
        }catch{}
        return {url:control.url,title:data.title,title_original:data.title_original||data.title,
            summary:data.summary,hn_id,points:metaNumber(article?.querySelector('.post-meta .score')),
            comments:metaNumber(article?.querySelector('.post-meta .comment'))};
    }
    function useScores(items){
        for(const item of items||[])if(item?.url)previewScores.set(item.url,item);
        // Keep a bounded local list so directly reopened known articles do
        // not require sending unrelated browsing URLs to the bookmark API.
        const stored=GM_getValue('blog-bookmarks:reading-known:v1',{});
        const known=stored&&typeof stored==='object'&&!Array.isArray(stored)?stored:{};
        for(const item of items||[])if(item?.url)known[item.url]={source:item.url,at:Date.now()};
        GM_setValue('blog-bookmarks:reading-known:v1',Object.fromEntries(Object.entries(known)
          .filter(([,v])=>v?.source&&Date.now()-v.at<30*86400000)
          .sort((a,b)=>b[1].at-a[1].at).slice(0,800)));
        render();
    }
    function scheduleSnapshot(){
        if(!token||previewTimer)return;
        previewTimer=setTimeout(()=>{
            previewTimer=null;
            previewTask=previewTask.catch(()=>{}).then(async()=>{
                await originalTitleTask?.catch(()=>{});
                const articles=[];
                for(const control of controls.values()){
                    if(observedUrls.has(control.url))continue;
                    try{articles.push(previewArticle(control));}catch{}
                }
                for(let i=0;i<articles.length;i+=50){
                    const batch=articles.slice(i,i+50);
                    try{
                        const response=await request('/preview','POST',{mode:'snapshot',snapshot_id:snapshotId,page_url:location.href,items:batch});
                        batch.forEach(x=>observedUrls.add(x.url));
                        useScores(response.predictions);
                    }catch(error){console.warn('BetaCats observation:',error.message);}
                }
                if(articles.length && pollCount===0)scheduleScorePoll();
            });
        },450);
    }
    function scheduleScorePoll(){
        if(!token||pollCount>=5)return;
        pollCount++;
        setTimeout(async()=>{
            const articles=[];
            for(const control of controls.values())try{articles.push(previewArticle(control));}catch{}
            for(let i=0;i<articles.length;i+=50)try{
                const response=await request('/preview','POST',{mode:'lookup',items:articles.slice(i,i+50)});
                useScores(response.predictions);
            }catch(error){console.warn('BetaCats score update:',error.message);}
            if(document.visibilityState==='visible')scheduleScorePoll();
        },7000);
    }
    function recordViewed(control){
        if(!token||viewedUrls.has(control.url))return;
        viewedUrls.add(control.url);
        void previewTask.catch(()=>{}).then(()=>request('/preview','POST',{
            mode:'viewed',snapshot_id:snapshotId,items:[{url:control.url}]
        })).catch(error=>console.warn('BetaCats viewed summary:',error.message));
    }
    // 0–100 maps linearly from dark ochre to saturated bright yellow.
    // Increasing HSL lightness toward white washed out high scores in dark
    // mode. RGB components rise linearly without losing yellow saturation.
    // Alpha belongs to each background, not the whole button, preserving text
    // contrast and the distinct saved-state star on dark or light pages.
    function scoreAppearance(value) {
        const score = Number(value);
        if (value == null || !Number.isFinite(score))
            return { background: 'rgba(63, 63, 48, 0.82)', foreground: '#ffffff' };
        const ratio = Math.max(0, Math.min(100, score)) / 100;
        const red = Math.round(70 + 185 * ratio);
        const green = Math.round(52 + 168 * ratio);
        const blue = Math.round(2 + 4 * ratio);
        return {
            background: 'rgba(' + red + ', ' + green + ', ' + blue + ', 0.82)',
            foreground: ratio >= 0.58 ? '#15190e' : '#ffffff'
        };
    }

    function render() {
        for (const [link, control] of controls) {
            if (!link.isConnected || !control.button.isConnected) {
                // The fixed center star lives under body. Remove it if its
                // source article is replaced, otherwise it becomes an orphan.
                if (!link.isConnected) {control.button.remove();control.readingBadge?.remove();}
                controls.delete(link);
                continue;
            }
            const { button, url } = control;
            const exists = saved.has(url);
            const label = exists ? '★' : '☆';
            // Keep the star in one permanent element. Browser translation can
            // wrap or replace text nodes, so firstChild must never be used to
            // decide whether to insert another star.
            if (control.glyph) {
                if (control.glyph.textContent !== label) control.glyph.textContent = label;
            } else if (!control.scoreBadge && button.textContent !== label) {
                // Existing test harness / legacy controls without a score badge.
                button.textContent = label;
            }
            const insight=previewScores.get(url);
            if (control.readingBadge) {
                const r=insight?.reading;
                const label=r?.minutes!=null?((r.cjk||0)>0?(r.cjk+' 字'+(r.english?' / '+r.english+' words':'')):r.english+' words')+' · 約 '+r.minutes+' 分鐘':'長度未知';
                if(control.readingBadge.textContent!==label)control.readingBadge.textContent=label;
            }
            const chip=control.scoreBadge;
            const score = insight && Number.isFinite(Number(insight.publish))
                ? Math.max(0, Math.min(100, Math.round(Number(insight.publish)))) : null;
            const scoreText = score === null ? '…' : String(score);
            if (chip && chip.textContent !== scoreText) chip.textContent = scoreText;
            if (control.lastScore !== score) {
                const appearance = scoreAppearance(score);
                button.style.setProperty('--tm-bookmarks-score-bg', appearance.background);
                button.style.setProperty('--tm-bookmarks-score-fg', appearance.foreground);
                control.lastScore = score;
            }
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
            const details=insight?' · 偏好傾向 收藏'+insight.interest+' 公開'+insight.publish+' 推薦'+insight.recommend+'（'+(insight.basis==='decision-ai'?'AI':'規則')+' 初評，未校準為機率）· '+insight.reason:'';
            button.title=hint+details;
            button.setAttribute('aria-label',hint+(insight?' · 公開傾向'+insight.publish:''));
        }
    }

    // Android Edge changes 100dvh when its translation/address/bottom bars appear.
    // Estimate a stable physical-screen Y from the constant screen height plus
    // the changing viewport height. The 12% / 32% fit comes from the two
    // 709x1536 device screenshots (visible page starts at roughly y=145/50).
    // This is a device-UI heuristic, not an API for detecting browser chrome.
    // CSS performs smooth fixed positioning; JS only changes modes at the
    // article's title/bottom boundaries.
    function useMobileScreenAnchor() {
        const screenHeight = window.screen?.height;
        const viewportWidth = window.visualViewport?.width || window.innerWidth;
        return Number.isFinite(screenHeight) && screenHeight > 0 &&
            viewportWidth <= 768 && screenHeight > viewportWidth;
    }

    function pinnedStarY() {
        const visual = window.visualViewport;
        const viewportHeight = visual?.height || window.innerHeight ||
            document.documentElement.clientHeight;
        if (useMobileScreenAnchor()) {
            return 0.12 * window.screen.height + 0.32 * viewportHeight;
        }
        return visual ? visual.offsetTop + visual.height / 2 : viewportHeight / 2;
    }

    function updateScreenHeightVariable() {
        const screenHeight = window.screen?.height;
        if (!Number.isFinite(screenHeight) || screenHeight <= 0 ||
            lastScreenHeight === screenHeight) return;
        lastScreenHeight = screenHeight;
        document.documentElement.style.setProperty('--tm-bookmarks-screen-anchor-base',
            `${(screenHeight * 0.12).toFixed(3)}px`);
    }

    function positionControl(control) {
        const article = control.link.closest('article.post-item');
        if (!article || !article.isConnected) return;
        const titleRect = article.querySelector('.post-title')?.getBoundingClientRect();
        if (!titleRect) return;
        const articleRect = article.getBoundingClientRect();
        const summaryRect = article.querySelector('.post-summary')?.getBoundingClientRect();
        const collapsed = article.classList?.contains('auto-open-new-articles-collapsed') ||
            !summaryRect || summaryRect.width <= 0 || summaryRect.height <= 0;
        const titleTop = Math.max(0, titleRect.bottom - articleRect.top - STAR_HEIGHT / 2 - 2);
        const bottomStop = Math.max(titleTop,
            articleRect.bottom - articleRect.top - STAR_HEIGHT - 4);
        const targetTop = pinnedStarY() - articleRect.top - STAR_HEIGHT / 2;
        const mode = collapsed || targetTop <= titleTop ? 'title'
            : targetTop >= bottomStop ? 'bottom' : 'center';

        if (mode !== control.positionMode) {
            // Keep the same button/event handler; only change its layout host.
            if (mode === 'center') document.body.appendChild(control.button);
            else article.appendChild(control.button);
            control.button.style.removeProperty('left');
            control.button.style.removeProperty('top');
            control.button.setAttribute('data-bookmarks-position', mode);
            control.positionMode = mode;
            control.positionLeft = undefined;
            control.positionTop = undefined;
        }
        if (mode === 'center') return; // CSS owns fixed right:0 and stable screen anchor.

        // Absolute endpoints scroll with the article without any JS motion.
        // Deliberately allow left to exceed the article's width to reach the
        // actual viewport edge, even for a narrow/centered content column.
        const viewportRight = document.documentElement.clientWidth || window.innerWidth;
        const left = Math.round(viewportRight - articleRect.left - STAR_WIDTH);
        const top = Math.round(mode === 'title' ? titleTop : bottomStop);
        if (left !== control.positionLeft) {
            control.button.style.setProperty('left', left + 'px', 'important');
            control.positionLeft = left;
        }
        if (top !== control.positionTop) {
            control.button.style.setProperty('top', top + 'px', 'important');
            control.positionTop = top;
        }
    }

    function schedulePositions() {
        if (positionScheduled) return;
        positionScheduled = true;
        requestAnimationFrame(() => {
            positionScheduled = false;
            for (const control of controls.values()) positionControl(control);
            if (errors.size) scheduleErrorLayout();
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
                // A center star is fixed in body; scroll the source article.
                (control?.link.closest('article.post-item') || control?.button)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
            void request('/preview','POST',{mode:'selection',snapshot_id:snapshotId,items:[{url:key}],selected:!serverEntry})
                .catch(error=>console.warn('BetaCats star event:',error.message));
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
                const images = [...controls.values()]
                    .filter(control => batch.includes(control.url))
                    .map(control => ({
                        url: control.url,
                        image_url: imageUrlForArticle(control.link.closest('article.post-item'))
                    })).filter(item => item.image_url);
                const found = await request('/status', 'POST', { urls: batch, images }, currentToken);
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
                scheduleSnapshot();
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
            button.className = BUTTON_CLASS + ' notranslate';
            button.setAttribute('translate', 'no');
            const glyph = document.createElement('span');
            glyph.className = 'tm-bookmarks-glyph notranslate';
            glyph.setAttribute('translate', 'no');
            glyph.textContent = '☆';
            const scoreBadge = document.createElement('span');
            scoreBadge.className = 'tm-bookmarks-predict notranslate';
            scoreBadge.setAttribute('translate', 'no');
            scoreBadge.textContent = '…';
            scoreBadge.setAttribute('aria-hidden', 'true');
            button.append(scoreBadge, glyph);
            button.setAttribute('aria-live', 'polite');
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopImmediatePropagation();
                void toggleArticle(link);
            });
            article.appendChild(button);
            const readingBadge=document.createElement('span');
            readingBadge.className='tm-bookmarks-reading-length notranslate';
            readingBadge.setAttribute('translate','no');
            readingBadge.style.cssText='display:inline-block;font-size:.78em;opacity:.72;margin-inline-start:.5em;white-space:normal';
            readingBadge.textContent='長度未知';
            link.insertAdjacentElement('afterend',readingBadge);
            const control = { link, button, glyph, scoreBadge, readingBadge, url: sourceAndTarget(link.href).url };
            controls.set(link, control);
            const previewSummary=article.querySelector('.post-summary');
            if(previewSummary)summaryObserver?.observe(previewSummary);
            positionControl(control);
            positionObserver?.observe(article);
            positionObserver?.observe(title);
            const summary = article.querySelector('.post-summary');
            if (summary) positionObserver?.observe(summary);
            collapseObserver?.observe(article, { attributes: true, attributeFilter: ['class'] });
            added++;
        }
        render();
        if (added) {
            schedulePositions();
            schedulePreload();
            scheduleSnapshot();
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
                display: flex !important; flex-direction: column !important;
                align-items: center !important; justify-content: center !important;
                gap: 0 !important;
                box-sizing: border-box !important; width: 38px !important; height: 52px !important;
                margin: 0 !important; padding: 0 !important;
                border: 1px solid rgba(135,166,194,.7) !important; border-radius: 6px !important;
                font: 600 24px/1 system-ui,sans-serif !important;
                color: #ffffff !important;
                background: rgba(35,45,39,.35) !important;
                overflow: hidden !important;
                opacity: 1 !important;
                text-align: center !important; cursor: pointer !important; touch-action: manipulation !important;
            }
            .${BUTTON_CLASS}[data-bookmarks-position="center"] {
                position: fixed !important; left: auto !important; right: 0 !important;
                top: 50vh !important; top: 50dvh !important; bottom: auto !important;
                transform: translateY(-50%) !important;
            }
            @media (max-width: 768px) and (orientation: portrait) {
                .${BUTTON_CLASS}[data-bookmarks-position="center"] {
                    top: calc(var(--tm-bookmarks-screen-anchor-base, 84px) + 32dvh) !important;
                }
            }
            .tm-bookmarks-predict, .tm-bookmarks-glyph {
                position: static !important; inset: auto !important;
                transform: none !important; margin: 0 !important; padding: 0 !important;
                box-sizing: border-box !important; display: block !important;
                width: 100% !important; flex-shrink: 0 !important;
                border: 0 !important;
                text-align: center !important;
                white-space: nowrap !important; pointer-events: none !important;
                opacity: 1 !important;
            }
            .tm-bookmarks-predict {
                height: 18px !important; line-height: 18px !important;
                font: 700 13px/18px system-ui,sans-serif !important;
                font-variant-numeric: tabular-nums !important;
                color: var(--tm-bookmarks-score-fg, #ffffff) !important;
                background: var(--tm-bookmarks-score-bg, rgba(63,63,48,.82)) !important;
            }
            .tm-bookmarks-glyph {
                height: 32px !important; line-height: 32px !important;
                font: 600 26px/32px system-ui,sans-serif !important;
                color: #b9f4c9 !important;
                background: rgba(37,68,50,.80) !important;
            }
            .${BUTTON_CLASS}[aria-pressed="true"] .tm-bookmarks-glyph {
                background: rgba(20,166,79,.84) !important;
                color: #ffffff !important;
            }
            .${BUTTON_CLASS}:hover, .${BUTTON_CLASS}:focus-visible {
                opacity: 1 !important; outline: 2px solid #3777b7 !important;
            }
            .${BUTTON_CLASS}:disabled { opacity: .80 !important; cursor: default !important; }
            .${BUTTON_CLASS}[aria-pressed="true"] {
                border-color: rgba(48,206,106,.92) !important;
                opacity: 1 !important;
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
        updateScreenHeightVariable();
        ensureErrorStacks();
        positionObserver = typeof ResizeObserver === 'function'
            ? new ResizeObserver(schedulePositions) : null;
        collapseObserver = new MutationObserver(schedulePositions);
        summaryObserver=typeof IntersectionObserver==='function'
            ?new IntersectionObserver(entries=>{
                for(const entry of entries){
                    if(!entry.isIntersecting||entry.intersectionRatio<.35)continue;
                    const summary=entry.target,article=summary.closest('article.post-item');
                    if(!article||article.classList.contains('auto-open-new-articles-collapsed'))continue;
                    const control=[...controls.values()].find(v=>v.link.closest('article.post-item')===article);
                    if(!control||viewedUrls.has(control.url))continue;
                    setTimeout(()=>{
                        if(!summary.isConnected||article.classList.contains('auto-open-new-articles-collapsed'))return;
                        const rect=summary.getBoundingClientRect(),h=window.visualViewport?.height||innerHeight;
                        if(rect.height>0&&rect.bottom>h*.15&&rect.top<h*.85)recordViewed(control);
                    },1600);
                }
            },{threshold:[.35]}):null;
        window.addEventListener('resize', () => {
            updateScreenHeightVariable();
            schedulePositions();
        }, { passive: true });
        window.addEventListener('orientationchange', updateScreenHeightVariable, { passive: true });
        window.addEventListener('scroll', schedulePositions, { passive: true, capture: true });
        window.visualViewport?.addEventListener('resize', schedulePositions, { passive: true });
        window.visualViewport?.addEventListener('scroll', schedulePositions, { passive: true });
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

// BEGIN BETACAT_READING
(function () {
    'use strict';
    if (new URL(location.href).hostname !== 'hackernews.betacat.io') return;
    const STORAGE_PREFIX = 'autoOpenNewArticles:lastSeen';
    const STAR_CLASS = 'auto-open-new-articles-star';
    const SEEN_CLASS = 'auto-open-new-articles-seen';
    const COLLAPSED_CLASS = 'auto-open-new-articles-collapsed';
    const MANAGED_CLASS = 'auto-open-new-articles-managed';
    const ITEM_TOGGLE_CLASS = 'auto-open-new-articles-item-toggle';
    const ALL_TOGGLE_ID = 'auto-open-new-articles-all-toggle';
    const DATE_NAV_CLASS = 'auto-open-new-articles-date-nav';
    const UPDATE_TIME_CLASS = 'auto-open-new-articles-update-time';
    const POPULARITY_CLASS = 'auto-open-new-articles-popularity';
    const POPULARITY_HOT_CLASS = 'auto-open-new-articles-popularity-hot';
    const LATEST_LOAD_HISTORY_KEY = 'autoOpenNewArticles:hackerNewsSummary:verifiedLatestLoads';
    const NAV_OWNER_ATTR = 'data-blog-bookmarks-date-nav-owner';
    const SNAPSHOT_KEY = LATEST_LOAD_HISTORY_KEY + ':' + new URL(location.href).pathname;
    let documentLoadHistory;
    const PAGE_LOADED_AT = Date.now();
    const STYLE_ID = 'auto-open-new-articles-style';

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .${STAR_CLASS} {
                color: #f5c842;
                font-weight: 700;
                margin-right: 0.35em;
                text-shadow: 0 0 1px rgba(0, 0, 0, 0.25);
            }
            .${SEEN_CLASS} {
                opacity: 0.68 !important;
            }
            article.post-item .post-meta .${POPULARITY_CLASS} {
                display: inline !important;
                padding: 1px 3px !important;
                border-radius: 4px !important;
                background-color: #e8eaed !important;
                color: #202124 !important;
                font-weight: 800 !important;
                font-variant-numeric: tabular-nums !important;
                text-shadow: none !important;
                opacity: 1 !important;
                box-decoration-break: clone !important;
                -webkit-box-decoration-break: clone !important;
            }
            article.post-item .post-meta .${POPULARITY_CLASS}.${POPULARITY_HOT_CLASS} {
                background-color: var(--tm-popularity-color, #fff1ce) !important;
                color: #382b0b !important;
            }
            article.post-item .post-meta .score > i,
            article.post-item .post-meta .comment a > i {
                opacity: 1 !important;
                filter: contrast(1.1) !important;
            }
            article.post-item .post-meta .comment a > i {
                color: #5687aa !important;
            }
            .${COLLAPSED_CLASS} > :not(.post-title):not(.${ITEM_TOGGLE_CLASS}):not(.tm-blog-bookmarks-save) {
                display: none !important;
            }
            .${MANAGED_CLASS} {
                position: relative !important;
                padding-left: 30px !important;
            }
            .${ITEM_TOGGLE_CLASS} {
                position: absolute !important;
                left: 0 !important;
                top: 20px !important;
                width: 24px !important;
                height: 24px !important;
                margin: 0 !important;
                padding: 0 !important;
                border: 1px solid #888 !important;
                border-radius: 4px !important;
                background: #333 !important;
                color: #fff !important;
                line-height: 22px !important;
                text-align: center !important;
                cursor: pointer !important;
            }
            article.post-item.${MANAGED_CLASS} { padding-left: 0 !important; }
            article.post-item.${MANAGED_CLASS} > .post-title {
                position: relative !important;
                padding-left: 34px !important;
                box-sizing: border-box !important;
            }
            article.post-item > .post-title > .${ITEM_TOGGLE_CLASS} {
                position: absolute !important;
                left: 0 !important;
                top: 50% !important;
                transform: translateY(-50%) !important;
                width: 28px !important;
                height: 28px !important;
                line-height: 26px !important;
                z-index: 1 !important;
            }
            .day-nav > a.newer, .day-nav > a.older {
                display: none !important;
            }
            .${DATE_NAV_CLASS} {
                display: grid !important;
                grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) !important;
                align-items: center !important;
                gap: 4px !important;
                margin: 12px 0 !important;
                font-weight: 700 !important;
            }
            .${DATE_NAV_CLASS} a,
            .${DATE_NAV_CLASS} span {
                display: inline-flex !important;
                align-items: center !important;
                min-height: 44px !important;
                padding: 0 8px !important;
                font-size: 18px !important;
                white-space: nowrap !important;
            }
            .${DATE_NAV_CLASS} > :first-child { justify-self: start !important; }
            .${DATE_NAV_CLASS} > :nth-child(3) { justify-self: end !important; }
            .${DATE_NAV_CLASS} > .${UPDATE_TIME_CLASS} {
                grid-row: 2 !important;
                min-width: 0 !important;
                min-height: 0 !important;
                padding: 0 2px !important;
                margin: 0 !important;
                font-size: 11px !important;
                font-weight: 400 !important;
                font-variant-numeric: tabular-nums !important;
                line-height: 1.2 !important;
                white-space: nowrap !important;
                opacity: 0.75 !important;
                pointer-events: none !important;
            }
            .${DATE_NAV_CLASS} > .${UPDATE_TIME_CLASS}.previous {
                grid-column: 1 !important;
                justify-self: start !important;
            }
            .${DATE_NAV_CLASS} > .${UPDATE_TIME_CLASS}.current {
                grid-column: 2 !important;
                justify-self: center !important;
            }
            .${DATE_NAV_CLASS} .disabled {
                opacity: 0.35 !important;
                cursor: default !important;
            }
        `;
        document.head.appendChild(style);
    }

    function saveSeenIds(storageKey, articles, seenIds) {
        const updatedIds = Array.from(new Set([
            ...articles.map((article) => article.id),
            ...seenIds
        ])).slice(0, 2000);
        GM_setValue(storageKey, updatedIds);
        return new Set(updatedIds);
    }

    function applyCollapseControlStyle(button) {
        const styles = {
            appearance: 'none', position: 'fixed', top: 'auto', right: 'auto', bottom: '16px',
            left: '16px', display: 'inline-flex', 'align-items': 'center', 'justify-content': 'center',
            'box-sizing': 'border-box', width: '44px', 'min-width': '44px', 'max-width': '44px', height: '34px',
            'min-height': '34px', 'max-height': '34px', margin: '0', opacity: '0.5', padding: '0', border: '0',
            'border-radius': '6px', 'font-family': 'system-ui, sans-serif', 'font-size': '15px', 'line-height': '1',
            'text-align': 'center', 'text-transform': 'none', 'white-space': 'nowrap', cursor: 'move',
            'user-select': 'none', 'touch-action': 'none', 'box-shadow': '0 2px 6px rgba(0, 0, 0, 0.25)',
            'z-index': '2147483647'
        };
        Object.entries(styles).forEach(([property, value]) => button.style.setProperty(property, value, 'important'));
    }

    function makeFloatingControlDraggable(button) {
        let dragging = false;
        let moved = false;
        let startX;
        let startY;
        let offsetX;
        let offsetY;
        const point = (event) => event.touches ? event.touches[0] : event;

        const start = (event) => {
            const current = point(event);
            dragging = true;
            moved = false;
            startX = current.clientX;
            startY = current.clientY;
            offsetX = startX - button.offsetLeft;
            offsetY = startY - button.offsetTop;
        };
        const drag = (event) => {
            if (!dragging) return;
            const current = point(event);
            if (!moved && Math.abs(current.clientX - startX) < 3 && Math.abs(current.clientY - startY) < 3) return;
            moved = true;
            event.preventDefault();
            const maxX = Math.max(document.documentElement.clientWidth, window.innerWidth) - button.offsetWidth;
            const maxY = Math.max(document.documentElement.clientHeight, window.innerHeight) - button.offsetHeight;
            button.style.setProperty('left', `${Math.min(Math.max(current.clientX - offsetX, 0), maxX)}px`, 'important');
            button.style.setProperty('top', `${Math.min(Math.max(current.clientY - offsetY, 0), maxY)}px`, 'important');
            button.style.setProperty('right', 'auto', 'important');
            button.style.setProperty('bottom', 'auto', 'important');
        };
        const end = () => { dragging = false; };
        button.addEventListener('mousedown', start);
        button.addEventListener('touchstart', start);
        document.addEventListener('mousemove', drag);
        document.addEventListener('touchmove', drag);
        document.addEventListener('mouseup', end);
        document.addEventListener('touchend', end);
        return () => {
            const wasMoved = moved;
            moved = false;
            return wasMoved;
        };
    }

    function setArticleCollapsed(article, collapsed) {
        const button = article.querySelector(`.${ITEM_TOGGLE_CLASS}`);
        article.classList.toggle(COLLAPSED_CLASS, collapsed);
        article.classList.toggle(SEEN_CLASS, collapsed);
        if (button) {
            button.textContent = collapsed ? '▶' : '▼';
            button.title = collapsed ? 'Expand this item' : 'Collapse this item';
            button.setAttribute('aria-label', button.title);
            button.setAttribute('aria-expanded', String(!collapsed));
        }
    }

    function addArticleToggle(article, initiallyCollapsed) {
        article.classList.add(MANAGED_CLASS);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = ITEM_TOGGLE_CLASS;
        button.addEventListener('click', () => {
            setArticleCollapsed(article, !article.classList.contains(COLLAPSED_CLASS));
        });
        if (article.matches('article.post-item')) {
            const title = article.querySelector(':scope > .post-title');
            if (title) title.insertBefore(button, title.firstChild);
            else article.insertBefore(button, article.firstChild);
        } else {
            article.insertBefore(button, article.firstChild);
        }
        setArticleCollapsed(article, initiallyCollapsed);
    }

    function getAvailableDates() {
        return Array.from(document.querySelectorAll('#daily-links-menu a[href*="/daily/"]'))
            .map((link) => {
                try {
                    return new URL(link.href, window.location.href).pathname.match(/^\/daily\/(\d{4}-\d{2}-\d{2})\/?$/)?.[1];
                } catch (error) {
                    return null;
                }
            })
            .filter(Boolean)
            .filter((date, index, dates) => dates.indexOf(date) === index)
            .sort();
    }

    function formatShortDate(dateText) {
        return dateText.slice(5);
    }

    function createDateControl(dateText, direction) {
        if (!dateText) {
            const disabled = document.createElement('span');
            disabled.className = 'disabled';
            disabled.textContent = direction === 'previous' ? '‹' : '›';
            disabled.setAttribute('aria-disabled', 'true');
            return disabled;
        }

        const control = document.createElement('a');
        control.href = `/daily/${dateText}`;
        control.textContent = direction === 'previous'
            ? `‹ ${formatShortDate(dateText)}`
            : `${formatShortDate(dateText)} ›`;
        control.title = direction === 'previous' ? 'Previous available day' : 'Next available day';
        return control;
    }

    function createLatestControl() {
        const control = document.createElement('a');
        control.href = '/';
        control.textContent = 'Latest ›';
        control.title = 'Open latest articles';
        return control;
    }

    function latestSignature(articles) {
        return JSON.stringify(articles.map(({ id, link }) => [
            id,
            link.querySelector('.last-updated[data-submitted]')?.getAttribute('data-submitted') || '',
            link.querySelector('.post-meta .score span')?.textContent?.trim() || '',
            link.querySelector('.post-meta .comment a span')?.textContent?.trim() || ''
        ]).sort((a, b) => a[0].localeCompare(b[0])));
    }

    function getLatestSnapshots() {
        try {
            const stored = JSON.parse(sessionStorage.getItem(SNAPSHOT_KEY) || '[]');
            if (Array.isArray(stored)) return stored;
        } catch (_) {}
        return [];
    }

    function recordVerifiedLatestLoad(signature, receivedAt, snapshots) {
        const current = new Date(receivedAt).toISOString();
        const saved = GM_getValue(LATEST_LOAD_HISTORY_KEY, null);
        const lastLoad = saved && typeof saved.current === 'string' && Number.isFinite(Date.parse(saved.current))
            ? new Date(saved.current).toISOString()
            : null;
        documentLoadHistory = current === lastLoad
            ? { current, previous: saved.previous || null }
            : { current, previous: lastLoad };
        if (current !== lastLoad) GM_setValue(LATEST_LOAD_HISTORY_KEY, documentLoadHistory);
        try {
            sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify([
                { signature, history: documentLoadHistory },
                ...snapshots.filter(item => item.signature !== signature)
            ].slice(0, 12)));
        } catch (_) {}
        return documentLoadHistory;
    }

    function latestNavigationTiming() {
        const perf = window.performance;
        return { nav: perf?.getEntriesByType?.('navigation')?.[0], origin: perf?.timeOrigin };
    }

    function recordLatestBrowserLoad(articles) {
        if (documentLoadHistory) return documentLoadHistory;
        const { nav, origin } = latestNavigationTiming();
        const signature = latestSignature(articles);
        const snapshots = getLatestSnapshots();
        const networkConfirmed = nav && nav.transferSize > 0 && !nav.workerStart
            && (!nav.responseStatus || (nav.responseStatus >= 200 && nav.responseStatus < 400))
            && Number.isFinite(origin) && Number.isFinite(nav.responseEnd) && nav.responseEnd > 0;
        if (networkConfirmed)
            return recordVerifiedLatestLoad(signature, origin + nav.responseEnd, snapshots);
        documentLoadHistory = snapshots.find(item => item.signature === signature)?.history
            || { current: null, previous: null };
        return documentLoadHistory;
    }

    // Edge may omit navigation transfer metrics even for a manual reload.
    // Reuse the existing cache-bypassing title fetch, but only certify the
    // visible listing if its IDs, submission times and counts match that response.
    // Never re-date a known cached snapshot just because its tab is restored.
    function verifyAmbiguousLatestLoad(articles, onVerified) {
        const { nav, origin } = latestNavigationTiming();
        if (nav?.transferSize > 0 && !nav.workerStart
            && (!nav.responseStatus || (nav.responseStatus >= 200 && nav.responseStatus < 400))
            && Number.isFinite(origin) && Number.isFinite(nav.responseEnd) && nav.responseEnd > 0) return;
        if (document.wasDiscarded || nav?.type === 'back_forward') return;
        if (nav?.type !== 'reload' && (documentLoadHistory?.current || getLatestSnapshots().length)) return;
        if (typeof blogBookmarksBetaCatPageTask === 'undefined' || !blogBookmarksBetaCatPageTask) return;
        const signature = latestSignature(articles);
        blogBookmarksBetaCatPageTask.then(result => {
            if (!result || !Number.isFinite(result.receivedAt)) return;
            const remoteArticles = collectHackerNewsArticles(result.doc);
            if (!remoteArticles.length || latestSignature(remoteArticles) !== signature
                || latestSignature(articles) !== signature) return;
            const history = recordVerifiedLatestLoad(signature, result.receivedAt, getLatestSnapshots());
            onVerified(history);
        }).catch(() => {});
    }

    function formatUpdateTime(timestamp) {
        if (!timestamp) {
            return '—';
        }
        const date = new Date(timestamp);
        const today = new Date();
        const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        const isToday = date.getFullYear() === today.getFullYear()
            && date.getMonth() === today.getMonth()
            && date.getDate() === today.getDate();
        return isToday ? time : `${date.getMonth() + 1}/${date.getDate()} ${time}`;
    }

    function addUpdateTime(navigation, kind, timestamp) {
        const label = document.createElement('time');
        label.className = `${UPDATE_TIME_CLASS} ${kind}`;
        label.textContent = formatUpdateTime(timestamp);
        label.title = kind === 'previous' ? 'Previous verified server retrieval of Latest' : 'Verified server retrieval of this Latest page';
        if (timestamp) {
            label.setAttribute('datetime', timestamp);
        }
        navigation.appendChild(label);
    }

    function createDateNavigation(displayedDate, availableDates, updateHistory) {
        // The home page is a live Latest view, not the newest dated archive.
        const isLatest = displayedDate === null;
        const currentIndex = isLatest ? availableDates.length : availableDates.indexOf(displayedDate);
        if (availableDates.length === 0 || currentIndex === -1) {
            return null;
        }

        const navigation = document.createElement('nav');
        navigation.className = DATE_NAV_CLASS;
        navigation.setAttribute('aria-label', 'Hacker News Summary date navigation');

        const previous = createDateControl(availableDates[currentIndex - 1], 'previous');
        const current = document.createElement('a');
        current.href = isLatest ? '/' : `/daily/${displayedDate}`;
        current.textContent = isLatest ? 'Latest' : formatShortDate(displayedDate);
        current.title = isLatest ? 'Open latest articles' : 'Open this daily archive';
        const next = isLatest
            ? createDateControl(null, 'next')
            : currentIndex === availableDates.length - 1
                ? createLatestControl()
                : createDateControl(availableDates[currentIndex + 1], 'next');
        navigation.append(previous, current, next);
        if (isLatest && updateHistory) {
            addUpdateTime(navigation, 'previous', updateHistory.previous);
            addUpdateTime(navigation, 'current', updateHistory.current);
        }
        return navigation;
    }

    function addDateNavigation(articles, displayedDate) {
        const availableDates = getAvailableDates();
        const first = articles[0].link;
        const last = articles[articles.length - 1].link;
        const updateHistory = displayedDate === null ? recordLatestBrowserLoad(articles) : null;
        const topNavigation = createDateNavigation(displayedDate, availableDates, updateHistory);
        const bottomNavigation = createDateNavigation(displayedDate, availableDates, updateHistory);
        if (!topNavigation || !bottomNavigation || !first.parentNode || !last.parentNode) {
            return;
        }
        // Remove old standalone-script navigation or copies from a restored DOM.
        document.querySelectorAll(`.${DATE_NAV_CLASS}`).forEach(nav => nav.remove());
        topNavigation.setAttribute('data-betacat-nav-position', 'top');
        bottomNavigation.setAttribute('data-betacat-nav-position', 'bottom');
        first.parentNode.insertBefore(topNavigation, first);
        last.insertAdjacentElement('afterend', bottomNavigation);
        if (displayedDate === null) verifyAmbiguousLatestLoad(articles, history => {
            for (const nav of [topNavigation, bottomNavigation]) {
                nav.querySelectorAll(`.${UPDATE_TIME_CLASS}`).forEach(label => label.remove());
                addUpdateTime(nav, 'previous', history.previous);
                addUpdateTime(nav, 'current', history.current);
            }
        });

        // Translation/legacy scripts may clone or move the controls. Keep precisely one
        // at each end, without recomputing the acquisition time.
        function reconcileNavigation() {
            if (!first.isConnected || !last.isConnected) return;
            document.querySelectorAll(`.${DATE_NAV_CLASS}`).forEach(nav => {
                if (nav !== topNavigation && nav !== bottomNavigation) nav.remove();
            });
            const before = Array.from(first.parentNode.children);
            if (before[before.indexOf(first) - 1] !== topNavigation) {
                topNavigation.remove();
                first.parentNode.insertBefore(topNavigation, first);
            }
            const after = Array.from(last.parentNode.children);
            if (after[after.indexOf(last) + 1] !== bottomNavigation) {
                bottomNavigation.remove();
                last.insertAdjacentElement('afterend', bottomNavigation);
            }
        }
        if (typeof MutationObserver !== 'undefined') {
            const touchesNavigation = node => node?.matches?.(`.${DATE_NAV_CLASS}`)
                || node?.querySelector?.(`.${DATE_NAV_CLASS}`);
            const observer = new MutationObserver(records => {
                if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(touchesNavigation)))
                    reconcileNavigation();
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    function readPopularityNumber(metric, selector) {
        const value = metric?.querySelector(selector)?.textContent?.trim() || '';
        return /^\d[\d,]*$/.test(value) ? Number(value.replace(/,/g, '')) : null;
    }

    function popularityRate(count, ageHours, kind) {
        // Two-hour smoothing avoids overrating a handful of very early votes.
        // HN's first score point belongs to the submitter, not other readers.
        return (kind === 'score' ? Math.max(0, count - 1) : count) / (ageHours + 2);
    }

    function markPopularity(metric, count, ageHours, kind, isLatest, pageMaxRate) {
        if (!metric || count === null || !Number.isFinite(count)) return;
        // The number alone receives a background: never the adjacent icon,
        // article link arrow or punctuation separators.
        const number = metric.querySelector(kind === 'score' ? 'span' : 'a span');
        if (!number) return;
        number.classList.add(POPULARITY_CLASS);

        const label = kind === 'score' ? '推薦分數' : '留言';
        if (!isLatest || ageHours === null) {
            metric.title = `${label} ${count}；未提供可比較的即時發文時間，不計算熱度`;
            return;
        }

        const rate = popularityRate(count, ageHours, kind);
        const relativeHeat = pageMaxRate > 0 ? Math.min(1, Math.max(0, rate / pageMaxRate)) : 0;
        metric.title = `${label} ${count}；發文約 ${ageHours.toFixed(1)} 小時；平滑平均 ${rate.toFixed(1)}/小時（含 2 小時平滑）；本頁相對熱度 ${(relativeHeat * 100).toFixed(1)}%（非即時增量）`;
        if (relativeHeat <= 0) return;

        // Linear normalization to the hottest visible listing; no logarithm,
        // fixed rate threshold, discrete bands or saturation plateau.
        // A page of similarly popular articles gives all of them bright yellow.
        const saturation = 88 + 12 * relativeHeat;
        const lightness = 96 - 42 * relativeHeat;
        number.classList.add(POPULARITY_HOT_CLASS);
        number.style.setProperty('--tm-popularity-color',
            `hsl(50 ${saturation.toFixed(3)}% ${lightness.toFixed(3)}%)`);
    }

    function addHackerNewsPopularity(articles, displayedDate) {
        const isLatest = displayedDate === null;
        const rows = [];
        const maxRates = { score: 0, comments: 0 };

        articles.forEach(({ link }) => {
            if (link.classList.contains('ad')) return;
            const timestamp = link.querySelector('.last-updated[data-submitted]')?.getAttribute('data-submitted');
            const submittedAt = timestamp ? Date.parse(timestamp) : NaN;
            const ageHours = Number.isFinite(submittedAt) && submittedAt <= PAGE_LOADED_AT
                ? Math.max(0, (PAGE_LOADED_AT - submittedAt) / 3600000)
                : null;
            const score = link.querySelector('.post-meta .score');
            const comments = link.querySelector('.post-meta .comment');
            const scoreCount = readPopularityNumber(score, 'span');
            const commentCount = readPopularityNumber(comments, 'a span');
            if (isLatest && ageHours !== null) {
                if (scoreCount !== null)
                    maxRates.score = Math.max(maxRates.score, popularityRate(scoreCount, ageHours, 'score'));
                if (commentCount !== null)
                    maxRates.comments = Math.max(maxRates.comments, popularityRate(commentCount, ageHours, 'comments'));
            }
            rows.push({ score, comments, scoreCount, commentCount, ageHours });
        });

        rows.forEach(({ score, comments, scoreCount, commentCount, ageHours }) => {
            markPopularity(score, scoreCount, ageHours, 'score', isLatest, maxRates.score);
            markPopularity(comments, commentCount, ageHours, 'comments', isLatest, maxRates.comments);
        });
    }

    function setupHackerNewsControls(articles, storageKey, storedIds, displayedDate) {
        addHackerNewsPopularity(articles, displayedDate);
        let seenIds = new Set(storedIds);
        articles.forEach((article) => addArticleToggle(article.link, seenIds.has(article.id)));

        const allToggle = document.createElement('button');
        allToggle.id = ALL_TOGGLE_ID;
        allToggle.type = 'button';
        applyCollapseControlStyle(allToggle);
        const wasDragged = makeFloatingControlDraggable(allToggle);
        const updateAllToggle = () => {
            const hasCollapsed = articles.some((article) => article.link.classList.contains(COLLAPSED_CLASS));
            allToggle.textContent = hasCollapsed ? '+' : '−';
            allToggle.title = hasCollapsed ? 'Expand all items' : 'Collapse all items';
            allToggle.setAttribute('aria-label', allToggle.title);
            allToggle.setAttribute('aria-pressed', String(!hasCollapsed));
            allToggle.style.setProperty('background-color', hasCollapsed ? 'rgba(0, 0, 0, 0.55)' : 'rgba(34, 139, 34, 0.85)', 'important');
            allToggle.style.setProperty('color', hasCollapsed ? '#f0f0f0' : '#ffffff', 'important');
        };
        allToggle.addEventListener('click', () => {
            if (wasDragged()) return;
            const shouldCollapse = !articles.some((article) => article.link.classList.contains(COLLAPSED_CLASS));
            articles.forEach((article) => setArticleCollapsed(article.link, shouldCollapse));
            updateAllToggle();
        });
        document.body.appendChild(allToggle);
        updateAllToggle();

        const scrollUp = document.querySelector('#scrollUp');
        if (scrollUp) {
            scrollUp.addEventListener('click', (event) => {
                event.preventDefault();
                if (event.stopImmediatePropagation) {
                    event.stopImmediatePropagation();
                }
                seenIds = saveSeenIds(storageKey, articles, seenIds);
                articles.forEach((article) => {
                    article.link.classList.add(SEEN_CLASS);
                    article.link.classList.remove(COLLAPSED_CLASS);
                    const button = article.link.querySelector(`.${ITEM_TOGGLE_CLASS}`);
                    if (button) {
                        button.textContent = '▼';
                        button.title = 'Collapse this item';
                        button.setAttribute('aria-label', button.title);
                        button.setAttribute('aria-expanded', 'true');
                    }
                });
                updateAllToggle();
                window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
            }, true);
        }

        addDateNavigation(articles, displayedDate);
    }


    // BetaCats renders fixed native day arrows in its .day-nav template.
    // Keep the site's #scrollUp control, and preserve our inline text date navigation.
    function collectHackerNewsArticles(root) {
        const links = Array.from(root.querySelectorAll('article.post-item'))
            .filter(article => !article.classList.contains('ad'));
        return links.map(link => {
            const comment = link.querySelector('a[rel="comment"]');
            let id = '';
            try { id = new URL(comment?.href || '', window.location.href).searchParams.get('id') || ''; } catch (_) {}
            const titleLink = link.querySelector('.post-title a[href]');
            return { link, id: id ? 'hackernews:' + id : titleLink ? 'hackernews:url:' + titleLink.href : '' };
        }).filter(article => article.id);
    }

    function handleArticles() {
        const url = new URL(window.location.href);
        const dated = url.pathname.match(/^\/daily\/(\d{4}-\d{2}-\d{2})\/?$/);
        if (!dated && !['/', '/zh', '/zh/'].includes(url.pathname)) return;
        if (document.documentElement.hasAttribute(NAV_OWNER_ATTR)) return;
        const articles = collectHackerNewsArticles(document);
        if (!articles.length) return;
        document.documentElement.setAttribute(NAV_OWNER_ATTR, 'true');
        // Older installed Auto Open New Articles may already own the collapse controls.
        // Take over only the date navigation rather than creating duplicate buttons.
        if (document.getElementById(ALL_TOGGLE_ID)) {
            addDateNavigation(articles, dated?.[1] || null);
            return;
        }
        ensureStyles();
        const storageKey = STORAGE_PREFIX + ':hackernews-summary:listings';
        const stored = GM_getValue(storageKey, []);
        setupHackerNewsControls(articles, storageKey, Array.isArray(stored) ? stored : [], dated?.[1] || null);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            handleArticles();
            
        });
    } else {
        handleArticles();
        
    }

})();
// END BETACAT_READING

// BEGIN BETACAT_MOBILE_LAYOUT
(function () {
    'use strict';
    if (new URL(location.href).hostname !== 'hackernews.betacat.io') return;

    const STYLE_ID = 'tm-better-mobile-view-style';
    const STYLE_CONTENT = `
@media (max-width: 768px) and (orientation: portrait) {
    .post-summary {
        display: block !important;
    }

    .post-summary .feature-image {
        display: block !important;
        float: none !important;
        margin: 0 0 12px 0 !important;
        width: 100% !important;
    }

    .post-summary .feature-image img {
        display: block !important;
        height: auto !important;
        max-width: 100% !important;
        width: 100% !important;
    }

    .post-summary .summary-text {
        clear: both !important;
        float: none !important;
        margin-left: 0 !important;
        width: 100% !important;
    }
}
`;

    function insertStyle() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = STYLE_CONTENT;

        const target = document.head || document.documentElement;
        target.appendChild(style);
    }

    insertStyle();
})();
// END BETACAT_MOBILE_LAYOUT

// BEGIN BETACAT_EXTERNAL_LINKS
(function () {
    'use strict';
    if (new URL(location.href).hostname !== 'hackernews.betacat.io') return;

    const STYLE_ID = 'tampermonkey-articles-new-tab-style';
    const ICON_CLASS_NAME = 'articles-new-tab-icon';
    const PROCESSED_FLAG = 'articlesNewTabProcessed';
    const LISTENER_FLAG = 'articlesNewTabListenerAttached';
    const ICON_TEXT = '↗︎';

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .${ICON_CLASS_NAME} {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                margin-left: 0.35em;
                font-size: 0.8em;
                line-height: 1;
                text-decoration: none;
                color: inherit;
            }
        `;
        document.head.appendChild(style);
    }

    function createIconElement() {
        const span = document.createElement('span');
        span.className = ICON_CLASS_NAME;
        span.setAttribute('aria-hidden', 'true');
        span.textContent = ICON_TEXT;
        return span;
    }

    function markAsProcessed(link) {
        link.dataset[PROCESSED_FLAG] = 'true';
    }

    function hasBeenProcessed(link) {
        return link.dataset[PROCESSED_FLAG] === 'true';
    }

    function isLinkEligible(link) {
        if (!link?.href) return false;
        try {
            const url = new URL(link.href, window.location.href);
            if (url.hostname === 'hackernews.betacat.io') return false;
            if (url.hostname === 'news.ycombinator.com') return /^\/(item|user)/.test(url.pathname);
            return true;
        } catch (_) { return false; }
    }

    function ensureTargetAttributes(link) {
        link.target = '_blank';

        if (link.relList && typeof link.relList.add === 'function') {
            link.relList.add('noopener', 'noreferrer');
        } else {
            link.rel = 'noopener noreferrer';
        }
    }

    function openInBackgroundTab(url) {
        if (typeof GM_openInTab === 'function') {
            GM_openInTab(url, { active: false, insert: true });
            return;
        }

        window.open(url, '_blank', 'noopener');
    }

    function attachClickListener(link) {
        if (link.dataset[LISTENER_FLAG] === 'true') {
            return;
        }

        link.addEventListener('click', (event) => {
            if (event.defaultPrevented) {
                return;
            }

            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                return;
            }

            event.preventDefault();
            openInBackgroundTab(link.href);
        });

        link.dataset[LISTENER_FLAG] = 'true';
    }

    function appendIcon(link) {
        if (!link.parentElement) {
            return;
        }

        const icon = createIconElement();
        link.insertAdjacentElement('afterend', icon);
    }

    function processLink(link) {
        if (hasBeenProcessed(link) || !isLinkEligible(link)) {
            return;
        }

        ensureTargetAttributes(link);
        attachClickListener(link);
        appendIcon(link);
        markAsProcessed(link);
    }

    function processAllLinks(root) {
        const isSupportedRoot =
            root === document ||
            root instanceof Element ||
            root instanceof DocumentFragment;

        if (!isSupportedRoot) {
            return;
        }

        const links = root.querySelectorAll ? root.querySelectorAll('a[href]') : [];
        links.forEach(processLink);
    }

    function observeMutations() {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                mutation.addedNodes.forEach((node) => {
                    if (node instanceof Element) {
                        if (node.matches('a[href]')) {
                            processLink(node);
                        }

                        processAllLinks(node);
                        return;
                    }

                    if (node instanceof DocumentFragment) {
                        processAllLinks(node);
                    }
                });
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function init() {
        ensureStyles();
        processAllLinks(document);
        observeMutations();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
// END BETACAT_EXTERNAL_LINKS


// BEGIN READING_INSIGHTS
(function readingInsights(){
 'use strict';
 if(window.top && window!==window.top)return;
 if(typeof GM_getValue!=='function'||typeof GM_xmlhttpRequest!=='function')return;
 const secret=GM_getValue('blog-bookmarks-ingest-token','');
 if(!secret)return;
 const endpoint='https://christorng.idv.tw/bookmarks/api/ingest/reading';
 const jobsKey='blog-bookmarks:reading-jobs:v1',positionKey='blog-bookmarks:reading-position:v1';
 const ttl=2*60*60*1000;
 const norm=value=>{try{const u=new URL(value);if(!/^https?:$/.test(u.protocol)||u.username||u.password)return '';u.hash='';return u.href;}catch{return '';}};
 const identity=value=>{try{
  const u=new URL(norm(value));u.hostname=u.hostname.replace(/^www\./,'');u.pathname=u.pathname.replace(/\/+$/,'')||'/';
  for(const k of [...u.searchParams.keys()])if(/^utm_/i.test(k)||/^(fbclid|gclid|msclkid)$/i.test(k))u.searchParams.delete(k);
  u.searchParams.sort();return u.hostname+u.pathname+u.search;
 }catch{return '';}};
 const archive=host=>/^archive\.(?:is|today|ph|vn|md)$/.test(host);
 const jobs=()=>{const x=GM_getValue(jobsKey,{});return Object.fromEntries(Object.entries(x&&typeof x==='object'?x:{}).filter(([,v])=>v?.source&&Date.now()-v.at<ttl&&Date.now()>=v.at));};
 function request(mode,url,content){
  return new Promise((resolve,reject)=>{
   GM_xmlhttpRequest({method:'POST',url:endpoint,anonymous:true,redirect:'error',timeout:115000,
    headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},
    data:JSON.stringify({mode,url,...(content?{content,complete:true}:{})}),
    onload:r=>{try{
     if(r.finalUrl&&new URL(r.finalUrl).origin!==new URL(endpoint).origin)throw Error('非預期的 API 重導向');
     const data=JSON.parse(r.responseText);if(r.status<200||r.status>=300)throw Error(data.error||'HTTP '+r.status);resolve(data);
    }catch(e){reject(e);}},
    onerror:()=>reject(Error('無法連線至摘要服務')),ontimeout:()=>reject(Error('摘要服務逾時'))});
  });
 }
 function queue(source,target){
  source=norm(source);target=norm(target)||source;if(!source)return;
  const x=jobs();x[source]={source,target,at:Date.now()};
  GM_setValue(jobsKey,Object.fromEntries(Object.entries(x).sort((a,b)=>b[1].at-a[1].at).slice(0,80)));
  void request('prepare',source).catch(()=>{});
 }
 if(location.hostname==='hackernews.betacat.io'){
  document.addEventListener('click',event=>{
   const link=event.target?.closest?.('article.post-item .post-title a.post-url');
   if(!link?.href)return;
   let original=link.href;
   try {
    const u=new URL(link.href);
    if(u.hostname==='web.archive.org'){const m=u.pathname.match(/https?:\/\/.+/);if(m)original=m[0]+u.search;}
    if(archive(u.hostname)&&u.searchParams.get('url'))original=u.searchParams.get('url');
    if(/^nitter\./.test(u.hostname)&&/\/status\/\d+/.test(u.pathname))original='https://x.com'+u.pathname;
   }catch{}
   queue(original,link.href);
  },true);
  return;
 }
 if(location.hostname==='christorng.idv.tw'&&/^\/bookmarks\/admin(?:\/|$)/.test(location.pathname)){
  window.addEventListener('blog-bookmarks:reading-open',event=>{
   const d=event.detail||{};queue(d.source,d.target);
  });
  return;
 }
 if(location.hostname==='christorng.idv.tw'&&location.pathname!=='/TampermonkeyScripts/IframeViewer.html')return;
 const currentUrl=()=>location.hostname==='christorng.idv.tw'&&location.pathname==='/TampermonkeyScripts/IframeViewer.html'
  ?norm(new URL(location.href).searchParams.get('url')):norm(location.href);
 function candidateIds(){
  const ids=new Set([identity(currentUrl())]);
  try{
   const here=new URL(currentUrl());
   if(archive(here.hostname)){
    for(const key of ['url','q']){const v=here.searchParams.get(key);if(v)ids.add(identity(v));}
    for(const el of document.querySelectorAll('#HEADER a[href],#HEADER input[value],#header a[href],input[name="url"],link[rel="canonical"]')){
     const v=el.href||el.value;if(v)ids.add(identity(v));
    }
   }
   if(here.hostname==='web.archive.org'){
    const m=here.pathname.match(/https?:\/\/.+/);if(m)ids.add(identity(m[0]+here.search));
   }
   const canonical=document.querySelector('link[rel="canonical"]')?.href;
   if(canonical&&new URL(canonical).hostname.replace(/^www\./,'')===here.hostname.replace(/^www\./,''))ids.add(identity(canonical));
   if(/^(?:nitter\.[^/]+|nitter-[^/]+)$/.test(here.hostname)&&/\/status\/\d+/.test(here.pathname)){
    ids.add(identity('https://x.com'+here.pathname));ids.add(identity('https://twitter.com'+here.pathname));
   }
   if(here.hostname==='arxiv.org'&&/^\/html\//.test(here.pathname)){
    ids.add(identity('https://arxiv.org'+here.pathname.replace('/html/','/abs/')));
    ids.add(identity('https://arxiv.org'+here.pathname.replace('/html/','/pdf/')+'.pdf'));
   }
  }catch{}
  ids.delete('');return ids;
 }
 function trackedSource(){
  const ids=candidateIds(),matches=Object.values(jobs()).filter(j=>ids.has(identity(j.source))||ids.has(identity(j.target)));
  const unique=[...new Set(matches.map(j=>j.source))];
  if(unique.length===1)return unique[0];
  const stored=GM_getValue('blog-bookmarks:reading-known:v1',{});
  const known=Object.values(stored&&typeof stored==='object'?stored:{}).filter(j=>j?.source&&Date.now()-j.at<30*86400000&&ids.has(identity(j.source)));
  const sources=[...new Set(known.map(j=>j.source))];
  if(sources.length===1)return sources[0];
  // Explicit test/deep link and trusted referring list are allowed. No
  // automatic lookup of arbitrary unrelated browsing history.
  if(location.hash==='#blog-bookmarks-reading')return currentUrl();
  try{const ref=new URL(document.referrer);if(ref.hostname==='hackernews.betacat.io'||(ref.hostname==='christorng.idv.tw'&&/^\/bookmarks\/admin(?:\/|$)/.test(ref.pathname)))return currentUrl();}catch{}
  return '';
 }
 function extract(){
  if(!document.body||document.body.querySelector('input[type="password"]'))return '';
  if(/^(?:just a moment|attention required|verify you are human|access denied|checking your browser|security verification|安全驗證)/i.test(document.title))return '';
  const pageText=(document.body.textContent||'').slice(0,4000);
  if(pageText.length<3500&&/(?:verify (?:you are|that you are) (?:a )?human|complete (?:the )?captcha|checking if the site connection is secure|機器人驗證|請完成驗證)/i.test(pageText))return '';
  if(document.querySelector('meta[property="article:isAccessibleForFree"][content="false"]'))return '';
  const roots=[...document.querySelectorAll('[itemprop="articleBody"],[data-testid="article-body"],.article-body,.article-content,.entry-content,.post-content,.publication-content,article,main,[role="main"]')];
  const ranked=roots.map(el=>{
   const copy=el.cloneNode(true);
   copy.querySelectorAll('script,style,noscript,nav,footer,aside,header,form,button,svg,iframe,[aria-hidden="true"],[hidden],.ads,.comments,.related-posts,.sidebar,.tm-bookmarks-reading-length').forEach(x=>x.remove());
   copy.querySelectorAll('p,li,h1,h2,h3,h4,blockquote,pre,br,tr,section').forEach(x=>x.append(document.createTextNode('\n')));
   const text=(copy.textContent||'').replace(/[ \t]+/g,' ').replace(/\n\s*\n\s*\n/g,'\n\n').trim();
   const paragraphs=copy.querySelectorAll('p,li,blockquote,pre').length;
   return {text,paragraphs,semantic:el.matches('[itemprop="articleBody"],[data-testid="article-body"],.article-body,.article-content,.entry-content,.post-content,.publication-content,article')};
  }).filter(x=>x.text.length>=120&&x.text.length<=160000&&x.paragraphs>=1);
  const semantic=ranked.filter(x=>x.semantic);
  const result=(semantic.length?semantic:ranked).sort((a,b)=>b.text.length-a.text.length)[0];
  return result?.text||'';
 }
 let source='',host,root,icon,panel,body,meta,retry,expanded=false,hidden=false,touched=false,data=null,busy=false,lastError='',started=false,attempt=0,pollTimer;
 let pos=GM_getValue(positionKey,{x:8,y:8});
 if(!pos||!Number.isFinite(pos.x)||!Number.isFinite(pos.y))pos={x:8,y:8};
 function viewport(){const v=window.visualViewport;return {w:v?.width||innerWidth,h:v?.height||innerHeight,x:v?.offsetLeft||0,y:v?.offsetTop||0};}
 function place(){
  if(!host)return;
  const v=viewport(),x=Math.max(0,Math.min(v.w-40,pos.x)),y=Math.max(0,Math.min(v.h-40,pos.y));
  host.style.setProperty('left',(v.x+x)+'px','important');host.style.setProperty('top',(v.y+y)+'px','important');
  panel.style.left=Math.max(-x,Math.min(0,v.w-x-Math.min(420,v.w-16)-8))+'px';
  panel.style.top=(y+40+Math.min(v.h*.65,340)>v.h&&y>v.h/2)?'auto':'40px';
  panel.style.bottom=panel.style.top==='auto'?'40px':'auto';
  panel.style.maxHeight=Math.max(75,panel.style.top==='auto'?y-8:v.h-y-48)+'px';
 }
 const svg='<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3h10l4 4v14H5z"/><path d="M14 3v5h5M8 12h8M8 16h8"/></svg>';
 function make(){
  if(host||!document.body)return;
  host=document.createElement('div');host.id='tm-reading-insights';host.className='notranslate';host.setAttribute('translate','no');
  host.style.cssText='position:fixed!important;z-index:2147483639!important;width:36px!important;height:36px!important;display:block!important;pointer-events:none!important;margin:0!important;padding:0!important;transform:none!important;';
  root=host.attachShadow({mode:'closed'});
  const style=document.createElement('style');style.textContent=':host{color-scheme:light dark;font:14px/1.55 system-ui,sans-serif;color:CanvasText}button{font:inherit;color:inherit;cursor:pointer;border:1px solid color-mix(in srgb,CanvasText 22%,transparent);border-radius:7px;background:Canvas;padding:4px;min-width:30px;min-height:30px}#toggle{display:grid;place-items:center;width:34px;height:34px;opacity:.86;touch-action:none;pointer-events:auto;box-shadow:0 1px 4px #0003;padding:0}#toggle:hover,#toggle:focus-visible{opacity:1}#toggle[data-busy=true]{outline:2px dotted currentColor}section{position:absolute;box-sizing:border-box;width:min(420px,calc(100vw - 16px));background:Canvas;border:1px solid color-mix(in srgb,CanvasText 22%,transparent);border-radius:10px;padding:10px 13px;box-shadow:0 3px 16px #0003;overflow:auto;overscroll-behavior:contain;pointer-events:auto}section[hidden]{display:none!important}header{display:flex;align-items:center;gap:5px;position:sticky;top:-10px;background:Canvas;z-index:1;padding:3px 0}strong{flex:1}#meta{font-size:12px;opacity:.7;margin:3px 0 8px}#body{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:1.55}#retry{margin-top:8px;width:100%}#retry[hidden]{display:none!important}';
  icon=document.createElement('button');icon.id='toggle';icon.type='button';icon.innerHTML=svg;icon.title='精讀摘要（可拖曳）';icon.setAttribute('aria-label',icon.title);
  panel=document.createElement('section');panel.hidden=true;panel.setAttribute('role','region');panel.setAttribute('aria-label','精讀摘要');
  const head=document.createElement('header'),title=document.createElement('strong');title.textContent='精讀摘要';
  const collapse=document.createElement('button');collapse.type='button';collapse.textContent='−';collapse.title='收合摘要';collapse.setAttribute('aria-label',collapse.title);
  const close=document.createElement('button');close.type='button';close.textContent='×';close.title='隱藏本頁圖示';close.setAttribute('aria-label',close.title);
  head.append(title,collapse,close);meta=document.createElement('div');meta.id='meta';body=document.createElement('div');body.id='body';body.setAttribute('aria-live','polite');
  retry=document.createElement('button');retry.id='retry';retry.type='button';retry.textContent='產生精讀摘要';retry.hidden=true;
  panel.append(head,meta,body,retry);root.append(style,icon,panel);document.body.append(host);
  let drag=null,suppress=false;
  icon.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,px:pos.x,py:pos.y,moved:false};suppress=false;icon.setPointerCapture?.(e.pointerId);});
  icon.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>5)drag.moved=true;if(!drag.moved)return;
   const v=viewport();pos={x:Math.max(0,Math.min(v.w-40,drag.px+dx)),y:Math.max(0,Math.min(v.h-40,drag.py+dy))};place();
  });
  const end=e=>{if(!drag||e.pointerId!==drag.id)return;suppress=drag.moved;if(drag.moved)GM_setValue(positionKey,pos);drag=null;};
  icon.addEventListener('pointerup',end);icon.addEventListener('pointercancel',end);
  icon.addEventListener('click',()=>{if(suppress){suppress=false;return;}touched=true;expanded=!expanded;render();if(expanded&&!data?.summary&&!busy)void generate(true);});
  collapse.addEventListener('click',()=>{touched=true;expanded=false;render();});
  close.addEventListener('click',()=>{touched=true;hidden=true;expanded=false;render();});
  retry.addEventListener('click',()=>{touched=true;expanded=true;void generate(true);});
  window.addEventListener('resize',place,{passive:true});window.visualViewport?.addEventListener('resize',place,{passive:true});window.visualViewport?.addEventListener('scroll',place,{passive:true});
  render();place();
 }
 function render(){
  if(!host)return;
  host.style.setProperty('display',hidden?'none':'block','important');panel.hidden=!expanded;icon.setAttribute('aria-expanded',String(expanded));icon.dataset.busy=String(busy||!!data?.generating);
  meta.textContent=data?.minutes!=null?((data.cjk||0)>0?data.cjk+' 字'+(data.english?' / '+data.english+' words':''):data.english+' words')+' · 約 '+data.minutes+' 分鐘':'文章長度未知';
  body.textContent=data?.summary||(busy||data?.generating?'正在產生精讀摘要…':lastError||data?.error||'按下按鈕產生精讀摘要。');
  retry.hidden=!!data?.summary||busy||!!data?.generating;
 }
 function accept(value){
  data=value;if(value.summary&&value.auto_expand&&!touched){expanded=true;}
  lastError=value.error||'';render();
 }
 function poll(){
  clearTimeout(pollTimer);if(attempt++>=45)return;
  pollTimer=setTimeout(async()=>{try{const v=await request('lookup',source);accept(v);if(v.generating)poll();else if(!v.summary&&!touched&&v.auto_eligible&&!lastError)void generate(false);}catch(e){lastError=e.message;render();}},2200);
 }
 async function generate(manual){
  if(busy||data?.summary)return;
  busy=true;lastError='';render();
  try{
   let text='';
   if(!data?.has_body){
    text=extract();
    if(!text){lastError='尚未取得完整正文。請完成驗證或等待原文載入後重試。';return;}
   }
   const value=await request(manual?'manual':text?'capture':'prepare',source,text);
   accept(value);if(value.generating)poll();
  }catch(e){lastError=e.message;}
  finally{busy=false;render();}
 }
 async function begin(manual=false){
  if(started)return;source=trackedSource()||(manual?currentUrl():'');if(!source)return;started=true;
  try{
   const v=await request('lookup',source);
   if(!v.tracked){started=false;if(manual||location.hash==='#blog-bookmarks-reading'){make();lastError='此網址尚未收錄於書籤或 BetaCats 觀察資料。';expanded=true;render();}return;}
   make();accept(v);
   if(manual){touched=true;expanded=true;render();if(!v.summary)await generate(true);return;}
   if(v.summary)return;
   if(v.generating){poll();return;}
   if(v.has_body){if(v.auto_eligible)void generate(false);return;}
   // Wait for the DOM to settle. Do not send a verification page or a partial
   // first render. Retry locally only; failed extraction never spends AI.
   let prev='',stable=0;
   const timer=setInterval(()=>{
    if(busy||data?.summary){clearInterval(timer);return;}
    const text=extract();
    if(text&&text===prev){if(++stable>=2){clearInterval(timer);busy=true;render();request('capture',source,text).then(v=>{accept(v);if(v.generating)poll();}).catch(e=>{lastError=e.message;}).finally(()=>{busy=false;render();});}}
    else{prev=text;stable=0;}
   },750);
   setTimeout(()=>clearInterval(timer),60000);
  }catch(e){started=false;console.warn('Reading insights:',e.message);if(manual||location.hash==='#blog-bookmarks-reading'){make();lastError=e.message;expanded=true;render();}}
 }
 if(typeof GM_registerMenuCommand==='function')GM_registerMenuCommand('精讀摘要：顯示／恢復',()=>{if(host){hidden=false;touched=true;expanded=true;render();if(!data?.summary)void generate(true);}else void begin(true);});
 function scan(){if(!started&&(!host||!lastError))void begin();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan,{once:true});else scan();
 window.addEventListener('pageshow',scan);window.addEventListener('focus',scan);
 // Archive verification and client-rendered canonical links can appear late.
 let scans=0;const watch=setInterval(()=>{if(started||++scans>40){clearInterval(watch);return;}scan();},1500);
})();
// END READING_INSIGHTS
