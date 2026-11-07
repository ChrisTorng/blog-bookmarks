import { DICT1, DICT2, DICT3, DICT4, DICT5, TRADITIONAL } from './pinyin-dict.js';

// The first reading in the frequency-ordered dictionary is the deterministic
// fallback. Phrase entries handle common polyphonic words when possible.
const phrases = [null, null, DICT2, DICT3, DICT4, DICT5];
const romanize = value => String(value).normalize('NFD')
  .replace(/\u0308/g, '') // vowel ü has been decomposed; handle below first
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');
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

// Restrict the SQL table name to code-selected values, not request data.
// Unique DB constraints resolve concurrent slug collisions safely.
export async function ensureSlug(db, table, id, title) {
  if (table !== 'bookmarks' && table !== 'notes') throw new Error('Invalid slug table');
  const query = () => db.prepare('SELECT slug FROM ' + table + ' WHERE id=?').bind(id).first();
  const existing = await query();
  if (!existing) return null;
  if (existing.slug) return existing.slug;
  const base = slugify(title, table === 'notes' ? 'note' : 'bookmark');
  for (let n = 1; n <= 10000; n++) {
    const tail = n === 1 ? '' : '-' + n;
    const candidate = base.slice(0, 100 - tail.length).replace(/-+$/g, '') + tail;
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
