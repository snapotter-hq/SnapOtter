---
description: "以統一的邊界裁切 PDF 的所有頁面。"
i18n_source_hash: ffa1a2cee08d
i18n_provenance: human
i18n_output_hash: 161fa4ef30d7
---

# 裁切 PDF {#crop-pdf}

對 PDF 的所有頁面套用統一的邊界進行裁切，每一邊皆均等地修剪內容。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

接受包含 PDF 檔案與 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| margin | number | 否 | `20` | 以點（point）為單位的統一裁切邊界（0-2000） |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## 注意事項 {#notes}

- 邊界值以 PDF 點為單位（1 點 = 1/72 英吋）。
- 相同的邊界會套用到每一頁的四個邊。
- 邊界為 `0` 會移除所有現有的裁切邊界，顯示完整的媒體框（media box）。
