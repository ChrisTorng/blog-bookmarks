export async function relatedNoteHtml(env, items) {
  if (!env.NOTE_REFERENCES || !items.length) return {};
  return env.NOTE_REFERENCES.publishedHtml(items.map(item => item.id));
}
