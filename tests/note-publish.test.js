import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recommendBookmarkForPublishedNote } from '../src/note-publish.js';

const id = '439e6a51-9c83-417b-aa1c-d0d1b02c973c';

test('publishing a note recommends a private referenced bookmark', async () => {
  const calls = [];
  const result = await recommendBookmarkForPublishedNote(
    { DB: {} }, id, {
      load: async () => ({ id, status: 0, summary: '有效的網頁摘要', tags: ['Tech'] }),
      update: async (_db, changedId, value) => {
        calls.push({ changedId, value });
        return { id: changedId, status: 4 };
      },
    }
  );
  assert.deepEqual(result, { id, status: 4, changed: true });
  assert.deepEqual(calls, [{ changedId: id, value: { status: 4, tags: ['Tech'] } }]);
});

test('a private referenced bookmark with no category uses the chosen classifier', async () => {
  let writes = 0;
  await recommendBookmarkForPublishedNote({ DB: {} }, id, {
    load: async () => ({ id, status: 0, tags: ['default'] }),
    classify: async () => ['Tech'],
    update: async (_db, _id, value) => {
      writes++;
      assert.deepEqual(value, { status: 4, tags: ['Tech'] });
      return { status: 4 };
    },
  });
  assert.equal(writes, 1);
});

test('a failed classifier does not publish a category-less bookmark', async () => {
  let wrote = false;
  await assert.rejects(() => recommendBookmarkForPublishedNote({ DB: {} }, id, {
    load: async () => ({ id, status: 0, tags: [] }),
    classify: async () => { throw Error('model unavailable') },
    update: async () => { wrote = true },
  }), /AI 自動分類失敗/);
  assert.equal(wrote, false);
});

test('already-recommended bookmarks are idempotent', async () => {
  let wrote = false;
  assert.deepEqual(await recommendBookmarkForPublishedNote({ DB: {} }, id, {
    load: async () => ({ id, status: 4, tags: ['Tech'] }),
    update: async () => { wrote = true },
  }), { id, status: 4, changed: false });
  assert.equal(wrote, false);
});
