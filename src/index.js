import { list, tagsList, get, getBySlug, esc, publicFeedItems, publicSitemapEntries } from './data.js';
import { publicBookmarkPage } from './public-page.js';
import { api, opts } from './api.js';
import { rss } from './feeds.js';
import { relatedNoteHtml } from './note-references.js';
import { backfillMissingImages } from './auto-image.js';

// The HTML, JS and CSS live exclusively on GitHub Pages.
// This Worker serves the API and the dynamic RSS feed only.
const reply = (body, type='text/plain; charset=utf-8', status=200) =>
  new Response(body,{status,headers:{
    'Content-Type':type,
    'X-Content-Type-Options':'nosniff',
    'Cache-Control':'no-store'
  }});

// Cache only public, anonymous XML. Keep the browser side revalidating while
// allowing the edge to reuse expensive generated XML for a bounded period.
// Cache API is per-POP: publication may take up to the TTL to reach every POP.
async function cachedXml(req, env, ctx, ttl, produce) {
  const cache = env.AUTH_MODE !== 'local' && typeof caches !== 'undefined' ? caches.default : null;
  const url = new URL(req.url);
  const keyUrl = url.origin + url.pathname + (url.searchParams.has('tag')
    ? '?tag=' + encodeURIComponent(url.searchParams.get('tag') || '') : '');
  const key = cache ? new Request(keyUrl) : null;
  if (cache) {
    try { const hit = await cache.match(key); if (hit) return hit; }
    catch (error) { console.warn('Public XML cache read failed', String(error)); }
  }
  const generated = await produce();
  if (!cache || !generated.ok || !ctx?.waitUntil) return generated;
  const headers = new Headers(generated.headers);
  headers.set('Cache-Control', `public, max-age=0, s-maxage=${ttl}`);
  const response = new Response(generated.body, {status:generated.status,headers});
  ctx.waitUntil(cache.put(key, response.clone()).catch(error =>
    console.warn('Public XML cache write failed', String(error))));
  return response;
}

const worker = {
 async scheduled(event,env,ctx){
  ctx.waitUntil(backfillMissingImages(env,6).catch(error=>console.error('Bookmark scheduled image enrichment failed',String(error))));
 },
 async fetch(req, env, ctx) {
  if (req.method === 'HEAD') {
   const response = await worker.fetch(new Request(req,{method:'GET'}),env,ctx);
   return new Response(null,{status:response.status,headers:response.headers});
  }
  const url=new URL(req.url), path=url.pathname;
  if (path==='/bookmarks/api' || path==='/bookmarks/api/' || path.startsWith('/bookmarks/api/')) return api(req,env,url,ctx);
  if (path==='/bookmarks/feed.xml' && req.method==='GET') {
    return cachedXml(req,env,ctx,60,async () => {
      try {
        const tag=url.searchParams.get('tag')||'';
        const [items,tags]=await Promise.all([publicFeedItems(env.DB,tag),tagsList(env.DB)]);
        const selected=tags.find(t=>t.id===tag);
        const tagLabel=selected?.name_zh||selected?.name||tag;
        const notes=await relatedNoteHtml(env,items);
        return reply(rss(items,env.SITE_URL||'https://christorng.idv.tw',tag,tagLabel,tags,notes),'application/rss+xml; charset=utf-8');
      }catch(error){
        console.error('Bookmark RSS failed',String(error));
        return reply('RSS 暫時無法取得','text/plain; charset=utf-8',500);
      }
    });
  }
  if (path === '/bookmarks/sitemap.xml' && req.method === 'GET') {
    return cachedXml(req,env,ctx,300,async () => {
      const records = await publicSitemapEntries(env.DB);
      const base = (env.SITE_URL || 'https://christorng.idv.tw').replace(/\/$/,'');
      const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
        records.map(b=>'<url><loc>'+esc(base+'/bookmarks/'+encodeURIComponent(b.slug)+'/')+
          '</loc><lastmod>'+esc(b.status_at)+'</lastmod></url>').join('') + '</urlset>';
      return reply(xml,'application/xml; charset=utf-8');
    });
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
        const [tags,notes]=await Promise.all([tagsList(env.DB),relatedNoteHtml(env,[published])]);
        return publicBookmarkPage(req,published,tags,notes[published.id]);
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
