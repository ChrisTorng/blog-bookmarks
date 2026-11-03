import { esc } from './data.js';
export function layout(title,body) {
 return '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>'+esc(title)+'</title><style>.bm{max-width:850px;margin:auto;padding:20px}.bm article{padding:16px 0;border-bottom:1px solid #8885}.bm p{line-height:1.7}.bm form{display:flex;gap:12px;flex-wrap:wrap}.bm time{opacity:.65;font-size:.85rem}</style></head><body><main class="bm">'+body+'</main></body></html>';
}
export const adminPage = '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>書籤管理</title><link rel="stylesheet" href="/bookmarks/admin.css"></head><body><div id="app"></div><script type="module" src="/bookmarks/admin.js"></script></body></html>';

export function listing(data,tags,opt){
 const tag=opt.tag||'';
 const filter='<form action="/bookmarks/"><label>標籤 <select name="tag"><option value="">全部</option>'+tags.map(t=>'<option value="'+esc(t.id)+'"'+(tag===t.id?' selected':'')+'>'+esc(t.name)+' ('+t.count+')</option>').join('')+'</select></label><label>排序 <select name="sort">'+[['new','最新'],['old','最舊'],['recommended','推薦優先'],['title','標題']].map(([v,t])=>'<option value="'+v+'"'+(opt.sort===v?' selected':'')+'>'+t+'</option>').join('')+'</select></label><button>篩選</button></form>';
 const entries=data.items.map(b=>'<article><time>'+esc(new Date(b.created_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}))+'</time> '+(b.status===3?'★ 推薦':'')+'<h2><a href="'+esc(b.url)+'" target="_blank" rel="noopener noreferrer">'+esc(b.title)+'</a></h2>'+(b.summary?'<p>'+esc(b.summary)+'</p>':'')+'<p>'+b.tags.map(t=>'<a href="/bookmarks/?tag='+encodeURIComponent(t.toLowerCase())+'">#'+esc(t)+'</a>').join(' ')+'</p><a href="/bookmarks/'+b.id+'/">詳細</a></article>').join('');
 const page='<nav>'+(data.page>1?'<a href="?page='+(data.page-1)+'&tag='+encodeURIComponent(tag)+'">上一頁</a> ':'')+'第 '+data.page+' / '+data.pages+' 頁 '+(data.page<data.pages?'<a href="?page='+(data.page+1)+'&tag='+encodeURIComponent(tag)+'">下一頁</a>':'')+'</nav>';
 return layout('書籤 Bookmarks','<h1>書籤 Bookmarks</h1>'+filter+(entries||'<p>目前沒有公開書籤。</p>')+page);
}
export function individual(b){
 return layout(b.title,'<a href="/bookmarks/">← 書籤列表</a><h1>'+esc(b.title)+'</h1><p><a href="'+esc(b.url)+'" target="_blank" rel="noopener noreferrer">閱讀原始網頁 ↗</a></p>'+(b.summary?'<p>'+esc(b.summary)+'</p>':'')+'<p>'+b.tags.map(t=>'#'+esc(t)).join(' ')+'</p>');
}
