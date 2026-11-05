import { esc } from './data.js';

const css = `
.bm-page{width:100%;padding:1.25rem 0 3rem;color:inherit}
.bm-header{display:flex;align-items:baseline;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin:0 0 1.5rem}
.bm-header h1{font-size:clamp(1.7rem,3.5vw,2.35rem);font-weight:750;letter-spacing:-.03em;margin:0}
.bm-header h1 small{font-size:.48em;font-weight:400;letter-spacing:0;opacity:.6;margin-left:.5rem}
.bm-subtitle{font-size:.88rem;opacity:.67;margin:.3rem 0 0}
.bm-rss{display:inline-flex;align-items:center;gap:.4rem;white-space:nowrap;font-size:.86rem}
.bm-rss svg{width:1.15rem;height:1.15rem;flex:none}
.bm-columns{display:grid;grid-template-columns:244px minmax(0,1fr);gap:clamp(1.5rem,5vw,4.5rem);align-items:start}
.bm-sidebar{position:sticky;top:1rem;border-radius:.7rem;padding:1rem;background:rgba(127,127,127,.075);border:1px solid rgba(127,127,127,.12)}
.bm-root{display:block;margin:.2rem 0 .6rem;padding:.55rem .55rem;font-weight:700;text-decoration:none;border-radius:.4rem;color:inherit}
.bm-root:hover,.bm-root[aria-current="page"]{background:rgba(59,130,246,.09);color:var(--site-primary,#3b82f6)}
.bm-categories{border-top:1px solid rgba(127,127,127,.17);padding-top:.6rem!important;padding-left:.6rem!important}
.bm-categories{list-style:none;margin:0;padding:0;display:grid;gap:.12rem}
.bm-categories a{display:flex;justify-content:space-between;gap:.6rem;padding:.48rem .65rem;border-radius:.45rem;line-height:1.35;text-decoration:none;color:inherit;font-size:.92rem}
.bm-categories a:hover{background:rgba(127,127,127,.11);color:var(--site-primary,#3b82f6)}
.bm-categories a[aria-current="page"]{color:var(--site-primary,#3b82f6);font-weight:700;background:rgba(59,130,246,.09)}
.bm-count{opacity:.6;font-size:.78rem;font-variant-numeric:tabular-nums}
.bm-main{min-width:0}
.bm-toolbar{display:flex;align-items:center;justify-content:flex-end;gap:.6rem;flex-wrap:wrap;padding:0 0 1rem;border-bottom:1px solid rgba(127,127,127,.2)}
.bm-toolbar label{display:flex;align-items:center;gap:.4rem;font-size:.82rem;opacity:.9}
.bm-toolbar input{max-width:100%;min-width:0;border:1px solid rgba(127,127,127,.35);border-radius:.48rem;background:transparent;color:inherit;padding:.42rem .5rem;font-size:.85rem}
.bm-toolbar input[type=search]{width:clamp(145px,18vw,240px)}
.bm-toolbar input[type=date]{max-width:150px}
.bm-toolbar select{border:1px solid rgba(127,127,127,.35);border-radius:.48rem;background:transparent;color:inherit;padding:.45rem .65rem;font-size:.85rem}
.bm-mobile-tag{display:none}
.bm-item{padding:.95rem 0;border-bottom:1px solid rgba(127,127,127,.18);overflow-wrap:anywhere}
.bm-item-heading{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:.4rem 1rem}
.bm-titles{min-width:0}
.bm-date{text-align:right;white-space:nowrap;padding-top:.15rem}
.bm-item:first-child{padding-top:.8rem}
.bm-item time{font-size:.79rem;opacity:.62;font-variant-numeric:tabular-nums}
.bm-recommended{display:inline-flex;align-items:center;color:var(--site-primary,#60a5fa);background:rgba(59,130,246,.07);border-radius:999px;padding:.14rem .48rem;font-size:.75rem;margin-left:.45rem;font-weight:500}
.bm-item h2{font-size:clamp(1.13rem,2.15vw,1.42rem);line-height:1.35;font-weight:680;margin:0;letter-spacing:-.01em}
.bm-item h2 a{text-decoration:none;color:inherit}
.bm-item h2 a:hover{color:var(--site-primary,#3b82f6)}
.bm-original-title{font-size:.81rem;opacity:.65;line-height:1.4;margin:.2rem 0 0;overflow-wrap:anywhere}
.bm-original-url{font-size:.76rem;opacity:.68;line-height:1.4;overflow-wrap:anywhere;margin:.2rem 0 .4rem}
.bm-original-url a{color:inherit;text-decoration:underline}
.bm-summary{opacity:.83;line-height:1.55;margin:.48rem 0 .4rem;white-space:pre-wrap;font-size:.92rem}
.bm-item-footer{display:flex;align-items:center;gap:.55rem 1rem;flex-wrap:wrap;margin-top:.3rem;font-size:.82rem}
.bm-tags{display:flex;gap:.45rem;flex-wrap:wrap}
.bm-tags a{text-decoration:none;color:var(--site-primary,#3b82f6);font-weight:550}
.bm-detail{font-size:.82rem;opacity:.75;margin-left:auto}
.bm-pagination{display:flex;justify-content:space-between;align-items:center;gap:.5rem;margin-top:1.7rem;font-size:.85rem}
.bm-empty{padding:2rem .5rem;opacity:.72}
.bm-article h1{font-size:clamp(1.35rem,3vw,2rem);line-height:1.4;margin:.4rem 0}
.bm-article .bm-source{margin:1.2rem 0;overflow-wrap:anywhere}
.bm-back{display:inline-block;margin-bottom:1.2rem}
.bm-submit{border:1px solid rgba(127,127,127,.35);border-radius:.48rem;background:rgba(127,127,127,.09);padding:.44rem .8rem}
@media(max-width:767px){.bm-page{padding:.65rem 0 2rem}.bm-header{margin:0 0 .75rem}.bm-columns{display:block}.bm-sidebar{display:none}.bm-mobile-tag{display:inline-flex;align-items:center;gap:.3rem}.bm-toolbar{gap:.5rem;justify-content:flex-start}.bm-toolbar input[type=search]{width:100%}.bm-toolbar label.bm-search{flex-basis:100%}.bm-item{padding:.8rem 0}.bm-item h2{font-size:1.05rem}.bm-date{font-size:.75rem}.bm-summary{font-size:.87rem}.bm-detail{margin-left:0}}
`;

