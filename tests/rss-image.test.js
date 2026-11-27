import test from 'node:test';
import assert from 'node:assert/strict';
import {rssPreviewPath,rssPreviewHtml,rssImage} from '../src/rss-image.js';
import {bookmarkArticleHtml} from '../src/public-content.js';
import {rss} from '../src/feeds.js';
const id='12345678-1234-1234-1234-123456789abc', source='https://hackernews.betacat.io/image/123.webp', origin='https://example.com';
const item={id,slug:'example',url:'https://example.net/article',title:'Test',status:3,created_at:'2026-11-24',tags:[],image_url:source};
const path=rssPreviewPath(id,source);
test('public article retains original image; both RSS representations use the same absolute JPEG URL',()=>{
 const html=bookmarkArticleHtml(item);
 assert.ok(html.includes('src="'+source+'"'));
 assert.ok(html.includes('data-rss-preview="'+path+'"'));
 const feed=rss([item],origin);
 assert.equal(feed.split(origin+path).length-1,2);
 assert.ok(!feed.includes(source));
 assert.ok(feed.includes('https://www.google.com/s2/favicons?'));
 assert.ok(feed.includes('<guid isPermaLink="true">'+origin+'/bookmarks/example/'));
 assert.ok(!rssPreviewHtml(html,origin).includes('loading="lazy" decoding="async" referrerpolicy="no-referrer" class="max-h-40'));
 assert.notEqual(rssPreviewPath(id,source),rssPreviewPath(id,source+'?v=2'));
});
const db=(value)=>({prepare(sql){assert.match(sql,/stage>=3/);return {bind(key){assert.equal(key,id);return {first:async()=>value}}}}});
test('fixed JPEG transformation; no negotiation or arbitrary URL; reject non-JPEG responses',async()=>{
 const req=new Request(origin+path);
 let called=0;
 const response=await rssImage(req,db({image_url:source}),async(url,opts)=>{
  called++;assert.equal(url,source);assert.equal(opts.cf.image.format,'jpeg');assert.equal(opts.cf.image.width,640);assert.equal(opts.redirect,'manual');
  return new Response(new Uint8Array([255,216,255,217]),{headers:{'Content-Type':'image/jpeg','cf-resized':'ok'}});
 });
 assert.equal(called,1);assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'image/jpeg');
 assert.match(response.headers.get('Cache-Control'),/s-maxage=86400/);
 assert.equal((await rssImage(req,db({image_url:source+'?v=2'}),()=>{throw Error('unexpected fetch')})).status,404);
 assert.equal((await rssImage(req,db(null),()=>{throw Error('unexpected fetch')})).status,404);
 assert.equal((await rssImage(req,db({image_url:source}),async()=>new Response('not jpeg',{headers:{'Content-Type':'image/webp'}}))).status,502);
 assert.equal((await rssImage(new Request(origin+path+'?url=https://other.net'),db(null))).status,404);
});

test('tracking parameters redirect to the same canonical image without database work',async()=>{
 const {default:worker}=await import('../src/index.js');
 const env={DB:{prepare(){throw Error('unexpected database access')}}};
 for(const query of ['?utm_source=chatgpt.com','?utm_source=chatgpt.com&utm_medium=referral','?fbclid=123']){
  for(const method of ['GET','HEAD']){
   const result=await worker.fetch(new Request(origin+path+query,{method}),env,{});
   assert.equal(result.status,308);
   assert.equal(result.headers.get('Location'),origin+path);
  }
 }
 const result=await worker.fetch(new Request(origin+path+'?url=https://other.net'),env,{});
 assert.equal(result.status,404);
});
