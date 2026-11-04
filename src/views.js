import { esc } from './data.js';

const css = `
.bm-page{width:100%;padding:1.25rem 0 3rem;color:inherit}
.bm-header{display:flex;align-items:baseline;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin:0 0 1.5rem}
.bm-header h1{font-size:clamp(1.7rem,3.5vw,2.35rem);font-weight:750;letter-spacing:-.03em;margin:0}
.bm-subtitle{font-size:.88rem;opacity:.67;margin:.3rem 0 0}
.bm-rss{white-space:nowrap;font-size:.86rem}
.bm-columns{display:grid;grid-template-columns:244px minmax(0,1fr);gap:clamp(1.5rem,5vw,4.5rem);align-items:start}
.bm-sidebar{position:sticky;top:1rem;border-radius:.7rem;padding:1rem;background:rgba(127,127,127,.075);border:1px solid rgba(127,127,127,.12)}
.bm-sidebar h2{font-size:.82rem;opacity:.75;text-transform:uppercase;font-weight:700;margin:.3rem 0 .9rem}
.bm-categories{list-style:none;margin:0;padding:0;display:grid;gap:.12rem}
.bm-categories a{display:flex;justify-content:space-between;gap:.6rem;padding:.48rem .65rem;border-radius:.45rem;line-height:1.35;text-decoration:none;color:inherit;font-size:.92rem}
.bm-categories a:hover{background:rgba(127,127,127,.11);color:var(--site-primary,#3b82f6)}
.bm-categories a[aria-current="page"]{color:var(--site-primary,#3b82f6);font-weight:700;background:rgba(59,130,246,.09)}
.bm-count{opacity:.6;font-size:.78rem;font-variant-numeric:tabular-nums}
.bm-main{min-width:0}
.bm-toolbar{display:flex;align-items:center;justify-content:flex-end;gap:.6rem;flex-wrap:wrap;padding:0 0 1rem;border-bottom:1px solid rgba(127,127,127,.2)}
.bm-toolbar label{font-size:.85rem;opacity:.77}
.bm-toolbar select{border:1px solid rgba(127,127,127,.35);border-radius:.48rem;background:transparent;color:inherit;padding:.45rem .65rem;font-size:.85rem}
.bm-mobile-tag{display:none}
.bm-item{padding:1.4rem 0;border-bottom:1px solid rgba(127,127,127,.18);overflow-wrap:anywhere}
.bm-item:first-child{padding-top:1.2rem}
.bm-item time{font-size:.79rem;opacity:.62;font-variant-numeric:tabular-nums}
.bm-recommended{display:inline-flex;align-items:center;color:var(--site-primary,#60a5fa);background:rgba(59,130,246,.07);border-radius:999px;padding:.14rem .48rem;font-size:.75rem;margin-left:.45rem;font-weight:500}
.bm-item h2{font-size:clamp(1.13rem,2.15vw,1.42rem);line-height:1.45;font-weight:680;margin:.5rem 0 .55rem;letter-spacing:-.01em}
.bm-item h2 a{text-decoration:none;color:inherit}
.bm-item h2 a:hover{color:var(--site-primary,#3b82f6)}
.bm-summary{opacity:.83;line-height:1.76;margin:.3rem 0 .75rem;white-space:pre-wrap;font-size:.94rem}
.bm-item-footer{display:flex;align-items:center;gap:.55rem 1rem;flex-wrap:wrap;margin-top:.75rem;font-size:.82rem}
.bm-tags{display:flex;gap:.45rem;flex-wrap:wrap}
.bm-tags a{text-decoration:none;color:var(--site-primary,#3b82f6);font-weight:550}
.bm-detail{font-size:.82rem;opacity:.75;margin-left:auto}
.bm-pagination{display:flex;justify-content:space-between;align-items:center;gap:.5rem;margin-top:1.7rem;font-size:.85rem}
.bm-empty{padding:2rem .5rem;opacity:.72}
.bm-article h1{font-size:clamp(1.35rem,3vw,2rem);line-height:1.4;margin:.4rem 0}
.bm-article .bm-source{margin:1.2rem 0;overflow-wrap:anywhere}
.bm-back{display:inline-block;margin-bottom:1.2rem}
.bm-submit{border:1px solid rgba(127,127,127,.35);border-radius:.48rem;background:rgba(127,127,127,.09);padding:.44rem .8rem}
@media(max-width:767px){.bm-page{padding:.65rem 0 2rem}.bm-header{margin:0 0 1rem}.bm-columns{display:block}.bm-sidebar{display:none}.bm-mobile-tag{display:inline-flex;align-items:center;gap:.3rem}.bm-toolbar{gap:.7rem;justify-content:flex-start}.bm-item{padding:1.1rem 0}.bm-item h2{font-size:1.18rem}.bm-summary{font-size:.9rem}.bm-detail{margin-left:0}}
`;

