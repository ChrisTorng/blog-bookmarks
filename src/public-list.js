import { list, tagsList, esc } from './data.js';
import { bookmarkArticleHtml, bookmarkPermalink } from './public-content.js';
import { relatedNoteHtml } from './note-references.js';

// Every published card is rendered into the initial response, without client JS.
// Forms and ordinary links preserve search, categories, dates, sort and pagination.
export async function publicBookmarksList(req, env) {
  const url = new URL(req.url);
  const p = url.searchParams;
  const filter = {
    tag: (p.get('tag') || '').slice(0, 100),
    q: (p.get('q') || '').slice(0, 100),
    from: /^\d{4}-\d{2}-\d{2}$/.test(p.get('from') || '') ? p.get('from') : '',
    to: /^\d{4}-\d{2}-\d{2}$/.test(p.get('to') || '') ? p.get('to') : '',
    sort: ['old','new','recommended','title'].includes(p.get('sort')) ? p.get('sort') : 'new',
    page: Math.max(1, Math.min(100000, Number(p.get('page')) || 1)),
  };
  const [result, categories] = await Promise.all([
    list(env.DB, { ...filter, privateList: false, filter: 'published' }),
    tagsList(env.DB),
  ]);
  const notes = await relatedNoteHtml(env, result.items);
  const active = categories.find(t => t.id === filter.tag);
  const activeName = active ? (active.name_zh || active.name) : '';
  const label = activeName ? activeName + ' · 書籤' : '書籤';
  const name = 'ChrisTorng 學習天地';
  const buildLink = (changes = {}) => {
    const next = { ...filter, ...changes };
    const search = new URLSearchParams();
    for (const key of ['tag','q','from','to','sort','page']) {
      const value = next[key];
      if (!value || (key === 'sort' && value === 'new') || (key === 'page' && Number(value) === 1)) continue;
      search.set(key, String(value));
    }
    return '/bookmarks/' + (search.size ? '?' + search.toString() : '');
  };
  const nav = categories.map(t => {
    const label = t.name_zh || t.name;
    const selected = t.id === filter.tag;
    return '<a class="block rounded px-2 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 ' +
      (selected ? 'bg-gray-100 font-bold text-primary-500 dark:bg-gray-800' : '') +
      '" href="' + esc(buildLink({ tag:t.id, page:1 })) + '">#' + esc(label) +
      ' <small class="text-gray-500">(' + Number(t.count) + ')</small></a>';
  }).join('');
  const field = 'rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';
  const radio = (value,title) => '<option value="' + value + '"' + (filter.sort === value ? ' selected' : '') +
    '>' + title + '</option>';
  const cards = result.items.map(item =>
    bookmarkArticleHtml(item, categories, notes[item.id] || '', bookmarkPermalink(item), true)
  ).join('');
  const prev = result.page > 1 ? '<a class="text-primary-500" href="' +
    esc(buildLink({ page:result.page-1 })) + '">← 上一頁</a>' : '<span></span>';
  const next = result.page < result.pages ? '<a class="text-primary-500" href="' +
    esc(buildLink({ page:result.page+1 })) + '">下一頁 →</a>' : '<span></span>';
  const pageLinks = result.pages > 1 ? '<nav aria-label="分頁" class="mt-6 flex items-center justify-between gap-3 text-sm">' +
    prev + '<span>' + result.page + ' / ' + result.pages + '</span>' + next + '</nav>' : '';
  const body = '<section class="w-full py-5 pb-12">' +
    '<header class="mb-6 flex flex-wrap items-start justify-between gap-4">' +
    '<div><h1 class="heading-accent text-3xl font-extrabold sm:text-5xl">' + esc(label) +
    ' <small class="ml-2 text-lg font-normal text-gray-500">Bookmarks</small></h1>' +
    '<p class="mt-3 text-gray-500 dark:text-gray-400">閱讀與分享的網頁收藏</p></div>' +
    '<a class="text-primary-500 text-sm" type="application/rss+xml" href="/bookmarks/feed.xml' +
    (filter.tag ? '?tag=' + encodeURIComponent(filter.tag) : '') + '">書籤 RSS</a></header>' +
    '<div class="grid grid-cols-1 items-start gap-6 md:grid-cols-[244px_minmax(0,1fr)] lg:gap-12">' +
    '<aside class="hidden md:block"><a class="mb-2 block font-bold text-primary-500" href="/bookmarks/">所有書籤 (' +
    Number(result.total) + ')</a><nav class="space-y-1" aria-label="書籤分類">' + nav + '</nav></aside>' +
    '<div class="min-w-0"><form method="get" action="/bookmarks/" class="mb-4 space-y-2 border-b border-gray-300/30 pb-4">' +
    '<div class="flex flex-wrap items-center gap-2">' +
    '<label class="flex-1"><span class="sr-only">搜尋</span><input class="' + field +
    ' w-full" type="search" name="q" placeholder="搜尋標題、摘要、網址" value="' + esc(filter.q) + '"></label>' +
    '<label><span class="sr-only">排序</span><select class="' + field + '" name="sort">' +
    radio('new','最新') + radio('old','最早') + radio('recommended','推薦優先') + radio('title','依標題') +
    '</select></label><button type="submit" class="rounded bg-primary-500 px-3 py-1.5 text-sm text-white">查詢</button></div>' +
    '<div class="flex flex-wrap gap-2 text-sm"><label>由 <input aria-label="起始日期" class="' + field +
    '" type="date" name="from" value="' + esc(filter.from) + '"></label>' +
    '<label>至 <input aria-label="結束日期" class="' + field +
    '" type="date" name="to" value="' + esc(filter.to) + '"></label></div>' +
    '<label class="md:hidden">分類 <select class="' + field + '" name="tag">' +
    '<option value="">所有書籤</option>' + categories.map(t => '<option value="' + esc(t.id) +
    '"' + (t.id === filter.tag ? ' selected' : '') + '>' + esc(t.name_zh || t.name) + '</option>').join('') +
    '</select></label></form>' + (cards || '<p class="py-6 text-gray-500">沒有符合條件的書籤。</p>') +
    pageLinks + '</div></div></section>';

  const shell = await fetch(env.BLOG_SHELL_URL || url.origin + '/notes-shell/', { headers:{Accept:'text/html'} });
  if (!shell.ok) return new Response('網站版型暫時無法取得', {status:503, headers:{'Cache-Control':'no-store'}});
  const canonical = url.origin + '/bookmarks/';
  const description = 'ChrisTorng 分享的書籤、原始文章連結、繁體中文摘要與分類';
  const meta = '<meta name="description" content="' + esc(description) + '">' +
    '<meta name="robots" content="' + (p.size ? 'noindex,follow' : 'index,follow') + '">' +
    '<link rel="canonical" href="' + esc(canonical) + '">';
  let rewrite = new HTMLRewriter()
    .on('#notes-content',{element(el){el.setInnerContent(body,{html:true});}})
    .on('title',{element(el){el.setInnerContent(label + ' | ' + name);}})
    .on('head',{element(el){el.append(meta,{html:true});}});
  for (const selector of ['meta[name="description"]','meta[name="robots"]','link[rel="canonical"]'])
    rewrite = rewrite.on(selector,{element(el){el.remove();}});
  const headers = new Headers(shell.headers);
  headers.set('Content-Type','text/html; charset=utf-8');
  headers.set('Cache-Control','no-store'); // PublicCache entrypoint overrides this for public requests.
  headers.delete('Content-Length');
  return rewrite.transform(new Response(shell.body,{status:200,headers}));
}
