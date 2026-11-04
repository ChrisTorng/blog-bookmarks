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
- **Tampermonkey 安裝與更新**：直接開啟 [Blog Bookmarks.user.js](https://raw.githubusercontent.com/ChrisTorng/blog-bookmarks/main/tampermonkey/BlogBookmarks.user.js)，使用 Tampermonkey 安裝。腳本 metadata 的 `@updateURL` 與 `@downloadURL` 均指向這個 Raw URL。
- 目前只在 `hackernews.betacat.io` 注入；名稱與資料結構均為通用設計，其他來源可逐步追加。
- **英文原始標題**：TM 於 `document-start` 即監聽文章 DOM、以 URL 暫存初始英文標題，並於頁面載入時向 BetaCat **僅請求一次**原始 HTML 作為備援。按星號時直接讀取記憶體，不會重新下載、等待或抓目標文章；其 `@connect` 僅允許 `christorng.idv.tw`。
- 若文章清單未提供英文標題，Cloudflare Worker 在新增書籤成功後透過 `waitUntil` 嘗試補抓原始出版網站的 HTML metadata，失敗保持原值；不會因遠端網站阻擋、登入或驗證而影響收藏。此流程不會變更原始 URL、Redirect 規則或已存在書籤；不需要 D1 Migration。
- 使用前於後台登入後按「產生 Tampermonkey Token」，複製一次性 Token，並在 BetaCat 頁面右下角的 **Bookmarks 設定** 貼入。
- 後台預設未讀；點原文後保留待決策項目，勾公開／推薦會即時儲存，按「完成，下一筆」才移出目前清單。若不分享，按「保留私人・完成」。
- 公開列表使用公開或推薦的設定時間；原始加入時間仍保留供後台管理。

- Public pages use the main site's /notes-shell/. Worker pages require full-page navigation.

## Checks and deployment

```powershell
npm run check
```

`npm run build:ui` embeds public/bookmarks/admin.js and admin.css in src/ui-assets.js; dev and deploy run it automatically. Commit the generated file when changing the UI.

Production Worker and D1: blog-bookmarks; routes and Access settings: wrangler.jsonc. Admin pages/API require Cloudflare Access; ACCESS_ALLOWED_EMAIL is a Worker secret. Deploy with `npm run deploy`; apply new production migrations separately with `npx wrangler d1 migrations apply DB --remote`.
