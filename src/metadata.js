// Fetch article titles in the Worker, never in a user's browser.
// The caller has already authenticated using the ingest token.
const MAX_HTML_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 3500;
const MAX_REDIRECTS = 3;

const BLOCKED_DOMAINS = new Set([
  'archive.is', 'archive.ph', 'archive.today', 'web.archive.org',
  'translate.goog', 'nitter.tiekoetter.com', 'nitter.meowing.monster',
  'xnologin.com', 'shitter.thepixora.com',
  'christorng.idv.tw'
]);
const NON_PUBLIC_SUFFIXES = [
  '.localhost', '.local', '.internal', '.test', '.invalid',
  '.home.arpa', '.onion'
];

export function safePublisherUrl(input) {
  const url = new URL(input);
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!['https:', 'http:'].includes(url.protocol) ||
      url.username || url.password || url.port ||
      !host.includes('.') || host.startsWith('[') ||
      /^\d+(?:\.\d+){3}$/.test(host) ||
      host === 'localhost' ||
      NON_PUBLIC_SUFFIXES.some(suffix => host.endsWith(suffix)) ||
      BLOCKED_DOMAINS.has(host) ||
      url.href.length > 4096) return null;
  // Hostnames using numeric IPv4 aliases are normalized to dotted IPs by URL().
  return url;
}

function decodeEntities(s) {
  const named = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
    nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
    lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
    copy: '©', reg: '®', trade: '™'
  };
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] !== '#') return named[entity.toLowerCase()] ?? match;
    const hex = entity[1]?.toLowerCase() === 'x';
    const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
      ? String.fromCodePoint(code) : match;
  });
}

function cleanTitle(raw) {
  const title = decodeEntities(String(raw ?? '')).replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!title || /^(?:access denied|just a moment|attention required|please enable javascript|please enable cookies|forbidden|403 forbidden|sign in|log in|captcha)(?:[.!?… ]|$)/i.test(title))
    return null;
  return title;
}

export function parsePublisherTitle(html) {
  if (typeof html !== 'string' || !/<(?:html|head|title|meta)\b/i.test(html.slice(0, 12000)))
    return null;
  const meta = new Map();
  for (const match of html.matchAll(/<meta\b[^>]{0,4000}>/gi)) {
    const attributes = new Map();
    for (const attr of match[0].matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))
      attributes.set(attr[1].toLowerCase(), attr[2] ?? attr[3] ?? attr[4]);
    const key = (attributes.get('property') || attributes.get('name') || '').toLowerCase();
    if (!meta.has(key)) meta.set(key, attributes.get('content'));
  }
  const htmlTitle = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1];
  return cleanTitle(meta.get('og:title')) ||
    cleanTitle(meta.get('twitter:title')) ||
    cleanTitle(htmlTitle);
}

async function readHtmlPrefix(response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '', remaining = MAX_HTML_BYTES;
  try {
    while (remaining > 0) {
      const {done, value} = await reader.read();
      if (done) break;
      const bytes = value.subarray(0, remaining);
      text += decoder.decode(bytes, {stream: true});
      remaining -= bytes.length;
      if (bytes.length !== value.length) break;
    }
    return text + decoder.decode();
  } finally {
    try { await reader.cancel(); } catch {}
  }
}

export async function fetchPublisherTitle(sourceUrl, fetcher = fetch) {
  let url;
  try { url = safePublisherUrl(sourceUrl); } catch { return null; }
  if (!url) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    for (let hops = 0; hops <= MAX_REDIRECTS; hops++) {
      const response = await fetcher(url.href, {
        method: 'GET',
        redirect: 'manual',
        headers: {Accept: 'text/html,application/xhtml+xml;q=0.9'},
        signal: controller.signal
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        const next = location && safePublisherUrl(new URL(location, url).href);
        if (!next) return null;
        try { await response.body?.cancel(); } catch {}
        url = next;
        continue;
      }
      if (!response.ok) return null;
      const contentType = response.headers.get('content-type') || '';
      if (contentType && !/^(?:text\/html|application\/xhtml\+xml)\b/i.test(contentType))
        return null;
      return parsePublisherTitle(await readHtmlPrefix(response));
    }
  } catch {
    // A blocked publisher or failed network request must not prevent saving.
  } finally {
    clearTimeout(timer);
  }
  return null;
}
