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
  fetch(request) {
    return worker.fetch(request, this.env, this.ctx, true);
  }

  async purgePublic() {
    const result = await this.ctx.cache.purge({ purgeEverything: true });
    if (!result.success) throw new Error('Bookmark Workers Cache purge failed: ' + JSON.stringify(result.errors || []));
    return true;
  }
}

export class NoteEditor extends WorkerEntrypoint {
  async recommendForPublishedNote(id) {
    return recommendBookmarkForPublishedNote(this.env, id);
  }

  async previewBookmark(id) {
    const item = await get(this.env.DB, id, true);
    if (!item) return null;
    const tags = await tagsList(this.env.DB, true);
    return bookmarkArticleHtml(item, tags, '', bookmarkPermalink(item));
  }
}
