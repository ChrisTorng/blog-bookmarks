// Keep this table aligned with the active rules in TampermonkeyScripts/src/RedirectUrls.user.js.
// This is the expected destination, not a guarantee that a mirror is currently available.
// @match host lists as of TampermonkeyScripts main, 2026-11-05.
// InternetArchive.user.js intentionally includes the ArchiveToday domains.
// When both extensions are enabled the actual winner may depend on execution order.
export const ARCHIVE_TODAY_HOSTS = new Set([
  'www.404media.co',
  'www.bloomberg.com',
  'www.economist.com',
  'www.ft.com',
  'www.nature.com',
  'www.newscientist.com',
  'www.newyorker.com',
  'www.nytimes.com',
  'www.theatlantic.com',
  'www.wired.com',
  'www.wsj.com'
]);
export const INTERNET_ARCHIVE_HOSTS = new Set([
  'fortune.com',
  'nautil.us',
  'www.australiangeographic.com.au',
  'www.bbc.com',
  'www.cnbc.com',
  'www.lrb.co.uk',
  'www.scientificamerican.com',
  'www.rawstory.com',
  'www.scmp.com',
  'www.smh.com.au',
  'www.thetimes.com',
  'www.theverge.com',
  'www.washingtonpost.com',
  'www.404media.co',
  'www.bloomberg.com',
  'www.economist.com',
  'www.ft.com',
  'www.nature.com',
  'www.newscientist.com',
  'www.newyorker.com',
  'www.nytimes.com',
  'www.theatlantic.com',
  'www.wired.com',
  'www.wsj.com'
]);

export function preferredRedirect(input) {
  const url = new URL(input);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:') return null; // All @match URL navigation rules use HTTPS.
  const post = url.pathname.match(/^\/([^/]+)\/status\/(\d+)(?:\/|$)/);
  if (['x.com','twitter.com'].includes(host) && post)
    return 'https://nitter.tiekoetter.com/' + post[1] + '/status/' + post[2];
  if (host === 'old.reddit.com') {
    url.hostname = 'www.reddit.com';
    return url.href;
  }
  if (host === 'www.reddit.com' && /^\/login\/?$/.test(url.pathname) &&
      url.searchParams.get('reason') === 'lor2') {
    try {
      const target = new URL(url.searchParams.get('dest'));
      if (target.protocol === 'https:' && target.hostname === 'old.reddit.com' &&
          !target.username && !target.password && !target.port) {
        target.hostname = 'www.reddit.com';
        return target.href;
      }
    } catch {}
  }
  if (host === 'github.com' && url.searchParams.has('tab') &&
      url.searchParams.get('tab') === 'readme-ov-file') {
    url.searchParams.delete('tab');
    return url.href;
  }
  if (host === 'arxiv.org' && /^\/(abs|pdf)\//.test(url.pathname)) {
    const id = url.pathname.replace(/^\/(abs|pdf)\//, '').replace(/\.pdf$/,'');
    if (id) return 'https://arxiv.org/html/' + id;
  }

  // Match only the hosts explicitly listed by the enabled source scripts.
  if (url.protocol === 'https:' && INTERNET_ARCHIVE_HOSTS.has(host))
    return 'https://web.archive.org/' + url.href;
  if (url.protocol === 'https:' && ARCHIVE_TODAY_HOSTS.has(host))
    return 'https://archive.is/submit/?url=' + url.href;
  return null;
}
export const primaryUrl = item => item.redirect_url || preferredRedirect(item.url) || item.url;
