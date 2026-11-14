import { get, patch } from './data.js';
import { suggestBookmarkTags, mergeBookmarkTags } from './classify.js';

// Invoked only by the authenticated Notes admin API through its service binding.
// Publishing a Note should not leave its referenced bookmark invisible.
export async function recommendBookmarkForPublishedNote(
  env, id, { load = get, update = patch, classify = suggestBookmarkTags } = {}
) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || '')))
    throw new Error('引用書籤 ID 無效');
  const current = await load(env.DB, id, true);
  if (!current) throw new Error('引用書籤不存在');
  if (current.status === 4) return { id, status: 4, changed: false };

  let tags = (current.tags || []).filter(tag =>
    String(tag).toLowerCase() !== 'default'
  );
  if (!tags.length) {
    try {
      tags = mergeBookmarkTags([], await classify(env, current))
        .filter(tag => String(tag).toLowerCase() !== 'default');
    } catch (error) {
      throw new Error('引用書籤缺少分類，AI 自動分類失敗，請先設定分類：' +
        String(error?.message || error));
    }
    if (!tags.length)
      throw new Error('引用書籤缺少有效分類，請先設定分類再發佈隨筆');
  }

  // patch() performs the same summary/category validation as manual publication
  // and creates the stable bookmark permalink on first publication.
  const saved = await update(env.DB, id, { status: 4, tags });
  if (!saved || saved.status !== 4)
    throw new Error('引用書籤無法設定為推薦');
  return { id, status: 4, changed: true };
}
