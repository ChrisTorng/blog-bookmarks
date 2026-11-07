import test from 'node:test'
import assert from 'node:assert/strict'
import { normalUrl, validate, esc } from '../src/data.js'
import { rss } from '../src/feeds.js'
import { sameToken, isAdmin } from '../src/auth.js'

test('URL normalization keeps queries and drops fragments',()=>{
 assert.equal(normalUrl('https://EXAMPLE.org:443/path?a=1#fragment'),'https://example.org/path?a=1')
})
test('disallow credentialed URLs and non-HTTP schemes',()=>{
 for(const url of ['javascript:alert(1)','file:///etc/passwd','https://a:b@example.org'])assert.throws(()=>normalUrl(url))
})
test('tag normalization preserves label but deduplicates case-insensitively',()=>{
 assert.deepEqual(validate({url:'https://example.org/',tags:['AI','ai','Science']}).tags,['AI','Science'])
})
test('escape untrusted source titles and summaries',()=>{
 assert.equal(esc('<img src=x onerror="x">'),'&lt;img src=x onerror=&quot;x&quot;&gt;')
})
test('RSS includes public entries only when caller supplies them',()=>{
 const xml=rss([{id:'f73fa443-c469-4e5b-8023-7f1bfb745ac4',title:'Sample <test>',url:'https://example.org/?a=1&b=2',summary:'Summary',published_at:'2026-11-03T00:00:00Z'}],'https://christorng.idv.tw')
 assert.match(xml,/Sample &lt;test&gt;/)
 assert.match(xml,/a=1&amp;b=2/)
 assert.match(xml,/\/bookmarks\//)
})
test('missing secret never grants write',async ()=>{
 assert.equal(await sameToken(undefined,undefined),false)
 assert.equal(await sameToken('different','a-correct-secret'),false)
 assert.equal(await isAdmin(new Request('http://localhost/bookmarks/admin'),{AUTH_MODE:'local'}),false)
})

test('public RSS opens the local bookmark and shows original source, English title and description', () => {
 const id = 'f73fa443-c469-4e5b-8023-7f1bfb745ac4'
 const xml = rss([{id, title:'中文 <標題>', title_original:'English title',url:'https://example.org/?a=1&b=2',summary:'說明 <測試>',status_at:'2026-11-07'}], 'https://christorng.idv.tw')
 assert.ok(xml.includes('<title>所有書籤 RSS | ChrisTorng 學習天地</title>'))
 assert.ok(xml.includes('<link>https://christorng.idv.tw/bookmarks/view/?id='+id+'</link>'))
 assert.ok(xml.includes('<guid isPermaLink="false">https://christorng.idv.tw/bookmarks/'+id+'/</guid>'))
 assert.ok(xml.includes('English title'))
 assert.ok(xml.includes('example.org/?a=1&amp;amp;b=2'))
 assert.ok(xml.includes('說明 &amp;lt;測試&amp;gt;'))
 assert.ok(xml.includes('<content:encoded>'))
})
test('same-day RSS items sort with descending unique synthetic seconds', () => {
 const items = ['3','2','1'].map(id => ({id,title:id,url:'https://example.org/'+id,status_at:'2026-11-07'}))
 const xml = rss(items, 'https://christorng.idv.tw', 'ai', '人工智慧')
 assert.ok(xml.includes('人工智慧 · 書籤 RSS | ChrisTorng 學習天地'))
 const dates = [...xml.matchAll(new RegExp('<pubDate>(.*?)</pubDate>', 'g'))].map(m => Date.parse(m[1]))
 assert.equal(dates.length, 3)
 assert.equal(dates[0]-dates[1], 1000)
 assert.equal(dates[1]-dates[2], 1000)
 assert.equal(new Date(dates[0]).toISOString(), '2026-11-06T16:00:03.000Z')
})
