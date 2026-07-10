---
description: "從 PDF 中擷取選定的頁面成為新文件。"
i18n_source_hash: e4a8fad31e0f
i18n_provenance: human
i18n_output_hash: bc4cace34137
---

# 擷取頁面 {#extract-pages}

從 PDF 中擷取選定的頁面，成為一份新的、較小的文件。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/pdf/extract-pages`

接受包含 PDF 檔案與 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| range | string | 是 | - | 以 qpdf 語法表示的頁面範圍，例如 `"1-5,8,10-z"` |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/extract-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"range": "1-5,8,10-z"}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 1100000
}
```

## 注意事項 {#notes}

- 頁面範圍使用 qpdf 語法：`1-5` 代表第 1 到第 5 頁，`z` 代表最後一頁，並可用逗號組合多個範圍（例如 `1-3,7,10-z`）。
- 擷取出的頁面會保留其原始的格式、註解與連結。
