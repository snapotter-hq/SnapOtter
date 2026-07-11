---
description: "將 PDF 線性化以達成快速網頁檢視（漸進式下載）。"
i18n_source_hash: 36280b478161
i18n_provenance: human
i18n_output_hash: 3d00a009797d
---

# 網頁最佳化 PDF {#web-optimize-pdf}

將 PDF 線性化，使其能在網頁瀏覽器中漸進式下載並顯示，無需等待整個檔案下載完成。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/pdf/linearize-pdf`

接受包含 PDF 檔案的 multipart 表單資料。不需要 `settings` 欄位。

## 參數 {#parameters}

此工具沒有設定參數。直接上傳 PDF 檔案即可。

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/linearize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2460000
}
```

## 注意事項 {#notes}

- 線性化會重新排列 PDF 的內部結構，使第一頁能在整個檔案下載完成前就開始渲染。
- 由於加入了線性化資料，輸出檔案可能略大於輸入檔案。
- 已經線性化的 PDF 可再次線性化，不會有問題。
