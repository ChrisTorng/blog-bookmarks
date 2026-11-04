// Keep this table aligned with the active rules in TampermonkeyScripts/src/RedirectUrls.user.js.
// This is the expected destination, not a guarantee that a mirror is currently available.
export function preferredRedirect(input) {
  const url = new URL(input);
  const host = url.hostname.toLowerCase();
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
  return null;
}
export const primaryUrl = item => item.redirect_url || preferredRedirect(item.url) || item.url;
