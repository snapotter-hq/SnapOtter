---
description: "從 PDF 中刪除特定頁面。"
i18n_source_hash: 003e460a047c
i18n_provenance: human
i18n_output_hash: 1eb455bf183d
---

# 移除頁面 {#remove-pages}

從 PDF 中刪除特定頁面，並保持所有其餘頁面完整無缺。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/pdf/remove-pages`

接受包含 PDF 檔案與 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| pages | string | 是 | - | 以 qpdf 語法表示要移除的頁面範圍，例如 `"3,5-7"` |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/remove-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"pages": "3,5-7"}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 1800000
}
```

## 注意事項 {#notes}

- 你無法移除文件中的每一頁；至少必須保留一頁。
- 頁面範圍使用 qpdf 語法：`3` 代表單一頁面，`5-7` 代表一個範圍，並可用逗號組合（例如 `1,3,5-7`）。
