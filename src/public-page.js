import { esc } from './data.js';
import { bookmarkArticleHtml } from './public-content.js';

const siteTitle = 'ChrisTorng 學習天地';
const pageUrl = item => '/bookmarks/' + encodeURIComponent(item.slug) + '/';

export async function publicBookmarkPage(request,item,categories=[],relatedNotesHtml='') {
  const siteUrl = new URL(request.url).origin;
  const canonical = siteUrl + pageUrl(item);
  const title = item.title + ' | ' + siteTitle;
  const description = String(item.summary || item.title).replace(/\[([^\]]+)\]\([^)]+\)/g,'$1')
    .replace(/[*_~#]/g,'').slice(0,180);
  const body = '<section class="w-full py-5 pb-12">'+
    '<a class="text-primary-500 text-sm" href="/bookmarks/">← 書籤列表</a>'+
    '<div class="mt-4">'+bookmarkArticleHtml(item,categories,relatedNotesHtml)+'</div></section>';
  const meta = '<meta name="description" content="'+esc(description)+'">'+
    '<meta name="robots" content="index,follow">'+
    '<link rel="canonical" href="'+esc(canonical)+'">'+
    '<meta property="og:type" content="article"><meta property="og:title" content="'+esc(item.title)+'">'+
    '<meta property="og:url" content="'+esc(canonical)+'">'+
    '<meta property="og:description" content="'+esc(description)+'">'+
    '<link rel="alternate" type="application/rss+xml" title="所有書籤 RSS | '+siteTitle+'" href="/bookmarks/feed.xml">';
  // A static GitHub Pages shell provides the same navigation, typography, color
  // scheme and responsive layout used by the bookmark list.
  const response=await fetch(siteUrl+'/notes-shell/',{headers:{Accept:'text/html'}});
  if(!response.ok)return new Response('網站版型暫時無法取得',{status:503});
  let rewrite=new HTMLRewriter()
    .on('#notes-content',{element(el){el.setInnerContent(body,{html:true});}})
    .on('title',{element(el){el.setInnerContent(title);}})
    .on('head',{element(el){el.append(meta,{html:true});}});
  for(const selector of ['meta[name="description"]','meta[name="robots"]',
    'link[rel="canonical"]','meta[property^="og:"]']) {
    rewrite=rewrite.on(selector,{element(el){el.remove();}});
  }
  const headers=new Headers(response.headers);
  headers.set('Cache-Control','no-store');
  headers.delete('content-length');
  return rewrite.transform(new Response(response.body,{status:200,headers}));
}
