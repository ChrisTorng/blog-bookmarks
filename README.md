# blog-bookmarks

Personal bookmark collection for <https://christorng.idv.tw/bookmarks/>. Cloudflare Worker + D1; manager at /bookmarks/admin/.

## Local development

From ../christorng.github.io, run `npm run start:all` to open all five services in separate terminal tabs. See the [main README](../christorng.github.io/README.md) for service relationships and troubleshooting.

To run only Bookmarks after setup:

```powershell
npm run db:migrate
npm run dev
```

The Worker listens on 127.0.0.1:8788. Browse through http://localhost:3000/bookmarks/ or /bookmarks/admin/; the main site supplies the public page shell. Sign in with LOCAL_ADMIN_TOKEN from .dev.vars. Local data lives in .wrangler/state/.

For manual first-time setup: run `npm ci`, copy .dev.vars.example to .dev.vars, and replace the token placeholder with a random value. Preserve an existing .dev.vars. The main launcher handles setup and token generation automatically.

## Behavior and integration

- States: 0 unread/private, 1 read/private, 2 public, 3 recommended/public.
- New bookmarks are private. URLs are deduplicated; fragments are ignored.
- Public RSS: /bookmarks/feed.xml. Tags and database are independent of Notes.
- **Write note** opens the Notes editor with a bookmark reference. Notes must also be running.
- The manager generates a separate Tampermonkey ingest token. The userscript is under tampermonkey/; this token is distinct from the local admin token.
- Public pages use the main site's /notes-shell/. Worker pages require full-page navigation.

## Checks and deployment

```powershell
npm run check
```

`npm run build:ui` embeds public/bookmarks/admin.js and admin.css in src/ui-assets.js; dev and deploy run it automatically. Commit the generated file when changing the UI.

Production Worker and D1: blog-bookmarks; routes and Access settings: wrangler.jsonc. Admin pages/API require Cloudflare Access; ACCESS_ALLOWED_EMAIL is a Worker secret. Deploy with `npm run deploy`; apply new production migrations separately with `npx wrangler d1 migrations apply DB --remote`.
