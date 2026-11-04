import test from 'node:test';
import assert from 'node:assert/strict';
import { preferredRedirect,primaryUrl } from '../src/redirect.js';
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
