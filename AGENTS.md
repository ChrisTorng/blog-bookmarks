# Public Site And RSS Contract

This is the data/API/RSS backend for **blog-bookmarks**. The public website layout is owned by [ChrisTorng/christorng.github.io](https://github.com/ChrisTorng/christorng.github.io), particularly `components/bookmarks`, `components/notes` and `components/ListWithCategories.tsx`. Do not create a separate public visual design here. The Worker handles `/bookmarks/api/*` and `/bookmarks/feed.xml`; administrative UI is exempt from public visual parity.

## Cross-repository consistency

- Before changing any public presentation, route, title, category, RSS convention or feed content, check the main site and [blog-notes](https://github.com/ChrisTorng/blog-notes) for their corresponding behavior and update all affected repositories together.
- Public desktop/mobile header, category sidebar and mobile selector, typography, spacing, colors, links, responsive breakpoints, accessible labels and item cards must use the main site's conventions. Inspect both desktop and narrow-screen layouts.
- On a list page, the visible heading is `書籤` or `{category} · 書籤`. The root category option is `所有書籤`; the visible RSS link is `所有書籤 RSS` or `{category} · 書籤 RSS`. The feed's XML channel title adds ` | ChrisTorng 學習天地` after the visible RSS label, matching the site's HTML document-title separator.
- RSS `<item><link>` points to the actual *public local bookmark detail page* (`/bookmarks/view/?id=...`) to make the reader's “View article” action open this site. The RSS item content separately includes a hyperlink on the Chinese article title to the original/selected source URL, the English/original title if distinct, and the description. Escape all XML and HTML. Keep GUID identifiers stable across changes.
- Public API dates are Taiwan-local calendar dates, intentionally excluding private processing/reading time. Feed pubDates may use deterministic monotonic synthetic seconds for same-day order, **not** real private timestamps; never claim synthetic seconds are true posting times. Keep newest-first feed order and check stability when new bookmarks arrive.

Do not alter the appearance of public pages in `src/views.js` in isolation; the deployed static public views come from the main site repository. Update this instruction when ownership changes.
