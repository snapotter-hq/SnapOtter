---
description: "將 Word、Markdown、HTML 或純文字檔案轉換為 EPUB。"
i18n_source_hash: 63e1afa91c52
i18n_provenance: human
i18n_output_hash: 8653fa464907
---

# Convert to EPUB {#convert-to-epub}

將 Word 文件、Markdown、HTML 或純文字檔案轉換為 EPUB 電子書格式。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/to-epub`

接受包含 Word/Markdown/HTML/TXT 檔案的 multipart form data。

## Parameters {#parameters}

此工具沒有可設定的參數。上傳一個文件，它就會被轉換為 EPUB。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/to-epub \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@manuscript.docx"
```

## Example Response {#example-response}

回傳 `202 Accepted`。可透過 SSE 在 `/api/v1/jobs/{jobId}/progress` 追蹤進度。

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- 接受的輸入格式：`.docx`、`.md`、`.html`、`.txt`。
- EPUB 輸出遵循 EPUB 3 規範。
- 來源文件中的標題會用來產生目錄。
- 轉換由伺服器上的 Pandoc 處理。
