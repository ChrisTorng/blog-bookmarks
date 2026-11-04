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
- 按星號儲存只使用已截取的文章標題與現有 DOM；Client 及 Worker 都不會在收藏後補抓 BetaCat 或目標文章。標題抓取失敗時使用目前顯示的標題備援，書籤仍可儲存；不會變更原始 URL、Redirect 規則或已存在書籤。不需要 D1 Migration。
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

## Metadata repair

Use the admin-only `POST /bookmarks/api/admin/enrich` endpoint with JSON `{ "id": "<bookmark UUID>" }` to preview verified source metadata. Include `"apply": true` to fill missing English titles or replace an invalid summary using a validated source description. Searches require matching source URLs; never substitute merely similar search results. This is separate from the Tampermonkey star-click path.

## 快速處理後台

- `/bookmarks/admin/quick/`：與既有完整管理後台並存，預設最近已決定 3 筆與待決定 3 筆，可切換 5+5 或 10+10；開頁定位第一筆待決定。
- 右側分類依使用頻率排序，可複選；公開與推薦強制至少一個分類（伺服器也驗證），不公開不需要分類。
- 待處理按加入時間由新至舊排序。處理後焦點移至下一筆，預載待處理項目補位，固定顯示剩餘待決定筆數。
- 快速處理只顯示中文標題、完整摘要與加入時間；點標題以新分頁開原文，既有搜尋、篩選、編輯仍在 `/bookmarks/admin/`。
- 不新增 Migration；舊資料的私藏已決定時間以 `updated_at` 近似，公開與推薦使用原本時間欄位。
