import { WorkerEntrypoint } from 'cloudflare:workers';
import { get, tagsList } from '../data.js';
import { recommendBookmarkForPublishedNote } from '../note-publish.js';
import { bookmarkArticleHtml, bookmarkPermalink } from '../public-content.js';

export { default } from '../index.js';

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
