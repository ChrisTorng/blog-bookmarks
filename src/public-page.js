import { esc } from './data.js';
import { bookmarkArticleHtml } from './public-content.js';

const siteTitle = 'ChrisTorng 學習天地';
const pageUrl = item => '/bookmarks/' + encodeURIComponent(item.slug) + '/';

function adjacentNavigation({prev,next}={}) {
  if (!prev && !next) return '';
  const link=(item,direction)=>item ? '<a href="'+esc(pageUrl(item))+'" rel="'+direction+'" aria-label="'+(direction==='prev'?'上一篇：':'下一篇：')+esc(item.title)+'" class="min-w-0 break-words '+(direction==='next'?'text-right ':'')+'text-primary-500 hover:text-primary-600">'+(direction==='prev'?'← '+esc(item.title):esc(item.title)+' →')+'</a>' : '<span class="hidden sm:block"></span>';
  return '<nav aria-label="上下一篇" class="my-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2 sm:gap-3">'+link(prev,'prev')+link(next,'next')+'</nav>';
}

export async function publicBookmarkPage(request,item,categories=[],relatedNotesHtml='',adjacent={}) {
  const siteUrl = new URL(request.url).origin;
  const canonical = siteUrl + pageUrl(item);
  const title = item.title + ' | ' + siteTitle;
  const description = String(item.summary || item.title).replace(/\[([^\]]+)\]\([^)]+\)/g,'$1')
    .replace(/[*_~#]/g,'').slice(0,180);
  const body = '<section class="w-full py-5 pb-12">'+
    '<a class="text-primary-500 text-sm" href="/bookmarks/"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" class="inline-block align-text-bottom"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg> 書籤列表</a>'+
    adjacentNavigation(adjacent)+'<div class="mt-4">'+bookmarkArticleHtml(item,categories,relatedNotesHtml,'',true)+'</div>'+adjacentNavigation(adjacent)+'</section>';
  const meta = '<meta name="description" content="'+esc(description)+'">'+
    '<meta name="robots" content="index,follow">'+
    '<link rel="canonical" href="'+esc(canonical)+'">'+
    '<meta property="og:type" content="article"><meta property="og:title" content="'+esc(item.title)+'">'+
    '<meta property="og:url" content="'+esc(canonical)+'">'+
    '<meta property="og:description" content="'+esc(description)+'">'+
    (item.image_url && /^https:\/\/[^/]+/i.test(item.image_url)
      ? '<meta property="og:image" content="'+esc(item.image_url)+'">' : '')+
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
