import { WorkerEntrypoint } from 'cloudflare:workers';
import { get, tagsList } from '../data.js';
import { recommendBookmarkForPublishedNote } from '../note-publish.js';
import { bookmarkArticleHtml, bookmarkPermalink } from '../public-content.js';

import worker from '../index.js';

export default worker;

// Only this entrypoint participates in Workers Cache. The default handler
// remains uncached, so authenticated APIs, mutable state and static passthrough
// requests cannot accidentally be cached.
export class PublicCache extends WorkerEntrypoint {
  async fetch(request) {
    const response = await worker.fetch(request, this.env, this.ctx, true);
    const type = response.headers.get('Content-Type') || '';
    // Cache ONLY successful public HTML and XML. Never cache redirects,
    // errors, JSON (including public API), access responses, or static origin.
    if (response.status !== 200 || !/(text\/html|\/xml|\+xml)/i.test(type)) return response;
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'public, max-age=0, s-maxage=300');
    headers.set('Cache-Tag', 'blog-bookmarks-public');
    return new Response(response.body, {status:response.status,headers});
  }

  async purgePublic() {
    const result = await this.ctx.cache.purge({ purgeEverything: true });
    if (!result.success) throw new Error('Bookmark Workers Cache purge failed: ' + JSON.stringify(result.errors || []));
    return true;
  }
}

export class NoteEditor extends WorkerEntrypoint {
  async recommendForPublishedNote(id) {
    const result = await recommendBookmarkForPublishedNote(this.env, id);
    if (result.changed) await this.invalidatePublic();
    return result;
  }

  // Called by Notes and by the local Bookmarks gateway after a mutation.
  async invalidatePublic() {
    return this.ctx.exports.PublicCache.purgePublic();
  }

  async previewBookmark(id) {
    const item = await get(this.env.DB, id, true);
    if (!item) return null;
    const tags = await tagsList(this.env.DB, true);
    return bookmarkArticleHtml(item, tags, '', bookmarkPermalink(item));
  }
}
