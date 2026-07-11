---
description: "以明確的頁面順序重新排列 PDF 中的頁面。"
i18n_source_hash: e961fc895b4b
i18n_provenance: human
i18n_output_hash: 7458817ad64f
---

# 整理 PDF {#organize-pdf}

透過指定所需的頁面順序來重新排列 PDF 中的頁面。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/pdf/organize-pdf`

接受包含 PDF 檔案與 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| order | string | 是 | - | 以 qpdf 語法表示的所需頁面順序，例如 `"3,1,2,5-z"` |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/organize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"order": "3,1,2,5-z"}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## 注意事項 {#notes}

- 頁面範圍使用 qpdf 語法：`3,1,2` 會重新排列前三頁，而 `5-z` 會附加第 5 頁到最後一頁。
- 將頁面列出多次即可重複該頁（例如 `"1,1,2,3"` 會重複第 1 頁）。
- 未列於順序字串中的頁面會從輸出中省略。
