import test from 'node:test';
import assert from 'node:assert/strict';
import {safeArticleUrl,articleText,fetchReadableArticle,autoReviewNewSummary} from '../src/auto-summary.js';

test('source fetching rejects local addresses and other unsafe URLs',()=>{
 assert.equal(safeArticleUrl('http://www.example.org/page'),null);
 assert.equal(safeArticleUrl('https://localhost/'),null);
 assert.equal(safeArticleUrl('https://127.0.0.1/data'),null);
 assert.equal(safeArticleUrl('https://example.com:8443/article'),null);
 assert.equal(safeArticleUrl('https://user:password@example.com/path'),null);
 assert.equal(safeArticleUrl('https://example.org/story'),'https://example.org/story');
});
test('HTML extraction excludes site navigation and JavaScript',()=>{
 const text=articleText('<html><body><nav>Navigation</nav><article><h1>Research</h1><p>This is the source.</p><script>not_a_source()</script></article></body></html>');
 assert.match(text,/Research/);
 assert.match(text,/This is the source/);
 assert.doesNotMatch(text,/Navigation|not_a_source/);
});
test('extractor refuses unrelated canonical URLs and tries verified alternative',async()=>{
 const item={url:'https://example.org/one',redirect_url:'https://example.org/two'};
 const urls=[];
 const text=await fetchReadableArticle(item,async url=>{
  urls.push(url);
  const desc=url.endsWith('/one')?'https://wrong.org/irrelevant':'https://example.org/two';
  return new Response('<html><head><meta property="og:url" content="'+desc+'"/></head><body><article>'+
   '<p>'+('This article documents concrete analysis of a software system and its implementation. ').repeat(12)+'</p>'+
   '</article></body></html>',{headers:{'content-type':'text/html'}});
 });
 assert.ok(text.length>450);
 assert.deepEqual(urls,['https://example.org/one','https://example.org/two']);
});
test('auto review clears blocking text when no valid article is available',async()=>{
 const writes=[];
 const original='請啟用 JS 並關閉任何廣告攔截器';
 const item={id:'a',url:'https://example.org/something',status:0,summary:original,title:'Test'};
 const env={DB:{
  prepare(sql){
   if(sql.includes('SELECT'))return {bind:()=>({first:async()=>({...item})})};
   return {bind:(...args)=>({run:async()=>{writes.push({sql,args});return {meta:{changes:1}};}})};
  }
 }};
 await autoReviewNewSummary(env,item,async()=>new Response('Blocked',{status:403}));
 assert.equal(writes.length,1);
 assert.equal(writes[0].args[0],'');
});
test('auto review does not change an edited or decided item',async()=>{
 const writes=[];
 const item={id:'b',url:'https://example.org/something',status:0,summary:'請啟用 JS 並關閉任何廣告攔截器',title:'Test'};
 const env={DB:{
  prepare(sql){
   if(sql.includes('SELECT'))return {bind:()=>({first:async()=>({...item,status:2})})};
   return {bind:()=>({run:async()=>{writes.push(sql);return {meta:{changes:1}};}})};
  }
 }};
 await autoReviewNewSummary(env,item,async()=>new Response('Blocked',{status:403}));
 assert.deepEqual(writes,[]);
});
