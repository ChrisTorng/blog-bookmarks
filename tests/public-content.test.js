import test from 'node:test'
import assert from 'node:assert/strict'
import { bookmarkArticleHtml, renderSummary } from '../src/public-content.js'
import { rss } from '../src/feeds.js'

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
  assert.ok(!html.includes('<script>'))
  assert.ok(!html.includes('[Hacker news 討論]('))
  assert.ok(feed.includes('<content:encoded><![CDATA['+html+']]></content:encoded>'))
  assert.ok(feed.includes('<category>科技</category>'))
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
