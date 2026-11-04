import test from 'node:test';
import assert from 'node:assert/strict';
import {safePublisherUrl, parsePublisherTitle, fetchPublisherTitle} from '../src/metadata.js';

test('publisher URLs must be public HTTP(S) hostnames, not archives or local services', () => {
  assert.equal(safePublisherUrl('https://www.anthropic.com/research/provable-inference').hostname, 'www.anthropic.com');
  for (const url of [
    'http://localhost:8788/admin', 'http://127.0.0.1/private',
    'http://0x7f000001/', 'http://192.168.0.1/',
    'http://[::1]/', 'https://intranet.local/',
    'https://host.internal/', 'https://archive.is/abc',
    'https://web.archive.org/https://example.org',
    'https://christorng.idv.tw/bookmarks/admin/',
    'ftp://example.org/a', 'https://user:pass@example.org/'
  ]) assert.equal(safePublisherUrl(url), null, url);
});

test('parses original publisher metadata and decodes common HTML entities', () => {
  assert.equal(parsePublisherTitle('<html><head><meta property="og:title" content="Research &amp; Proof"></head></html>'),
    'Research & Proof');
  assert.equal(parsePublisherTitle("<html><title>Study &#x2014; author</title></html>"), 'Study — author');
  assert.equal(parsePublisherTitle('<html><meta name="twitter:title" content="Tweet title"><title>Default</title></html>'), 'Tweet title');
  assert.equal(parsePublisherTitle('<html><title>Just a moment...</title></html>'), null);
  assert.equal(parsePublisherTitle('<html><title>  A    title  </title></html>'), 'A title');
});

test('fetches publisher title from Worker without requiring browser cross-origin access', async () => {
  const calls = [];
  const fetched = await fetchPublisherTitle('https://www.anthropic.com/research/provable-inference', async (url, init) => {
    calls.push({url, init});
    return new Response('<html><head><meta property="og:title" content="Original article"></head></html>', {
      headers: {'Content-Type': 'text/html; charset=UTF-8'}
    });
  });
  assert.equal(fetched, 'Original article');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.redirect, 'manual');
});

test('rejects redirects into archive or private destinations', async () => {
  let count = 0;
  const title = await fetchPublisherTitle('https://example.org/post', async () => {
    count++;
    return new Response(null, {status: 302, headers: {Location: 'http://127.0.0.1/secrets'}});
  });
  assert.equal(title, null);
  assert.equal(count, 1);

  const redirected = await fetchPublisherTitle('https://example.org/post', async (url) => {
    if (url.endsWith('/post')) return new Response(null, {status: 301, headers: {Location: '/new-post'}});
    return new Response('<html><title>Final article</title></html>', {
      headers: {'Content-Type':'text/html'}
    });
  });
  assert.equal(redirected, 'Final article');
});

test('non-HTML and inaccessible responses never block bookmark insertion', async () => {
  assert.equal(await fetchPublisherTitle('https://example.org/a', async () =>
    new Response('binary', {headers: {'Content-Type': 'application/pdf'}})), null);
  assert.equal(await fetchPublisherTitle('https://example.org/a', async () => {
    throw new Error('Publisher blocks data center IP');
  }), null);
});
