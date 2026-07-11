---
description: "將 Markdown 檔案轉換為獨立的 HTML 頁面。"
i18n_source_hash: 3ef805e8fc8c
i18n_provenance: human
i18n_output_hash: f343b45722eb
---

# Markdown 轉 HTML {#markdown-to-html}

將 Markdown 檔案轉換為獨立的 HTML 頁面。原始檔中引用的遠端影像會在輸出中原樣保留。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-html`

接受包含一個 Markdown 檔案的 multipart form data。

## Parameters {#parameters}

此工具沒有可設定的參數。上傳 Markdown 檔案，它就會被轉換為 HTML。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-html \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@notes.md"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/notes.html",
  "originalSize": 3200,
  "processedSize": 5800
}
```

## Notes {#notes}

- 接受的輸入格式：`.md`、`.markdown`。
- 這是一個快速（同步）工具，會直接回傳結果。
- 輸出是一個含內嵌樣式的自足式 HTML 頁面。
- Markdown 原始檔中的遠端影像 URL 會原樣保留，不會被抓取。
