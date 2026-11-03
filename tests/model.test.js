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
