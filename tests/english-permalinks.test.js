import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {englishSlug,translatedBookmarkSlug} from '../src/slug.js';
import {rss} from '../src/feeds.js';

test('new Chinese-only bookmarks translate to English rather than Pinyin',async()=>{
  let calls=0;
  const ai={async run(name,input){
    calls++;
    assert.equal(name,'@cf/google/gemma-4-26b-a4b-it');
    assert.match(input.messages[1].content,/Unicode/);
    return {choices:[{message:{content:'Domain Hacks with Unusual Unicode Characters (2018)'}}]};
  }};
  assert.equal(await translatedBookmarkSlug('使用 Unicode 異常字元的網域破解（2018）',ai),
    'domain-hacks-with-unusual-unicode-characters-2018');
  assert.equal(await translatedBookmarkSlug('Domain hacks with unusual Unicode characters (2018)',ai),
    'domain-hacks-with-unusual-unicode-characters-2018');
  assert.equal(calls,1,'English title does not require AI');
  assert.equal(englishSlug('Café — Domain Tricks'),'cafe-domain-tricks');
  await assert.rejects(translatedBookmarkSlug('中文標題',null),/Workers AI/);
});

test('changing a bookmark permalink keeps its historical RSS GUID',()=>{
  const oldUrl='https://christorng.idv.tw/bookmarks/shi-yong-unicode-2018/';
  const item={id:'98cb0ffc-09c8-42b0-89e8-cb31d0f5e86a',
    slug:'domain-hacks-with-unusual-unicode-characters-2018',
    title:'使用 Unicode 異常字元的網域破解（2018）',
    title_original:'Domain hacks with unusual Unicode characters (2018)',
    url:'https://example.org/',summary:'Unicode domain names',
    rss_guid:oldUrl,status_at:'2026-11-04',tags:[]};
  const feed=rss([item],'https://christorng.idv.tw');
  assert.ok(feed.includes('<link>https://christorng.idv.tw/bookmarks/'+item.slug+'/</link>'));
  assert.ok(feed.includes('<guid isPermaLink="true">'+oldUrl+'</guid>'));
});

test('old Pinyin bookmark URL redirects to the English canonical URL',async()=>{
  const oldSlug='shi-yong-unicode-yi-chang-zi-yuan-de-wang-yu-po-jie-2018';
  const newSlug='domain-hacks-with-unusual-unicode-characters-2018';
  const db={prepare(sql){return {bind(){
    return {async all(){
      assert.match(sql,/FROM article_reading/);return {results:[]};
    },async first(){
      if(!sql.includes('bookmark_slug_redirects'))return null;
      return {id:'98cb0ffc-09c8-42b0-89e8-cb31d0f5e86a',
        slug:newSlug,url:'https://example.org/',status:4,
        title:'Unicode domains',title_original:'Domain hacks',
        summary:'Example',tags:'[]',reference_links:'[]',
        created_at:'2026-11-04T00:00:00Z',stage:4};
    }};
  }}}};
  const r=await worker.fetch(new Request('https://example.org/bookmarks/'+oldSlug+'/'),{DB:db},{});
  assert.equal(r.status,308);
  assert.equal(r.headers.get('location'),'https://example.org/bookmarks/'+newSlug+'/');
});
