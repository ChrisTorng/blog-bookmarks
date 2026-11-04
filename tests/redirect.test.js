import test from 'node:test';
import assert from 'node:assert/strict';
import { preferredRedirect,primaryUrl,ARCHIVE_TODAY_HOSTS,INTERNET_ARCHIVE_HOSTS,KNOWN_ARCHIVE_SNAPSHOTS,correctLegacyRedirect } from '../src/redirect.js';
import { validate } from '../src/data.js';

test('redirects agree with deterministic RedirectUrls rules',()=>{
 assert.equal(preferredRedirect('https://x.com/person/status/123?foo=bar'),'https://nitter.tiekoetter.com/person/status/123');
 assert.equal(preferredRedirect('https://old.reddit.com/r/javascript/?sort=hot'),'https://www.reddit.com/r/javascript/?sort=hot');
 assert.equal(preferredRedirect('https://github.com/user/repo?tab=readme-ov-file'),'https://github.com/user/repo');
 assert.equal(preferredRedirect('https://arxiv.org/pdf/2411.01234.pdf'),'https://arxiv.org/html/2411.01234');
 assert.equal(preferredRedirect('https://example.com/path'),null);
});
test('preferred URL uses explicit redirect over fallback, then source',()=>{
 assert.equal(primaryUrl({url:'https://x.com/a/status/7',redirect_url:'https://nitter.meowing.monster/a/status/7'}),'https://nitter.meowing.monster/a/status/7');
 assert.equal(primaryUrl({url:'https://example.com',redirect_url:null}),'https://example.com');
});
test('validate saves both title languages and both URLs',()=>{
 const b=validate({url:'https://x.com/a/status/7',title:'一篇文章',title_zh:'一篇文章',title_original:'An article',tags:['AI']});
 assert.equal(b.redirect_url,'https://nitter.tiekoetter.com/a/status/7');
 assert.equal(b.title_original,'An article');
 assert.equal(b.title_zh,'一篇文章');
 assert.deepEqual(b.tags,['AI']);
 assert.throws(()=>validate({url:'https://example.com',redirect_url:'javascript:alert(1)'}));
});

test('archival redirects cover all @match domains from both userscripts',()=>{
 assert.equal(ARCHIVE_TODAY_HOSTS.size,11);
 assert.equal(INTERNET_ARCHIVE_HOSTS.size,13);
 for(const host of ARCHIVE_TODAY_HOSTS) {
   assert.ok(!INTERNET_ARCHIVE_HOSTS.has(host),'Collision should be resolved for '+host);
   assert.equal(preferredRedirect('https://'+host+'/story?x=1'),'https://archive.is/submit/?url='+encodeURIComponent('https://'+host+'/story?x=1'));
 }
 const onlyIA=[
   'fortune.com','nautil.us','www.australiangeographic.com.au','www.bbc.com',
   'www.cnbc.com','www.lrb.co.uk','www.scientificamerican.com','www.rawstory.com',
   'www.scmp.com','www.smh.com.au','www.thetimes.com','www.theverge.com',
   'www.washingtonpost.com'
 ];
 for(const host of onlyIA)
   assert.equal(preferredRedirect('https://'+host+'/a'),'https://web.archive.org/https://'+host+'/a');
 assert.equal(preferredRedirect('https://www.bbc.co.uk/a'),null);
 assert.equal(preferredRedirect('http://www.bbc.com/a'),null);
 assert.equal(preferredRedirect('https://web.archive.org/https://www.bbc.com/a'),null);
});

test('English-only title stays original; Chinese title is stored only when available',()=>{
 const english=validate({url:'https://example.org/a',title:'Original English title',title_zh:null,title_original:'Original English title'});
 assert.equal(english.title,'Original English title');
 assert.equal(english.title_zh,null);
 assert.equal(english.title_original,'Original English title');
 const translated=validate({url:'https://example.org/b',title:'繁體中文標題',title_original:'English headline'});
 assert.equal(translated.title_zh,'繁體中文標題');
 assert.equal(translated.title_original,'English headline');
});

test('exact verified snapshot links and already saved old Wayback redirects are corrected',()=>{
 const originals=["https://www.404media.co/anyone-can-push-updates-to-the-doge-gov-website-2/","https://www.theatlantic.com/magazine/archive/2025/02/american-loneliness-personality-politics/681091/","https://www.wsj.com/world/dozens-feared-dead-in-crash-after-passenger-flight-diverts-from-russia-fb2cdf2c"];
 const snapshots=["https://archive.ph/wy1Wt","https://archive.is/20250108154250/https://www.theatlantic.com/magazine/archive/2025/02/american-loneliness-personality-politics/681091","https://archive.is/T0atg"];
 originals.forEach((original,i)=>{
   assert.equal(KNOWN_ARCHIVE_SNAPSHOTS.get(original),snapshots[i]);
   assert.equal(preferredRedirect(original),snapshots[i]);
   assert.equal(primaryUrl({url:original,redirect_url:'https://web.archive.org/'+original}),snapshots[i]);
 });
 assert.equal(correctLegacyRedirect(originals[0],'https://custom.example/a'),'https://custom.example/a');
});
