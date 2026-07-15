---
description: "在每張紙上排列多個 PDF 頁面（2 合 1、4 合 1 等）。"
i18n_source_hash: 972bf997c95c
i18n_provenance: human
i18n_output_hash: 92b5b8e56c3d
---

# 每張紙頁數 (N-up) {#n-up-pdf}

在每張紙上排列多個頁面以在列印時節省紙張，例如 2 合 1 或 4 合 1 版面配置。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/pdf/nup-pdf`

接受包含 PDF 檔案與 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| perSheet | integer | 否 | `2` | 每張紙的頁數：`2`、`3`、`4`、`8`、`9`、`12` 或 `16` |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/nup-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 4}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2300000
}
```

## 注意事項 {#notes}

- 頁面依閱讀順序排列（由左至右、由上至下）。
- 輸出頁面大小與原始相同；個別頁面會縮小以符合網格。
- 一份 20 頁的文件搭配 `perSheet: 4` 會產生 5 頁的輸出。
