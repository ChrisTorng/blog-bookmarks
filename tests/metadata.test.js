import test from 'node:test';
import assert from 'node:assert/strict';
import {invalidSummary,metadata,sameArticle,hnExact,review} from '../src/metadata.js';

test('rejects bot challenge and access-denied summaries',()=>{
  assert.equal(invalidSummary('抱歉'),true);
  assert.equal(invalidSummary('如需協助，請造訪 help.ft.com。對於造成的不便，我們深感抱歉。'),true);
  assert.equal(invalidSummary('請確保您的瀏覽器支援 JavaScript 和 Cookies'),true);
  assert.equal(invalidSummary('本文介紹了全球各地新建資料中心的反對聲浪與公投結果。'),false);
});
test('extracts original page metadata',()=>{
  const page='<html><head><meta property="og:title" content="Research Results"><meta name="description" content="Real scientific discovery"><title>Fallback</title></head></html>';
  assert.deepEqual(metadata(page),{title:'Research Results',description:'Real scientific discovery',originalUrl:''});
});
test('matches exact URL, including query identifiers',()=>{
  assert.equal(sameArticle('https://news.ycombinator.com/item?id=123','https://news.ycombinator.com/item?id=456'),false);
  assert.equal(sameArticle('https://example.com/a/','https://example.com/a'),true);
});
test('rejects similar HN URLs and accepts exact matches',async()=>{
  const fetcher=async()=>new Response(JSON.stringify({hits:[
    {url:'https://example.com/other',title:'Wrong one'},
    {url:'https://example.com/article',title:'Correct Original',objectID:'123'}
  ]}),{headers:{'Content-Type':'application/json'}});
  assert.deepEqual(await hnExact('https://example.com/article',fetcher),{title:'Correct Original',source:'hn-exact-url'});
});
test('unverifiable sources never invent original titles or replacement summaries',async()=>{
  const fetcher=async()=>new Response('Not Found',{status:404});
  const report=await review({url:'https://example.com/missing',summary:'抱歉',created_at:null},fetcher);
  assert.equal(report.verified,false);
  assert.equal(report.title_original,null);
  assert.equal(report.summary,null);
});

test('do not accept a different canonical article represented by og:url',async()=>{
  const {inspect}=await import('../src/metadata.js');
  const body='<meta property="og:title" content="Unrelated Article"><meta property="og:url" content="https://example.com/other">';
  const transport=async()=>new Response(body,{headers:{'Content-Type':'text/html'}});
  assert.equal(await inspect('https://example.com/real',transport),null);
});
test('BetaCat historical recovery requires the full exact article URL',async()=>{
  const {betaCatExact}=await import('../src/metadata.js');
  const page='<article><a class="post-url" href="https://example.com/other">Similar Name</a></article>'
    +'<article><a class="post-url" href="https://example.com/story?id=123">Original Source Headline</a></article>';
  const transport=async()=>new Response(page,{headers:{'Content-Type':'text/html'}});
  const matched=await betaCatExact({url:'https://example.com/story?id=123',created_at:'2026-11-04T02:00:00Z'},transport);
  assert.equal(matched.title,'Original Source Headline');
  const missing=await betaCatExact({url:'https://example.com/story?id=456',created_at:'2026-11-04T02:00:00Z'},transport);
  assert.equal(missing,null);
});
