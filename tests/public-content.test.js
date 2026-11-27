import test from 'node:test'
import assert from 'node:assert/strict'
import { bookmarkArticleHtml, renderSummary } from '../src/public-content.js'
import { rss } from '../src/feeds.js'
import { rssPreviewHtml } from '../src/rss-image.js'

const categories=[{id:'tech',name:'Tech',name_zh:'科技',count:1}]
const item={
  id:'7b746260-8314-48ac-87f1-541426562c35',
  slug:'my-psychophysics-as-a-bilateral-cochlear-implant-user',
  title:'我作為雙側人工電子耳使用者的心理物理學',
  title_original:'My psychophysics as a bilateral cochlear implant user',
  url:'https://claude.ai/artifact/abc',
  status:4,status_at:'2026-11-07',tags:['Tech'],
  summary:'[Hacker news 討論](https://news.ycombinator.com/item?id=50381033)\n\n**重點**與 ![小圖](https://example.org/image.png)\n\n<script>alert(1)</script>'
}

test('same full HTML is embedded in both public permalink and RSS, never unparsed Markdown',()=>{
  const html=bookmarkArticleHtml(item,categories)
  const feed=rss([item],'https://christorng.idv.tw','','',categories)
  assert.ok(html.includes('<a href="https://news.ycombinator.com/item?id=50381033">Hacker news 討論</a>'))
  assert.ok(html.includes('<strong>重點</strong>'))
  assert.ok(html.includes('<img src="https://example.org/image.png" alt="小圖"'))
  assert.ok(html.includes('My psychophysics as a bilateral cochlear implant user'))
  assert.ok(html.includes('claude.ai/artifact'))
  assert.ok(html.includes('#科技'))
  assert.ok(html.includes('☆ 推薦'))
  assert.ok(html.includes('&nbsp;<span class="min-w-0 truncate">'))
  assert.ok(!html.includes('<script>'))
  assert.ok(!html.includes('[Hacker news 討論]('))
  assert.ok(feed.includes('<content:encoded><![CDATA['+html+']]></content:encoded>'))
  assert.ok(feed.includes('<category>科技</category>'))
  const withReference=bookmarkArticleHtml({...item,tags:['Tech','Tech']},categories,'<article><h2>隨筆內容</h2></article>','/bookmarks/'+item.slug+'/')
  assert.match(withReference, /<hr><p><strong>引用隨筆<\/strong><\/p>/)
  assert.match(withReference, /<p class="mt-2 text-xs"><a[^>]+>書籤永久連結<\/a><\/p>/)
  assert.match(withReference, /#科技<\/a> <a[^>]+>#科技<\/a>/)
  assert.ok(feed.includes('/bookmarks/'+item.slug+'/'))
  assert.ok(feed.includes('&lt;article'))
})

test('unsafe Markdown cannot inject scripts or javascript links into public HTML',()=>{
  const html=renderSummary('[bad](javascript:alert(1)) <img src=x onerror=alert(1)>','https://example.org/')
  assert.doesNotMatch(html, /<img src=x|href="javascript:/)
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
})

test('external relative Markdown links resolve relative to bookmarked source',()=>{
  assert.ok(renderSummary('[read](/blog/post)','https://example.org/parent').includes('href="https://example.org/blog/post"'))
})

test('remote thumbnail appears once in permalink, RSS and embedded HTML; mobile follows title',()=>{
  const withImage={...item,image_url:'https://hackernews.betacat.io/image/sample.webp'};
  const html=bookmarkArticleHtml(withImage,categories);
  const rssXml=rss([withImage],'https://christorng.idv.tw','','',categories);
  assert.match(html, /src="https:\/\/hackernews\.betacat\.io\/image\/sample\.webp"/);
  assert.match(html, /md:grid-cols-\[minmax\(0,1fr\)_11rem\]/);
  assert.ok(html.indexOf('<h1') < html.indexOf('sample.webp'));
  assert.ok(html.indexOf('sample.webp') < html.indexOf('my-2 text-gray-700'));
  assert.ok(rssXml.includes('<content:encoded><![CDATA['+rssPreviewHtml(html,'https://christorng.idv.tw')+']]></content:encoded>'));
  assert.doesNotMatch(rssXml,/sample\.webp/);
  assert.match(rssXml,/https:\/\/christorng\.idv\.tw\/bookmarks\/rss-image\//);
  assert.equal((html.match(/sample\.webp/g)||[]).length,1);
  assert.doesNotMatch(bookmarkArticleHtml({...item,image_url:null},categories),/md:grid-cols-|sample.webp/);
  assert.doesNotMatch(bookmarkArticleHtml({...item,image_url:'javascript:alert(1)'},categories),/javascript:alert/);
});


test('public page admin action opens the exact bookmark; RSS and embedded defaults omit it',()=>{
  const html=bookmarkArticleHtml(item,categories,'','',true);
  assert.ok(html.includes('href="/bookmarks/admin/?edit='+item.id+'"'));
  assert.ok(html.includes('後台管理'));
  assert.ok(!bookmarkArticleHtml(item,categories).includes('/bookmarks/admin/'));
  assert.ok(!rss([item],'https://christorng.idv.tw','','',categories).includes('/bookmarks/admin/'));
});
