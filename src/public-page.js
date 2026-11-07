import { esc } from './data.js';

const site = 'ChrisTorng 學習天地';
const pageUrl = (item) => '/bookmarks/' + encodeURIComponent(item.slug) + '/';

export async function publicBookmarkPage(request, item) {
  const siteUrl = new URL(request.url).origin;
  const canonical = siteUrl + pageUrl(item);
  const target = item.preferred_url || item.redirect_url || item.url;
  const date = (item.status_at || item.published_at || item.created_at || '').slice(0, 10);
  const english = item.title_original && item.title_original !== item.title
    ? '<p lang="en" class="mt-3 leading-relaxed text-gray-600 dark:text-gray-300">' + esc(item.title_original) + '</p>' : '';
  const summary = item.summary
    ? '<div class="my-6 whitespace-pre-wrap text-gray-700 dark:text-gray-200">' + esc(item.summary) + '</div>' : '';
  const source = target !== item.url
    ? '<p class="mt-2 text-sm break-all text-gray-600 dark:text-gray-300">原始網址：<a class="underline" href="' +
      esc(item.url) + '" target="_blank" rel="noopener noreferrer">' + esc(item.url) + '</a></p>' : '';
  const tags = item.tags.map(tag => '<a class="text-primary-500" href="/bookmarks/?tag=' +
    encodeURIComponent(tag.toLowerCase()) + '">#' + esc(tag) + '</a>').join('');
  const body = '<section class="py-8"><a class="text-primary-500" href="/bookmarks/">← 書籤列表</a>' +
    '<article class="mt-8 border-b border-gray-300/40 pb-6 dark:border-gray-700">' +
    '<div class="mb-3 flex items-center justify-between gap-3 text-sm"><time datetime="' + esc(date) +
      '" class="text-gray-500">' + esc(date) + '</time><span class="' + (item.status === 4 ? 'text-primary-500' : 'text-gray-500') +
      '">' + (item.status === 4 ? '☆ 推薦' : '已公開') + '</span></div>' +
    '<h1 class="text-2xl leading-snug font-bold sm:text-3xl"><a class="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400" href="' +
      esc(target) + '" target="_blank" rel="noopener noreferrer">' + esc(item.title) + '</a></h1>' +
    english + summary +
    '<div class="mt-4 flex min-w-0 flex-wrap items-center gap-3 text-sm"><a class="text-primary-500" href="' +
      esc(target) + '" target="_blank" rel="noopener noreferrer">前往網站</a></div>' + source +
    '<div class="mt-4 flex flex-wrap gap-3 text-sm">' + tags + '</div></article></section>';
  const title = item.title + ' | ' + site;
  const description = String(item.summary || item.title).slice(0, 180);
  const meta = '<meta name="description" content="' + esc(description) + '">' +
    '<meta name="robots" content="index,follow">' +
    '<link rel="canonical" href="' + esc(canonical) + '">' +
    '<meta property="og:type" content="article"><meta property="og:title" content="' + esc(item.title) + '">' +
    '<meta property="og:url" content="' + esc(canonical) + '">' +
    '<meta property="og:description" content="' + esc(description) + '">' +
    '<link rel="alternate" type="application/rss+xml" title="所有書籤 RSS | ' + site + '" href="/bookmarks/feed.xml">';
  const response = await fetch(siteUrl + '/notes-shell/', {headers:{'Accept':'text/html'}});
  if (!response.ok) return new Response('網站版型暫時無法取得', {status:503});
  let rewrite = new HTMLRewriter()
    .on('#notes-content', { element(el) { el.setInnerContent(body,{html:true}); } })
    .on('title', { element(el) { el.setInnerContent(title); } })
    .on('head', { element(el) { el.append(meta,{html:true}); } });
  for (const selector of ['meta[name="description"]', 'meta[name="robots"]',
    'link[rel="canonical"]', 'meta[property^="og:"]']) {
    rewrite = rewrite.on(selector, { element(el) { el.remove(); } });
  }
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'public, max-age=60');
  headers.delete('content-length');
  return rewrite.transform(new Response(response.body,{status:200,headers}));
}
