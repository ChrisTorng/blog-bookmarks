import { list, tagsList, get, getBySlug, esc } from './data.js';
import { publicBookmarkPage } from './public-page.js';
import { api, opts } from './api.js';
import { rss } from './feeds.js';

// The HTML, JS and CSS live exclusively on GitHub Pages.
// This Worker serves the API and the dynamic RSS feed only.
const reply = (body, type='text/plain; charset=utf-8', status=200) =>
  new Response(body,{status,headers:{
    'Content-Type':type,
    'X-Content-Type-Options':'nosniff',
    'Cache-Control':'no-store'
  }});

const worker = {
 async fetch(req, env, ctx) {
  if (req.method === 'HEAD') {
   const response = await worker.fetch(new Request(req,{method:'GET'}),env,ctx);
   return new Response(null,{status:response.status,headers:response.headers});
  }
  const url=new URL(req.url), path=url.pathname;
  if (path==='/bookmarks/api' || path==='/bookmarks/api/' || path.startsWith('/bookmarks/api/')) return api(req,env,url,ctx);
  if (path==='/bookmarks/feed.xml' && req.method==='GET') {
   try {
    const tag=url.searchParams.get('tag')||'';
    const [first,tags]=await Promise.all([
     list(env.DB,{tag,filter:'published'}),tagsList(env.DB)
    ]);
    const selected=tags.find(t=>t.id===tag);
    const tagLabel=selected?.name_zh||selected?.name||tag;
    const items=[...first.items];
    for(let n=2;n<=Math.min(first.pages,5);n++){
     const page=await list(env.DB,{tag,filter:'published',page:n});
     items.push(...page.items);
    }
    return reply(rss(items,env.SITE_URL||'https://christorng.idv.tw',tag,tagLabel,tags),'application/rss+xml; charset=utf-8');
   }catch{return reply('RSS 暫時無法取得','text/plain; charset=utf-8',500);}
  }
  if (path === '/bookmarks/sitemap.xml' && req.method === 'GET') {
    const first = await list(env.DB, {filter:'published'});
    const pages = [first];
    for(let n=2;n<=first.pages;n++) pages.push(await list(env.DB,{filter:'published',page:n}));
    const base = (env.SITE_URL || 'https://christorng.idv.tw').replace(/\/$/,'');
    const records = pages.flatMap(p=>p.items).filter(b=>b.slug);
    const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      records.map(b=>'<url><loc>'+esc(base+'/bookmarks/'+encodeURIComponent(b.slug)+'/')+
        '</loc><lastmod>'+esc((b.status_at||b.published_at||b.created_at).slice(0,10))+
        '</lastmod></url>').join('') + '</urlset>';
    return reply(xml,'application/xml; charset=utf-8');
  }
  // The catch-all Worker route forwards existing static GitHub Pages content
  // to the origin. Only single-segment public slugs are handled dynamically.
  if (req.method === 'GET') {
    const legacy = path === '/bookmarks/view/' || path === '/bookmarks/view';
    const oldId = legacy ? url.searchParams.get('id') : null;
    if (oldId && /^[0-9a-f-]{36}$/.test(oldId)) {
      const published = await get(env.DB, oldId);
      if (published?.slug)
        return Response.redirect(url.origin + '/bookmarks/' + encodeURIComponent(published.slug) + '/', 308);
    }
    const match = path.match(/^\/bookmarks\/([a-z0-9-]{1,100})\/?$/);
    if (match && !['view','admin','api'].includes(match[1])) {
      const key = match[1];
      const published = /^[0-9a-f-]{36}$/.test(key) ? await get(env.DB,key) : await getBySlug(env.DB,key);
      if (published?.slug) {
        const canonical = '/bookmarks/' + published.slug + '/';
        if (url.pathname !== canonical)
          return Response.redirect(url.origin + canonical,308);
        return publicBookmarkPage(req,published,await tagsList(env.DB));
      }
      return reply('找不到書籤','text/plain; charset=utf-8',404);
    }
  }
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    return reply('Not Found','text/plain; charset=utf-8',404);
  return fetch(req);
 }
};
export default worker;
