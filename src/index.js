import { list, tagsList, get, getBySlug, getByOldSlug, esc, publicFeedItems, publicSitemapEntries } from './data.js';
import { publicBookmarkPage } from './public-page.js';
import { api, opts } from './api.js';
import { rss } from './feeds.js';
import { relatedNoteHtml } from './note-references.js';
import { backfillMissingImages } from './auto-image.js';
import { publicBookmarksList } from './public-list.js';
import { pruneReadingBodies } from './reading.js';

// The HTML, JS and CSS live exclusively on GitHub Pages.
// This Worker serves the API and the dynamic RSS feed only.
const reply = (body, type='text/plain; charset=utf-8', status=200) =>
  new Response(body,{status,headers:{
    'Content-Type':type,
    'X-Content-Type-Options':'nosniff',
    'Cache-Control':'no-store'
  }});

// Legacy per-PoP Cache API is intentionally disabled; public XML is now
// cached exclusively by the globally-purgeable PublicCache entrypoint.
function cachedXml(_req,_env,_ctx,_ttl,produce) { return produce(); }

const isPublicPage = (path) =>
  path === '/bookmarks/' || path === '/bookmarks' ||
  path === '/bookmarks/feed.xml' || path === '/bookmarks/sitemap.xml' ||
  /^\/bookmarks\/[a-z0-9-]{1,100}\/?$/.test(path) &&
  !['view','admin','api'].includes(path.split('/')[2]);

const worker = {
 async scheduled(event,env,ctx){
  ctx.waitUntil(pruneReadingBodies(env.DB).catch(error=>console.warn('Article body pruning failed',String(error))));
  ctx.waitUntil(backfillMissingImages(env,6).then(async result => {
    // Published thumbnails can change without an admin save.
    // Keep their HTML and Notes references fresh after enrichment.
    if (result?.saved > 0 && env.AUTH_MODE !== 'local' && ctx?.exports?.PublicCache?.purgePublic) {
      await ctx.exports.PublicCache.purgePublic();
      await env.NOTE_REFERENCES.invalidatePublic();
    }
    return result;
  }).catch(error=>console.error('Bookmark scheduled image enrichment/cache purge failed',String(error))));
 },
 async fetch(req, env, ctx, inner = false) {
  if (req.method === 'HEAD') {
   const response = await worker.fetch(new Request(req,{method:'GET'}),env,ctx,inner);
   return new Response(null,{status:response.status,headers:response.headers});
  }
  const url=new URL(req.url), path=url.pathname;
  // The default entrypoint always runs. Only anonymous public HTML/XML can
  // reach the separate cacheable entrypoint. Never cache admin or JSON APIs.
  if (!inner && req.method === 'GET' && env.AUTH_MODE !== 'local' &&
      isPublicPage(path) && ctx?.exports?.PublicCache?.fetch) {
    const publicRequest = new Request(req);
    publicRequest.headers.delete('Authorization');
    publicRequest.headers.delete('Cookie');
    return ctx.exports.PublicCache.fetch(publicRequest);
  }
  if (path === '/bookmarks/' || path === '/bookmarks') {
    if (req.method === 'GET') return publicBookmarksList(req,env);
  }
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
      const published = /^[0-9a-f-]{36}$/.test(key) ? await get(env.DB,key)
        : await getBySlug(env.DB,key) || await getByOldSlug(env.DB,key);
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
