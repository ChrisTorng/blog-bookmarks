// RSS-only preview URLs contain a public bookmark ID and a source revision.
// Readers cannot supply an arbitrary source URL or arbitrary transformation options.
export function rssPreviewPath(id, source) {
  if (!/^[0-9a-f-]{36}$/.test(id || '') || !source) return '';
  let hash = 2166136261;
  for (const c of String(source)) { hash ^= c.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return '/bookmarks/rss-image/' + id + '/' + (hash >>> 0).toString(16).padStart(8,'0') + '.jpg';
}
export const rssImagePattern = /^\/bookmarks\/rss-image\/([0-9a-f-]{36})\/[0-9a-f]{8}\.jpg$/;

// Only the explicitly marked article preview is changed. Favicon, note
// Markdown images, hyperlinks, and public HTML remain untouched.
export function rssPreviewHtml(html, siteUrl) {
  const base = siteUrl.replace(/\/$/, '');
  return String(html).replace(/<img\b[^>]*>/gi, tag => {
    const path = tag.match(/\bdata-rss-preview="([^"]+)"/)?.[1];
    if (!path || !rssImagePattern.test(path)) return tag;
    return tag.replace(/\bsrc="[^"]*"/, 'src="' + base + path + '"')
      .replace(/\sdata-rss-preview="[^"]*"/, '')
      .replace(/\sloading="lazy"/, '').replace(/\sdecoding="async"/, '');
  });
}

export async function rssImage(request, db, fetcher = fetch) {
  const url = new URL(request.url), match = rssImagePattern.exec(url.pathname);
  const fail = (status) => new Response(null, {status, headers:{'Cache-Control':'no-store'}});
  if (!match || url.search) return fail(404);
  // Primary key lookup, no scanning of the bookmarks table.
  const row = await db.prepare('SELECT image_url FROM bookmarks WHERE id=? AND stage>=3')
    .bind(match[1]).first();
  if (!row?.image_url || rssPreviewPath(match[1], row.image_url) !== url.pathname) return fail(404);
  let source;
  try {
    source = new URL(row.image_url);
    if (source.protocol !== 'https:' || source.username || source.password || source.port ||
        !source.hostname.includes('.') || /^(?:localhost|\d+(?:\.\d+){0,3}|\[|0x)/i.test(source.hostname) ||
        /\.(?:local|localhost|internal|test|invalid)$/.test(source.hostname) ||
        source.hostname === url.hostname || source.hostname.endsWith('.' + url.hostname)) return fail(404);
  } catch { return fail(404); }
  try {
    // Cloudflare fetch transformations cache the original and fixed JPEG variant.
    // Never negotiate WebP/AVIF from the reader's Accept header.
    const response = await fetcher(source.href, {
      redirect:'manual', signal:AbortSignal.timeout(15000),
      headers:{Accept:'image/*'},
      cf:{image:{format:'jpeg',width:640,fit:'scale-down',quality:85,metadata:'none'}}
    });
    if (!response.ok || !/^image\/jpeg(?:;|$)/i.test(response.headers.get('Content-Type') || '')) {
      await response.body?.cancel().catch(()=>{});
      return fail(502);
    }
    const headers = new Headers({'Content-Type':'image/jpeg','Cache-Control':'public, max-age=3600, s-maxage=86400','X-Content-Type-Options':'nosniff'});
    for (const key of ['etag','cf-resized']) {
      const value = response.headers.get(key); if (value) headers.set(key,value);
    }
    return new Response(response.body,{status:200,headers});
  } catch { return fail(502); }
}

// Keep the exact BetaCats WebP for the website, but deliver it through the
// site's own origin. Only public, database-backed images can be requested.
const betaCatsWebp = /^https:\/\/hackernews\.betacat\.io\/image\/[a-zA-Z0-9_-]{1,128}\.webp$/;
export function webPreviewPath(id, source) {
  if (!betaCatsWebp.test(String(source || ''))) return '';
  return rssPreviewPath(id, source).replace('/rss-image/', '/preview-image/').replace(/\.jpg$/, '.webp');
}
export const webImagePattern = /^\/bookmarks\/preview-image\/([0-9a-f-]{36})\/[0-9a-f]{8}\.webp$/;

export async function webImage(request, db, fetcher = fetch) {
  const url = new URL(request.url), match = webImagePattern.exec(url.pathname);
  const fail = status => new Response(null,{status,headers:{'Cache-Control':'no-store'}});
  if (!match || url.search) return fail(404);
  const row = await db.prepare('SELECT image_url FROM bookmarks WHERE id=? AND stage>=3')
    .bind(match[1]).first();
  if (!row?.image_url || webPreviewPath(match[1],row.image_url) !== url.pathname) return fail(404);
  try {
    const response = await fetcher(row.image_url,{
      redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Accept:'image/webp'}
    });
    if (!response.ok || !/^image\/webp(?:;|$)/i.test(response.headers.get('Content-Type') || '')) {
      await response.body?.cancel().catch(()=>{});
      return fail(response.status===404 ? 404 : 502);
    }
    const headers = new Headers({'Content-Type':'image/webp','Cache-Control':'public, max-age=3600, s-maxage=86400','X-Content-Type-Options':'nosniff'});
    const etag = response.headers.get('etag'); if (etag) headers.set('etag',etag);
    return new Response(response.body,{status:200,headers});
  } catch { return fail(502); }
}
