---
description: "將 PDF 中的頁面旋轉 90、180 或 270 度。"
i18n_source_hash: cc2acd091427
i18n_provenance: human
i18n_output_hash: 0791d0a44b35
---

# 旋轉 PDF {#rotate-pdf}

將 PDF 中的所有或選定頁面旋轉指定的角度。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/pdf/rotate-pdf`

接受包含 PDF 檔案與 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| angle | integer | 否 | `90` | 旋轉角度：`90`、`180` 或 `270` |
| range | string | 否 | `"1-z"` | 以 qpdf 語法表示的頁面範圍，例如 `"1-5,8"`（`"1-z"` = 所有頁面） |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/rotate-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"angle": 90, "range": "1-3"}'
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

- 旋轉方向為順時針。
- 頁面範圍使用 qpdf 語法：`1-5` 代表第 1 到第 5 頁，`z` 代表最後一頁，並可用逗號組合多個範圍。
- 預設範圍 `"1-z"` 會旋轉所有頁面。
