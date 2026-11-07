import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify, ensureSlug } from '../src/slug.js';

test('English article titles become short lowercase permanent URL slugs', () => {
  assert.equal(slugify('The Future of AI Agents'), 'the-future-of-ai-agents');
  assert.equal(slugify("C# / .NET: What's New?"), 'c-net-what-s-new');
  assert.equal(slugify(' '), 'entry');
});

test('Traditional Chinese uses tone-free Hanyu Pinyin, with phrase disambiguation', () => {
  assert.equal(slugify('人工智慧的未來'), 'ren-gong-zhi-hui-de-wei-lai');
  assert.equal(slugify('我的學習心得'), 'wo-de-xue-xi-xin-de');
  assert.equal(slugify('銀行'), 'yin-hang');
});

test('slug suffixes resolve uniqueness and URLs stay stable on edits', async () => {
  const storage = new Map([['a',null],['b',null],['c',null]]);
  const bySlug = new Map();
  const db = {prepare(sql) { return {bind(...params) {return {
    async first() { return {slug:storage.get(params[0])}; },
    async run() {
      const [slug,id]=params;
      if (bySlug.has(slug)) throw Error('UNIQUE constraint failed: bookmarks.slug');
      if (storage.get(id)) return {meta:{changes:0}};
      storage.set(id,slug);bySlug.set(slug,id);return {meta:{changes:1}};
    },
  }}}}};
  assert.equal(await ensureSlug(db,'bookmarks','a','Same title'), 'same-title');
  assert.equal(await ensureSlug(db,'bookmarks','b','Same title'), 'same-title-2');
  assert.equal(await ensureSlug(db,'bookmarks','c','Same title'), 'same-title-3');
  assert.equal(await ensureSlug(db,'bookmarks','a','Changed title'), 'same-title');
});
