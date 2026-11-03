# 驗證項目

- CloudMark 來源與新 D1 資料逐筆比對：126/126，一致，全部私人。
- 書籤公開清單只包含 status >= 2。
- 管理 API 需要 Cloudflare Access JWT，Tampermonkey 新增端點使用獨立 Token。
- 管理清單預設未讀，點擊原網頁後保留當前項目，方便回來決定公開。
- 本機主站顯示書籤導覽，正式主站不顯示。
- 新服務不刪除或更新 CloudMark。
