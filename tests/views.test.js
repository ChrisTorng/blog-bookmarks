import test from 'node:test';
import assert from 'node:assert/strict';
import { listing, individual } from '../src/views.js';
import { rss } from '../src/feeds.js';

const item={
 id:'cfa92f03-a68a-4a3c-aee9-a8416ff75022',
 url:'https://example.org/article?x=1&y=2',
 title:'Example article',summary:'A short summary',tags:['AI'],status:4,
 created_at:'2026-09-01T12:00:00Z',
 published_at:'2026-10-01T12:00:00Z',
 starred_at:'2026-11-03T12:00:00Z',
 status_at:'2026-11-03T12:00:00Z'
};
test('public listing uses last publication status time, not collection time',()=>{
 const html=listing({items:[item],total:1,page:1,pages:1},[{id:'ai',name:'AI',count:1}],{sort:'new',tag:''});
 assert.match(html,/bm-sidebar/);
 assert.match(html,/bm-mobile-tag/);
 assert.match(html,/推薦/);
 assert.match(html,/2026\/11\/03/);
 assert.doesNotMatch(html,/2026\/09\/01/);
 assert.match(html,/\?x=1&amp;y=2/);
});
test('detail links original URL and has site bookmark path',()=>{
 const html=individual(item);
 assert.match(html,/前往原始網站/);
 assert.match(html,/書籤列表/);
});
test('RSS timestamps use recommendation event not first collection',()=>{
 const xml=rss([item],'https://christorng.idv.tw');
 assert.match(xml,/Tue, 03 Nov 2026 12:00:00 GMT/);
 assert.doesNotMatch(xml,/Tue, 01 Sep 2026/);
});

test('public bookmarks show Chinese labels while preserving English tag IDs',()=>{
 const html=listing({items:[item],total:1,page:1,pages:1},[{id:'ai',name:'AI',name_zh:'人工智慧',count:1}],{sort:'new',tag:'ai'});
 assert.match(html,/#人工智慧/);
 assert.match(html,/人工智慧書籤 RSS 訂閱/);
 assert.match(html,/\/bookmarks\/\?tag=ai/);
 assert.doesNotMatch(html,/#AI</);
 const detail=individual(item,[{id:'ai',name:'AI',name_zh:'人工智慧',count:1}]);
 assert.match(detail,/#人工智慧/);
});
test('RSS title is all bookmarks or selected Chinese tag',()=>{
 assert.match(rss([item],'https://christorng.idv.tw'),/<title>全部書籤 RSS 訂閱<\/title>/);
 assert.match(rss([item],'https://christorng.idv.tw','ai','人工智慧'),/<title>人工智慧書籤 RSS 訂閱<\/title>/);
 assert.match(rss([item],'https://christorng.idv.tw','ai','人工智慧'),/bookmarks\/\?tag=ai/);
});
