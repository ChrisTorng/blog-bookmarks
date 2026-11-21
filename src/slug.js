import { DICT1, DICT2, DICT3, DICT4, DICT5, TRADITIONAL } from './pinyin-dict.js';

// The first reading in the frequency-ordered dictionary is the deterministic
// fallback. Phrase entries handle common polyphonic words when possible.
const phrases = [null, null, DICT2, DICT3, DICT4, DICT5];
const normalizeReading = value => String(value).replace(/ü/g, 'v').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function slugify(title, fallback = 'entry') {
  const text = Array.from(String(title || '').normalize('NFKC'));
  const simplified = text.map(ch => TRADITIONAL[ch] || ch);
  const tokens = [];
  let word = '';
  const flush = () => { if (word) tokens.push(word.toLowerCase()); word = ''; };
  for (let i = 0; i < simplified.length;) {
    const ch = simplified[i];
    if (/^[a-z0-9]$/i.test(ch)) { word += ch; i++; continue; }
    flush();
    if (/\p{Script=Han}/u.test(ch)) {
      let match = null, length = 0;
      for (let n = Math.min(5, simplified.length - i); n >= 2; n--) {
        const key = simplified.slice(i, i + n).join('');
        if (phrases[n]?.[key]) { match = phrases[n][key]; length = n; break; }
      }
      if (match) {
        tokens.push(...match.split(/\s+/).map(normalizeReading).filter(Boolean));
        i += length;
      } else {
        const reading = DICT1[ch]?.split(/\s+/)[0] || DICT1[text[i]]?.split(/\s+/)[0];
        if (reading) tokens.push(normalizeReading(reading));
        i++;
      }
      continue;
    }
    i++;
  }
  flush();
  const base = tokens.join('-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const value = base.slice(0, 100).replace(/-+$/g, '');
  return value || fallback;
}


// Future bookmarks with Chinese-only titles use semantic English translation
// once on first publication, not Pinyin or a per-request AI call.
export function englishSlug(text) {
  return String(text || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 100).replace(/-+$/g, '');
}

export async function translatedBookmarkSlug(title, ai) {
  const original = String(title || '').trim();
  if (!/\p{Script=Han}/u.test(original)) return englishSlug(original) || 'bookmark';
  if (!ai?.run) throw new Error('無法翻譯書籤網址：尚未設定 Workers AI');
  let result;
  try {
    result = await ai.run('@cf/google/gemma-4-26b-a4b-it', {
      messages:[
        {role:'system',content:'Translate this Traditional Chinese article/bookmark title into a concise, natural English title suitable for a URL. Preserve technical names, dates, proper nouns. Translate meaning, NEVER Pinyin or transliteration. Output ONLY the English title, without quotation marks, commentary or Markdown.'},
        {role:'user',content:original.slice(0,200)}
      ],
      chat_template_kwargs:{enable_thinking:false},temperature:0,max_tokens:140
    });
  } catch (error) {
    console.error('Bookmark title translation error',String(error));
    throw new Error('無法翻譯書籤網址，請稍後重試');
  }
  const response = result?.choices?.[0]?.message?.content ?? result?.response ?? '';
  const candidate = String(response).trim().replace(/^["'“”]+|["'“”]+$/g,'');
  if (/\p{Script=Han}/u.test(candidate) || /^i (cannot|can't|am unable)/i.test(candidate))
    throw new Error('AI 未產生有效英文書籤網址，請重試');
  const slug = englishSlug(candidate);
  if (slug.length < 4) throw new Error('AI 未產生有效英文書籤網址，請重試');
  return slug;
}

// Restrict the SQL table name to code-selected values, not request data.
// Unique DB constraints resolve concurrent slug collisions safely.
export async function ensureSlug(db, table, id, title, preferredSlug = '') {
  if (table !== 'bookmarks' && table !== 'notes') throw new Error('Invalid slug table');
  const query = () => db.prepare('SELECT slug FROM ' + table + ' WHERE id=?').bind(id).first();
  const existing = await query();
  if (!existing) return null;
  if (existing.slug) return existing.slug;
  const base = preferredSlug ? englishSlug(preferredSlug) : slugify(title, table === 'notes' ? 'note' : 'bookmark');
  for (let n = 1; n <= 10000; n++) {
    const tail = n === 1 ? '' : '-' + n;
    const candidate = base.slice(0, 100 - tail.length).replace(/-+$/g, '') + tail;
    const reserved = table === 'notes'
      ? ['view','editor','admin','api','all','page','feed','sitemap']
      : ['view','admin','api','feed','sitemap'];
    if (reserved.includes(candidate) || (table === 'notes' && /^[0-9]{8}-[a-f0-9]{10}$/.test(candidate))) continue;
    try {
      const result = await db.prepare('UPDATE ' + table + ' SET slug=? WHERE id=? AND slug IS NULL')
        .bind(candidate, id).run();
      if (result.meta.changes) return candidate;
      return (await query())?.slug || null;
    } catch (error) {
      if (/UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE/i.test(String(error))) continue;
      throw error;
    }
  }
  throw new Error('Unable to reserve URL slug');
}
