import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReferences,validate} from '../src/data.js';
import {findHnDiscussion,lookupReference} from '../src/references.js';
import {bookmarkArticleHtml} from '../src/public-content.js';
import {rss} from '../src/feeds.js';

test('empty references are the default; several URLs dedupe and normalize',()=>{
  assert.deepEqual(validate({url:'https://example.org'}).references,[]);
  assert.deepEqual(normalizeReferences([
    {url:'https://example.org/a#top',title:'測試'},
    {url:'https://example.org/a',title:'duplicate'},
    {url:'https://news.ycombinator.com/item?id=123',title:'HN',kind:'hacker-news'}
  ]),[
    {url:'https://example.org/a',title:'測試',kind:'link'},
    {url:'https://news.ycombinator.com/item?id=123',title:'HN',kind:'hacker-news'}
  ]);
  assert.throws(()=>normalizeReferences([{url:'javascript:alert(1)'}]),/HTTP/);
  assert.equal(normalizeReferences([{url:'https://example.org',kind:'hacker-news'}])[0].kind,'link');
});
test('HN lookup chooses most discussed EXACT matching article, not nearby URLs',async()=>{
  const transport=async()=>new Response(JSON.stringify({hits:[
    {url:'https://example.org/post/other',title:'Wrong',objectID:'45',num_comments:500},
    {url:'https://example.org/post?id=1',title:'Same original',objectID:'46',num_comments:12},
    {url:'https://example.org/post?id=1',title:'More comments',objectID:'47',num_comments:100},
    {url:'https://example.org/post?id=2',title:'Wrong query',objectID:'48',num_comments:900}
  ]}),{headers:{'Content-Type':'application/json'}});
  assert.deepEqual(await findHnDiscussion(['https://example.org/post?id=1'],transport),
    {url:'https://news.ycombinator.com/item?id=47',title:'More comments',kind:'hacker-news'});
  assert.equal((await findHnDiscussion(['https://example.org/post?id=3'],transport)),null);
});
test('manual link fetches a real page title; unavailable fetch keeps an editable host fallback',async()=>{
  const transport=async()=>new Response('<title>Some public reference</title>',{headers:{'Content-Type':'text/html'}});
  assert.deepEqual(await lookupReference({type:'title',url:'https://example.org/reference'},transport),
    {found:true,reference:{url:'https://example.org/reference',title:'Some public reference',kind:'link'}});
  const blocked=async()=>new Response('forbidden',{status:403});
  assert.deepEqual(await lookupReference({type:'title',url:'https://example.org/restricted'},blocked),
    {found:false,reference:{url:'https://example.org/restricted',title:'example.org',kind:'link'}});
});
test('public HTML and RSS show optional reference labels and Hacker News icon',()=>{
  const item={id:'1',slug:'story',title:'文章',url:'https://example.org',status:3,
    status_at:'2026-11-12',tags:[],references:[
      {url:'https://news.ycombinator.com/item?id=123',title:'Discussion topic',kind:'hacker-news'},
      {url:'https://example.net/extended',title:'延伸閱讀',kind:'link'}
    ]};
  const html=bookmarkArticleHtml(item);
  assert.match(html,/Hacker News 留言/);
  assert.match(html,/news.ycombinator.com\/favicon.ico/);
  assert.match(html,/延伸閱讀/);
  assert.match(html,/noopener noreferrer/);
  assert.ok(!bookmarkArticleHtml({...item,references:[]}).includes('延伸參考網址'));
  assert.match(rss([item],'https://christorng.idv.tw'),/Hacker News 留言/);
});
