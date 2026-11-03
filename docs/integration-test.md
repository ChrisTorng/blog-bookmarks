# 端到端測試

`npm run db:migrate` 套用本機 D1 migrations；`npm run test:integration` 會啟動本機 Wrangler、測試管理驗證、書籤新增／去重、狀態提升與撤回、RSS 只輸出公開內容、Token 產生與讀取，結束後停止測試 Worker。

GitHub Actions 在推送及 PR 時自動執行上述測試與 Wrangler dry-run。正式 D1 不受本機測試影響。
