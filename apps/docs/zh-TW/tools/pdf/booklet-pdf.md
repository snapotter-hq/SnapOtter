---
description: "排列 PDF 頁面以便摺疊成小冊子。"
i18n_source_hash: 8844b6d4fe96
i18n_provenance: human
i18n_output_hash: 71dd586b7b46
---

# 小冊子 PDF {#booklet-pdf}

以雙面列印方式拼版頁面，使列印出的紙張可摺疊成小冊子。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/pdf/booklet-pdf`

接受包含 PDF 檔案與 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| perSheet | integer | 否 | `2` | 每張紙的頁數：`2`、`4`、`6` 或 `8` |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/booklet-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 2}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## 注意事項 {#notes}

- 預設的 `perSheet: 2` 會在每張紙上並排放置兩頁，這是雙面列印的標準小冊子版面。
- 若總頁數不是紙張頁數的倍數，會自動加入空白頁。
- 以短邊裝訂的方式雙面列印輸出，然後摺疊並裝訂。