export function layout(title,body,feed='/bookmarks/feed.xml',feedTitle='書籤 RSS') {
 return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>${esc(title)} | ChrisTorng 學習天地</title>${feed?`<link rel="alternate" type="application/rss+xml" title="${esc(feedTitle)}" href="${esc(feed)}">`:''}<style>${css}</style></head><body><main>${body}</main></body></html>`;
}
export const quickAdminPage = '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>書籤快速處理</title><link rel="stylesheet" href="/bookmarks/admin.css"><link rel="stylesheet" href="/bookmarks/admin-quick.css"></head><body><div id="app"></div><script type="module" src="/bookmarks/admin-quick.js"></script></body></html>';
export const adminPage = '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>書籤管理</title><link rel="stylesheet" href="/bookmarks/admin.css"></head><body><div id="app"></div><script type="module" src="/bookmarks/admin.js"></script></body></html>';

export const zhTime = date => new Intl.DateTimeFormat('sv-SE',{
 timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date(date));
function href(tag,sort='new',page=1,search='',from='',to='') {
 const q=new URLSearchParams();
 if(tag)q.set('tag',tag);
 if(sort!=='new')q.set('sort',sort);
 if(search)q.set('q',search);
 if(from)q.set('from',from);
 if(to)q.set('to',to);
 if(page>1)q.set('page',String(page));
 const qs=q.toString();
 return '/bookmarks/'+(qs?'?'+qs:'');
}
export const rssIcon = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4 11a9 9 0 0 1 9 9\"/><path d=\"M4 4a16 16 0 0 1 16 16\"/><circle cx=\"5\" cy=\"19\" r=\"1\"/></svg>";
export const filtersScript = "(()=>{const form=document.getElementById('bookmark-filter-form');if(!form)return;const submit=()=>{const q=new URLSearchParams(new FormData(form));for(const [k,v] of [...q])if(!v)q.delete(k);location.assign('/bookmarks/'+(q.size?'?'+q:''));};form.querySelectorAll('select,input[type=date]').forEach(el=>el.addEventListener('change',submit));let timer;const search=form.querySelector('input[type=search]');search?.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(submit,750)});form.addEventListener('submit',e=>{e.preventDefault();clearTimeout(timer);submit()});})();";
export function listing(data,tags,opt) {
 const active=opt.tag||'',sort=opt.sort||'new',search=opt.q||'',from=opt.from||'',to=opt.to||'';
 const activeTag=tags.find(x=>x.id===active);
 const activeName=activeTag?.name_zh||activeTag?.name||active;
 const labels=new Map(tags.map(t=>[t.name.toLowerCase(),t]));
 const display=t=>t.name_zh||t.name;
 const categories=[{id:'',name:'所有書籤',name_zh:'所有書籤',count:null},...tags];
 const options=categories.map(t=>`<option value="${esc(t.id)}"${t.id===active?' selected':''}>${esc(display(t))}${t.count===null?'':` (${t.count})`}</option>`).join('');
 const root=`<a class="bm-root" href="${esc(href('',sort,1,search,from,to))}"${active?'':' aria-current="page"'}>所有書籤</a>`;
 const links=tags.map(t=>`<li><a href="${esc(href(t.id,sort,1,search,from,to))}"${active===t.id?' aria-current="page"':''}><span>${esc(display(t))}</span><span class="bm-count">${t.count}</span></a></li>`).join('');
 const sidebar=`<aside class="bm-sidebar" aria-label="書籤分類">${root}<ul class="bm-categories">${links}</ul></aside>`;
 const sortOptions=[['new','最新'],['old','最早'],['recommended','推薦優先'],['title','依標題']].map(([id,name])=>`<option value="${id}"${sort===id?' selected':''}>${name}</option>`).join('');
 const toolbar=`<form id="bookmark-filter-form" method="get" action="/bookmarks/" class="bm-toolbar"><label class="bm-mobile-tag">分類 <select name="tag" aria-label="選擇書籤分類">${options}</select></label><label class="bm-search">搜尋 <input type="search" name="q" value="${esc(search)}" placeholder="標題、摘要、網址" aria-label="搜尋書籤"></label><label>起 <input type="date" name="from" value="${esc(from)}" aria-label="開始日期"></label><label>迄 <input type="date" name="to" value="${esc(to)}" aria-label="結束日期"></label><label>排序 <select name="sort" aria-label="書籤排序">${sortOptions}</select></label></form>`;
 const entries=data.items.map(b=>{
   const time=b.status_at||b.published_at||b.created_at;
   const date=zhTime(time);
   const target=b.preferred_url||b.redirect_url||b.url;
   const originalTitle=b.title_original&&b.title_original!==b.title?`<p class="bm-original-title" lang="en">${esc(b.title_original)}</p>`:'';
   const source=target!==b.url?`<p class="bm-original-url">原始網址：<a href="${esc(b.url)}" target="_blank" rel="noopener noreferrer">${esc(b.url)}</a></p>`:'';
   return `<article class="bm-item"><div class="bm-item-heading"><div class="bm-titles"><h2><a href="${esc(target)}" target="_blank" rel="noopener noreferrer">${esc(b.title)}</a></h2>${originalTitle}</div><div class="bm-date"><time datetime="${esc(date)}">${esc(date)}</time>${b.status===4?'<span class="bm-recommended">☆ 推薦</span>':''}</div></div>${b.summary?`<p class="bm-summary">${esc(b.summary)}</p>`:''}${source}<div class="bm-item-footer"><div class="bm-tags">${b.tags.map(t=>{const tag=labels.get(t.toLowerCase());return `<a href="${esc(href(tag?.id||t.toLowerCase(),sort,1,search,from,to))}">#${esc(tag?display(tag):t)}</a>`}).join('')}</div><a class="bm-detail" href="/bookmarks/${encodeURIComponent(b.id)}/">書籤詳情</a></div></article>`;
 }).join('');
 const pagination=`<nav class="bm-pagination" aria-label="書籤分頁">${data.page>1?`<a href="${esc(href(active,sort,data.page-1,search,from,to))}">← 上一頁</a>`:'<span></span>'}<span>${data.page} / ${data.pages}</span>${data.page<data.pages?`<a href="${esc(href(active,sort,data.page+1,search,from,to))}">下一頁 →</a>`:'<span></span>'}</nav>`;
 const feed='/bookmarks/feed.xml'+(active?'?tag='+encodeURIComponent(active):'');
 const feedTitle=(active?activeName+' · ':'')+'書籤 RSS';
 return layout('書籤'+(activeName?' · '+activeName:''),`<section class="bm-page"><header class="bm-header"><div><h1>書籤 <small>Bookmarks</small></h1><p class="bm-subtitle">閱讀與分享的網頁收藏</p></div><a class="bm-rss" href="${esc(feed)}" type="application/rss+xml">${rssIcon}${esc(feedTitle)}</a></header><div class="bm-columns">${sidebar}<div class="bm-main">${toolbar}${entries||'<p class="bm-empty">沒有符合條件的公開書籤。</p>'}${pagination}</div></div></section><script src="/bookmarks/filters.js" defer></script>`,feed,feedTitle);
}

export function individual(b,tags=[]) {
 const labels=new Map(tags.map(t=>[t.name.toLowerCase(),t]));
 const time=b.status_at||b.published_at||b.created_at;
 const target=b.preferred_url||b.redirect_url||b.url;
 const originalTitle=b.title_original&&b.title_original!==b.title?`<p class="bm-original-title" lang="en">${esc(b.title_original)}</p>`:'';
 const source=target!==b.url?`<p class="bm-original-url">原始網址：<a href="${esc(b.url)}" target="_blank" rel="noopener noreferrer">${esc(b.url)}</a></p>`:'';
 return layout(b.title,`<section class="bm-page bm-article"><a class="bm-back" href="/bookmarks/">← 書籤列表</a><div><time datetime="${esc(zhTime(time))}">${esc(zhTime(time))}</time>${b.status===4?'<span class="bm-recommended">☆ 推薦</span>':''}</div><h1>${esc(b.title)}</h1>${originalTitle}<p class="bm-source"><a href="${esc(target)}" target="_blank" rel="noopener noreferrer">前往網站 ↗</a></p>${source}${b.summary?`<p class="bm-summary">${esc(b.summary)}</p>`:''}<div class="bm-tags">${b.tags.map(t=>{const tag=labels.get(t.toLowerCase());return `<a href="${esc(href(tag?.id||t.toLowerCase()))}">#${esc(tag?.name_zh||tag?.name||t)}</a>`}).join('')}</div></section>`);
}
