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
 assert.match(html,/2026-11-03/);
 assert.doesNotMatch(html,/2026\/09\/01/);
 assert.match(html,/\?x=1&amp;y=2/);
});
test('detail links original URL and has site bookmark path',()=>{
 const html=individual(item);
 assert.match(html,/前往網站/);
 assert.match(html,/書籤列表/);
});
test('RSS timestamps use recommendation event not first collection',()=>{
 const xml=rss([item],'https://christorng.idv.tw');
 assert.match(xml,/Mon, 02 Nov 2026 16:00:01 GMT/);
 assert.doesNotMatch(xml,/Tue, 01 Sep 2026/);
});

test('public bookmarks show Chinese labels while preserving English tag IDs',()=>{
 const html=listing({items:[item],total:1,page:1,pages:1},[{id:'ai',name:'AI',name_zh:'人工智慧',count:1}],{sort:'new',tag:'ai'});
 assert.match(html,/#人工智慧/);
 assert.match(html,/人工智慧 · 書籤 RSS/);
 assert.match(html,/\/bookmarks\/\?tag=ai/);
 assert.doesNotMatch(html,/#AI</);
 const detail=individual(item,[{id:'ai',name:'AI',name_zh:'人工智慧',count:1}]);
 assert.match(detail,/#人工智慧/);
});
test('RSS title is all bookmarks or selected Chinese tag',()=>{
 assert.ok(rss([item],'https://christorng.idv.tw').includes('<title>所有書籤 RSS | ChrisTorng 學習天地</title>'));
 assert.ok(rss([item],'https://christorng.idv.tw','ai','人工智慧').includes('<title>人工智慧 · 書籤 RSS | ChrisTorng 學習天地</title>'));
 assert.match(rss([item],'https://christorng.idv.tw','ai','人工智慧'),/bookmarks\/\?tag=ai/);
});

test('public list/detail/RSS prioritize redirect and retain source URL and bilingual title',()=>{
 const dual={...item, title:'原始標題的中文翻譯',title_zh:'原始標題的中文翻譯',title_original:'Original English title',redirect_url:'https://nitter.tiekoetter.com/user/status/123',url:'https://x.com/user/status/123'};
 const list=listing({items:[dual],total:1,page:1,pages:1},[],{sort:'new',tag:''});
 assert.match(list,/href="https:\/\/nitter\.tiekoetter\.com\/user\/status\/123"/);
 assert.match(list,/原始網址/);
 assert.match(list,/https:\/\/x\.com\/user\/status\/123/);
 assert.match(list,/Original English title/);
 const detail=individual(dual);
 assert.match(detail,/Original English title/);
 assert.match(detail,/原始網址/);
 const feed=rss([dual],'https://christorng.idv.tw');
 assert.ok(feed.includes('<link>https://christorng.idv.tw/bookmarks/view/?id='+dual.id+'</link>'));
 assert.ok(feed.includes('https://nitter.tiekoetter.com/user/status/123'));
 assert.ok(feed.includes('Original English title'));
});

test('public bookmarks expose date only with compact heading and root tag outside indented list',()=>{
 const x=listing({items:[item],total:1,page:1,pages:1},[{id:'ai',name:'AI',name_zh:'人工智慧',count:1}],{sort:'new',tag:''});
 assert.match(x,/class="bm-root"/);
 assert.match(x,/class="bm-item-heading"/);
 assert.match(x,/class="bm-date"/);
 assert.match(x,/<time datetime="2026-11-03">2026-11-03<\/time>/);
 assert.doesNotMatch(x,/12:00/);
 assert.match(x,/name="q"/);
 assert.match(x,/name="from"/);
 assert.match(x,/name="to"/);
 assert.match(x,/bookmarks\/filters.js/);
 assert.doesNotMatch(x,/>套用<\/button>/);
 assert.match(x,/<svg/);
 const detail=individual(item);
 assert.doesNotMatch(detail,/12:00/);
 assert.match(detail,/datetime="2026-11-03"/);
});
test('sort and search state persist across pagination and tag links',()=>{
 const x=listing({items:[item],total:41,page:2,pages:3},[{id:'ai',name:'AI',name_zh:'人工智慧',count:1}],
  {sort:'title',tag:'ai',q:'article',from:'2026-11-01',to:'2026-11-30'});
 assert.match(x,/sort=title/);
 assert.match(x,/q=article/);
 assert.match(x,/from=2026-11-01/);
 assert.match(x,/to=2026-11-30/);
 assert.match(x,/page=3/);
});
