# Tampermonkey 重導向規則盤點（2026-11-05）

資料來源：`ChrisTorng/TampermonkeyScripts` 的 `src/` 25 個檔案。本文件記錄**實際自動導航**與**使用者手動操作**的差別。當腳本更新或設定停用時，需要重新檢查規則。

## 自動重導向

### 1. RedirectUrls.user.js

| 來源 | 目的地 | 條件 |
| --- | --- | --- |
| `x.com/<user>/status/<id>`、`twitter.com/<user>/status/<id>` | `nitter.tiekoetter.com/<user>/status/<id>` | 首次前往；返回原始歷史紀錄時不再轉址。第一鏡像失效後，箭頭可手動切 `nitter.meowing.monster` 或回 X；`xnologin.com`、`shitter.thepixora.com` 也是已知檢視網域 |
| `old.reddit.com/*` | `www.reddit.com/*` | 轉換主機名稱，保留路徑及查詢參數 |
| `www.reddit.com/login?reason=lor2&dest=<old.reddit.com URL>` | 對應 `www.reddit.com/*` | 只有符合指定的登入恢復格式 |
| `github.com/*?tab=readme-ov-file` | 同網址移除指定參數 | 保留其他參數 |
| `arxiv.org/abs/<id>`、`arxiv.org/pdf/<id>` | `arxiv.org/html/<id>` | PDF 路徑移除末尾 `.pdf` |

### 2. InternetArchive.user.js

匹配 HTTPS 網域時自動呼叫 `location.replace('https://web.archive.org/' + 原始網址)`。
13 個原有網域：

- `fortune.com`、`nautil.us`、`www.australiangeographic.com.au`
- `www.bbc.com`、`www.cnbc.com`、`www.lrb.co.uk`
- `www.scientificamerican.com`、`www.rawstory.com`、`www.scmp.com`、`www.smh.com.au`
- `www.thetimes.com`、`www.theverge.com`、`www.washingtonpost.com`

另外原先重疊的 11 個網域已於 2026-11-05 **完全移除有效 @match**，由 ArchiveToday.user.js 獨家處理；本腳本仍支援 Wayback 頁內手動切換 Archive Today。

### 3. ArchiveToday.user.js

11 個 HTTPS 網域，一律轉 `https://archive.is/submit/?url=<URL 編碼後原始網址>`：

- `www.404media.co`、`www.bloomberg.com`、`www.economist.com`
- `www.ft.com`、`www.nature.com`、`www.newscientist.com`
- `www.newyorker.com`、`www.nytimes.com`
- `www.theatlantic.com`、`www.wired.com`、`www.wsj.com`

使用者 2026-11-05 逐項測試 11 筆文章，**11 筆全部到 Archive Today（a）**；已移除 InternetArchive.user.js 的重疊匹配，更新 Bookmarks 優先規則。

所有文章均透過 `/submit/?url=` 交給 Archive Today 決定後續快照或驗證，**沒有任何單篇文章固定快照對應**。

兩支 archive 腳本加入 `@run-at document-start`，減少先顯示原站再跳轉；但瀏覽器的初始 HTTP 請求可能已送出，不能保證完全不發生原站網路連線。RedirectUrls.user.js 已使用 document-start；X/Twitter 特定分支為保留正常 Back/Forward 歷史順序，仍有意等待原始頁面 load 完成。

## 非自動重導向

- `AllGoInternetArchive.user.js`：按下浮動箭頭後才前往 Wayback / Archive Today，不能無條件替每筆書籤改目標。
- `InternetArchive.user.js` 在 Wayback 站內的右箭頭：**手動**前往 Archive Today 備援。
- `RedirectUrls.user.js` 在 X 檢視站的箭頭：**手動**切換鏡像或返回原始網址。
- `GoogleTranslate.user.js`：快捷鍵觸發翻譯網域來回切換，並非網站打開時就自動重導。
- `Medium.user.js`：同 URL 重新載入一次。
- `AutoOpenNewArticles.user.js`：在條件下加入 `_tmr` 重新整理原頁；文章開新分頁不是重導向。
- `ArticlesExternalNewTab.user.js`：外部文章在背景新分頁開啟，並不改原始目標。
- `ForceMobileView.user.js`、`ForceDarkMode.user.js` 等：重整畫面而非重導向。

其餘腳本處理顯示、翻譯、互動、浮動選單、留言或工具列，不會自動改變文章目的地。

## Bookmarks 規則

- `url` / `normalized_url` 是**原始網址**，不可因推導出的優先重導向而覆寫。
- `redirect_url` 代表使用者設定、當時已知的目的地，或上述**推導候選**，且在後台可編輯。
- `preferred_url` 優先採用 `redirect_url`，否則套用已知規則，再回退原始網址；唯一例外是**舊版自動產生的精確 Wayback 重疊網址**，會自動改用現行 Archive Today 規則，人工指定的其他網址不變。
- 不宣稱已驗證候選網址可用或是 archive 的永久快照；使用者可在後台改為確定可用的快照連結。
- 即使原文標題未能取得，也不把英文標題填入 `title_zh` 假裝成中文翻譯。
- 後續若要區分多個啟用狀態，可加入使用者個別規則優先權設定，而不應依任意檔名順序假設瀏覽器實際導向。

## 快照政策

維持 `/submit/?url=` 原有流程，不指定任何固定快照 ID，也不預設使用未確認可靠性的 `/newest/`。
