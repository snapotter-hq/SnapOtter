---
description: "將 Markdown 檔案轉換為 Word 文件（DOCX）。"
i18n_source_hash: 979cb8ee13f2
i18n_provenance: human
i18n_output_hash: ca638a5a70be
---

# Markdown 轉 Word {#markdown-to-word}

將 Markdown 檔案轉換為 Word 文件（DOCX），保留標題、清單、程式碼區塊及其他格式。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-docx`

接受包含一個 Markdown 檔案的 multipart form data。

## Parameters {#parameters}

此工具沒有可設定的參數。上傳 Markdown 檔案，它就會被轉換為 DOCX。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-docx \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@README.md"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/README.docx",
  "originalSize": 4500,
  "processedSize": 18200
}
```

## Notes {#notes}

- 接受的輸入格式：`.md`、`.markdown`。
- 這是一個快速（同步）工具，會直接回傳結果。
- 標題、粗體、斜體、連結、程式碼區塊與清單都會對應至 Word 樣式。
- 轉換由伺服器上的 Pandoc 處理。