export function layout(title,body,feed='/bookmarks/feed.xml',feedTitle='全部書籤 RSS 訂閱') {
 return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>${esc(title)} | ChrisTorng 學習天地</title>${feed?`<link rel="alternate" type="application/rss+xml" title="${esc(feedTitle)}" href="${esc(feed)}">`:''}<style>${css}</style></head><body><main>${body}</main></body></html>`;
}
export const adminPage = '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>書籤管理</title><link rel="stylesheet" href="/bookmarks/admin.css"></head><body><div id="app"></div><script type="module" src="/bookmarks/admin.js"></script></body></html>';

export const zhTime = date => new Intl.DateTimeFormat('zh-TW',{
 timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
}).format(new Date(date));
function href(tag,sort='new',page=1) {
 const q=new URLSearchParams();
 if(tag)q.set('tag',tag);
 if(sort!=='new')q.set('sort',sort);
 if(page>1)q.set('page',String(page));
 const qs=q.toString();
 return '/bookmarks/'+(qs?'?'+qs:'');
}
export function listing(data,tags,opt) {
 const active=opt.tag||'',sort=opt.sort||'new';
 const activeTag=tags.find(x=>x.id===active);
 const activeName=activeTag?.name_zh||activeTag?.name||active;
 const labels=new Map(tags.map(t=>[t.name.toLowerCase(),t]));
 const display=t=>t.name_zh||t.name;
 const categories=[{id:'',name:'所有書籤',name_zh:'所有書籤',count:null},...tags];
 const links=categories.map(t=>`<li><a href="${esc(href(t.id,sort))}"${active===t.id?' aria-current="page"':''}><span>${esc(display(t))}</span>${t.count===null?'':`<span class="bm-count">${t.count}</span>`}</a></li>`).join('');
 const sidebar=`<aside class="bm-sidebar" aria-label="書籤標籤"><h2>標籤</h2><ul class="bm-categories">${links}</ul></aside>`;
 const options=categories.map(t=>`<option value="${esc(t.id)}"${t.id===active?' selected':''}>${esc(display(t))}${t.count===null?'':` (${t.count})`}</option>`).join('');
 const sortOptions=[['new','最新分享'],['old','最早分享'],['recommended','推薦優先'],['title','依標題']].map(([id,name])=>`<option value="${id}"${sort===id?' selected':''}>${name}</option>`).join('');
 const toolbar=`<form method="get" action="/bookmarks/" class="bm-toolbar"><label class="bm-mobile-tag">標籤 <select name="tag" aria-label="選擇書籤標籤">${options}</select></label><label>排序 <select name="sort" aria-label="書籤排序">${sortOptions}</select></label><button type="submit" class="bm-submit">套用</button></form>`;
 const entries=data.items.map(b=>{
   const time=b.status_at||b.published_at||b.created_at;
   return `<article class="bm-item"><div><time datetime="${esc(time)}">${esc(zhTime(time))}</time>${b.status===4?'<span class="bm-recommended">☆ 推薦</span>':''}</div><h2><a href="${esc(b.url)}" target="_blank" rel="noopener noreferrer">${esc(b.title)}</a></h2>${b.summary?`<p class="bm-summary">${esc(b.summary)}</p>`:''}<div class="bm-item-footer"><div class="bm-tags">${b.tags.map(t=>{const tag=labels.get(t.toLowerCase());return `<a href="${esc(href(tag?.id||t.toLowerCase(),sort))}">#${esc(tag?display(tag):t)}</a>`}).join('')}</div><a class="bm-detail" href="/bookmarks/${encodeURIComponent(b.id)}/">書籤詳情</a></div></article>`;
 }).join('');
 const pagination=`<nav class="bm-pagination" aria-label="書籤分頁">${data.page>1?`<a href="${esc(href(active,sort,data.page-1))}">← 上一頁</a>`:'<span></span>'}<span>${data.page} / ${data.pages}</span>${data.page<data.pages?`<a href="${esc(href(active,sort,data.page+1))}">下一頁 →</a>`:'<span></span>'}</nav>`;
 const feed='/bookmarks/feed.xml'+(active?'?tag='+encodeURIComponent(active):'');
 const feedTitle=(active?activeName:'全部')+'書籤 RSS 訂閱';
 return layout('書籤'+(activeName?' · '+activeName:''),`<section class="bm-page"><header class="bm-header"><div><h1>書籤 <small>Bookmarks</small></h1><p class="bm-subtitle">閱讀與分享的網頁收藏</p></div><a class="bm-rss" href="${esc(feed)}" type="application/rss+xml">${esc(feedTitle)}</a></header><div class="bm-columns">${sidebar}<div class="bm-main">${toolbar}${entries||'<p class="bm-empty">目前沒有公開書籤。</p>'}${pagination}</div></div></section>`,feed,feedTitle);
}
export function individual(b,tags=[]) {
 const labels=new Map(tags.map(t=>[t.name.toLowerCase(),t]));
 const time=b.status_at||b.published_at||b.created_at;
 return layout(b.title,`<section class="bm-page bm-article"><a class="bm-back" href="/bookmarks/">← 書籤列表</a><div><time datetime="${esc(time)}">${esc(zhTime(time))}</time>${b.status===4?'<span class="bm-recommended">☆ 推薦</span>':''}</div><h1>${esc(b.title)}</h1><p class="bm-source"><a href="${esc(b.url)}" target="_blank" rel="noopener noreferrer">前往原始網站 ↗</a></p>${b.summary?`<p class="bm-summary">${esc(b.summary)}</p>`:''}<div class="bm-tags">${b.tags.map(t=>{const tag=labels.get(t.toLowerCase());return `<a href="${esc(href(tag?.id||t.toLowerCase()))}">#${esc(tag?.name_zh||tag?.name||t)}</a>`}).join('')}</div></section>`);
}
